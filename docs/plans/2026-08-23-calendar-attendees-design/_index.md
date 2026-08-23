# Calendar Attendees and Occurrence Exception Design

## Context

This design adds two write capabilities to the `calendar_events` tool that the vendored `event` CLI cannot express, because EventKit itself cannot express them. Both route around the CLI rather than extending it.

`EKCalendarItem.attendees` is `readonly` in the macOS SDK, and there is no attendee-mutation or invitation API anywhere in EventKit. Apple models invitation delivery as the calendar server's job, which is why the framework exposes a read-only `EKParticipantScheduleStatus` to observe it rather than a method to trigger it. A pure EventKit wrapper inherits that limitation, so no upstream `event` flag can close this gap.

Separately, every occurrence of a recurring series shares one EventKit identifier. Resolving that identifier returns the master, whose occurrence date is its own `DTSTART`. A delete with `span: this-event` therefore excepts the series start and nothing else — aimed at any later occurrence it writes nothing and still reports success.

## Requirements

### Capabilities (2)

1. **`attendees: string[]` on `action: "update"`** - Invite addresses to an existing event, with the invitation actually delivered.
2. **`occurrenceDate: string` on `action: "delete"`** - Except exactly one occurrence of a recurring series, leaving the rest intact.

### Supporting Concerns (5)

3. **Transport for CalDAV** - First outbound network code in the server; every request carries a credential.
4. **Credential resolution** - Environment then macOS Keychain, never config, never logged.
5. **iCalendar line handling** - Read-modify-write against resources authored by Calendar.app, where unknown properties must survive untouched.
6. **Ambiguity refusal** - Calendar.app can only be queried by title and start date; two events sharing both are indistinguishable.
7. **Concurrency boundary** - Attendee writes and EventKit writes have no shared token, so a combined update has no defined ordering.

## Rationale

### User Decisions

| Issue | Decision | Rationale |
|-------|----------|-----------|
| Attendee write path | Calendar.app AppleScript | The sdef marks attendee properties `access="r"`, which governs mutating an *existing* attendee; `make new attendee ... with properties` is a creation and is permitted. Calendar.app owns the read-modify-write, so no ATTENDEE can be dropped |
| Attendee write path (rejected) | Direct CalDAV `PUT` | Built and tested (`icalendar.addAttendees`), then not wired. CalDAV's only write primitive is whole-resource replacement, where dropping an existing ATTENDEE reads as removal and makes the server send cancellations |
| Occurrence exception | CalDAV `EXDATE` append | EventKit cannot address a single occurrence at all. `EXDATE` names the instant directly |
| Combined attendee + field update | Refuse | Two subsystems, no shared concurrency token, therefore no safe ordering |
| Ambiguous event match | Refuse | Writing to the wrong event sends a real invitation for it |
| Conditional request header | `If-Schedule-Tag-Match` over `If-Match` | An inbound RSVP changes the ETag without being scheduling-significant, so `If-Match` produces spurious 412s |
| Credential source | Env, then Keychain | A deployment can inject; an interactive machine needs no environment. Config is never a source |

### Constraints

- No new runtime dependencies (no XML parser, no iCalendar library, no CalDAV client)
- No changes to the `event` CLI or the `vendor/event` submodule pin
- Existing `calendar_events` behavior unchanged when neither parameter is supplied
- Unknown iCalendar properties must round-trip byte-identical
- Follow existing code patterns and conventions

## Detailed Design

### 1. Attendee Routing

```
Existing:
calendar_events update -> calendarRepository -> event CLI -> EventKit

Added (attendees only):
calendar_events update -> calendarRepository -> osascript -> Calendar.app
                                                                 |
                                                          iCloud CalDAV
                                                          (RFC 6638 scheduling)
```

Writing the attendee locally makes iCloud's CalDAV server perform the scheduling and send the invitation. Verified live: `SCHEDULE-STATUS=1.1` on the resource plus real iMIP mail from `noreply@email.apple.com`.

### 2. Occurrence Exception Routing

```
Added (occurrenceDate supplied):
calendar_events delete -> calendarRepository -> CalDAV PROPFIND/GET/PUT -> iCloud
```

The event is resolved by id first so the caller addresses it exactly as any other delete. `externalId` is the iCalendar UID, which for iCloud is also the resource filename.

### 3. Attendees Must Stand Alone

```typescript
// Attendees and EventKit fields travel through different subsystems with
// no shared concurrency token, so a combined write would have no defined
// ordering. Requiring attendees to stand alone keeps each call atomic.
if (validatedArgs.attendees && validatedArgs.attendees.length > 0) {
  const others = [
    validatedArgs.title,
    validatedArgs.startDate,
    validatedArgs.endDate,
    validatedArgs.note,
    validatedArgs.location,
    validatedArgs.timezone,
  ].filter((value) => value !== undefined);
  if (others.length > 0) {
    throw new Error(
      'Update attendees on their own. Adding attendees goes through ' +
        'Calendar.app while other fields go through EventKit, so a ' +
        'combined update has no safe ordering. Issue two calls.',
    );
  }
  // ...
}
```

### 4. Ambiguity Is Refused, Not Guessed

The AppleScript returns sentinel strings rather than acting on a multi-match:

```applescript
if (count of matches) is 0 then
  return "NOTFOUND"
end if
if (count of matches) is greater than 1 then
  return "AMBIGUOUS:" & (count of matches)
end if
```

`NOTFOUND` becomes `EventNotFoundError`, `AMBIGUOUS:n` becomes `AmbiguousEventError`.

### 5. EXDATE Mirrors DTSTART's TZID

```typescript
// Mirror DTSTART's parameters so the EXDATE refers to the same wall clock.
const dtstart = lines.find((l, i) => inEvent(i) && propName(l) === 'DTSTART');
const params = dtstart
  ? dtstart.slice('DTSTART'.length, dtstart.indexOf(':'))
  : '';
const exdate = `EXDATE${params}:${occurrenceStart}`;
```

An occurrence of a TZID-qualified series is identified by local wall time. A UTC-converted stamp matches no generated instance, so the `EXDATE` silently excepts nothing. `toICalStamp` therefore takes the wall-clock portion of the ISO input verbatim.

### 6. Conditional Request Preference

```typescript
// RFC 6638 §3.2.10: once a resource has attendees, an inbound RSVP changes the
// ETag without changing anything we care about, so If-Match produces spurious
// 412s. Schedule-Tag only changes on scheduling-significant edits.
if (options.scheduleTag) {
  headers.set('if-schedule-tag-match', options.scheduleTag);
} else if (options.etag) {
  headers.set('if-match', options.etag);
}
```

### 7. Credential Resolution

```typescript
const appleId = process.env.ICLOUD_APPLE_ID;
if (!appleId) throw new MissingCalDavCredentialsError();

const password =
  process.env.ICLOUD_APP_PASSWORD || (await fromKeychain(appleId));
if (!password) throw new MissingCalDavCredentialsError(appleId);
```

The Keychain read shells `security find-generic-password` against the service `icloud-caldav-mcp`. The password is returned to the caller and never logged, never embedded in an error, and never written to disk by this module.

## Design Documents

- [BDD Specifications](./bdd-specs.md) - Behavior scenarios and testing strategy
- [Architecture](./architecture.md) - System architecture and component details
- [Best Practices](./best-practices.md) - Security, correctness, and code quality guidelines

## Success Criteria

1. Both capabilities work against live iCloud, verified end to end
2. Existing `calendar_events` behavior unchanged when neither parameter is supplied
3. Test coverage stays above thresholds (93% statements, 78% branches, 97% functions, 94% lines)
4. No new runtime dependencies
5. All existing tests pass
6. `pnpm check` passes (lint + typecheck)
