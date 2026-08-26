# Architecture

## Overview

This document describes the architectural changes required to add attendee invitation and single-occurrence exception to `calendar_events`. Both capabilities add a second and third egress path alongside the existing `event` CLI.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Client                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    tools/index.ts                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              handleToolCall()                        │    │
│  │  - Routes to appropriate handler                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              handlers/calendarHandlers.ts                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  handleUpdateCalendarEvent()                         │    │
│  │  handleDeleteCalendarEvent()                         │    │
│  │  - Validate input via Zod                            │    │
│  │  - Call calendarRepository                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              utils/calendarRepository.ts                     │
│  - Builds flag args, calls executeEventCli*                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  bin/event (EventKit)                        │
│  - attendees: READ ONLY, cannot be written at all            │
│  - one identifier per series, master resolves to DTSTART     │
└─────────────────────────────────────────────────────────────┘
```

---

## Proposed Architecture

### Change 1: Three Egress Paths

```
                       ┌──────────────────────────┐
                       │  calendarRepository.ts   │
                       └──────────────────────────┘
                          │         │          │
        default writes    │         │          │  occurrenceDate
                          ▼         │          ▼
                   ┌────────────┐   │   ┌──────────────────┐
                   │ bin/event  │   │   │ caldavOccurrence │
                   │ (EventKit) │   │   │  PROPFIND/GET/PUT│
                   └────────────┘   │   └──────────────────┘
                                    │            │
                        attendees   ▼            ▼
                     ┌──────────────────┐  ┌──────────────┐
                     │ osascript        │  │ iCloud CalDAV│
                     │ Calendar.app     │─▶│  RFC 6638    │
                     └──────────────────┘  └──────────────┘
```

Both new paths converge on iCloud. The attendee path reaches it indirectly — Calendar.app performs the local write and iCloud's server does the scheduling — while the occurrence path speaks CalDAV directly.

### Change 2: Write Responsibility Matrix

| Write | Path | Why not the CLI |
|-------|------|-----------------|
| title, dates, note, location, timezone | `event` CLI | Supported |
| delete (whole event or series) | `event` CLI | Supported |
| `span: future-events` | `event` CLI | Supported |
| `attendees` | Calendar.app scripting | `EKCalendarItem.attendees` is readonly in the SDK; no invitation API exists |
| `occurrenceDate` | CalDAV `EXDATE` | One identifier per series; `span: this-event` can only except the series start |

---

## Component Details

### 1. appleScriptAttendees.ts (new)

**Location:** `src/utils/appleScriptAttendees.ts`

Builds and runs the AppleScript. `execFile` is wrapped explicitly rather than with `promisify`, because `child_process.execFile` carries a `util.promisify.custom` implementation that resolves to `{ stdout, stderr }` while a mocked module does not — `promisify` would silently resolve to the bare stdout string and the shape would differ between test and production.

```typescript
export const escapeAppleScriptString = (value: string): string => {
  if (hasControlCharacter(value)) {
    throw new AppleScriptAttendeeError(
      'Value contains a control character and cannot be used in an AppleScript string.',
    );
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};
```

Backslashes are escaped before quotes, so an input ending in a backslash cannot consume the escape of the quote that follows it. Control characters are rejected outright rather than escaped: AppleScript string literals cannot span lines, and a silently mangled title would match the wrong event.

Error types: `AppleScriptAttendeeError`, and its subclasses `EventNotFoundError` and `AmbiguousEventError`.

### 2. caldavClient.ts (new)

**Location:** `src/utils/caldavClient.ts`

Minimal CalDAV transport. This is the first outbound-network code in the server and every request carries an HTTP Basic credential, so the origin check is load-bearing rather than a formality. It follows the shape of the binary-path pinning in `eventCli.ts`: narrow the allowlist to exactly the hosts we mean, and re-apply the check on every redirect hop rather than trusting the first validation to hold.

```typescript
const ALLOWED_HOST = /^(caldav\.icloud\.com|p\d+-caldav\.icloud\.com)$/;
const MAX_REDIRECTS = 5;
```

`assertAllowedCalDavUrl` uses `URL.hostname`, never a string split on the authority: userinfo of the form `https://caldav.icloud.com:443@evil.example/` makes a naive check read the allowed host while the request — and the `Authorization` header — goes to the attacker's. Userinfo is rejected outright rather than parsed around.

Error types: `CalDavError`, `CalDavAuthError` (401/403), `CalDavConflictError` (412).

### 3. caldavCredentials.ts (new)

**Location:** `src/utils/caldavCredentials.ts`

```typescript
export const KEYCHAIN_SERVICE = 'icloud-caldav-mcp';
```

Environment first so a deployment can inject; macOS Keychain second so an interactive machine needs no environment at all. Config is never a source. `MissingCalDavCredentialsError` names both environment variables and the exact `security add-generic-password` invocation.

### 4. icalendar.ts (new)

**Location:** `src/utils/icalendar.ts`

Deliberately not a general iCalendar parser. Attendee and EXDATE writes are read-modify-writes against resources authored by Calendar.app, so the governing constraint is that every property we do not understand survives untouched — VTIMEZONE, VALARM, TRANSP, X-APPLE-STRUCTURED-LOCATION and the TZID parameter on DTSTART all carry meaning that must not be normalized away. Operating on the unfolded line list makes that preservation the default.

Edits are component-aware. A line's meaning depends on which component encloses it: DTSTART inside VTIMEZONE is a zone transition rule, not the event's start, and DTSTAMP inside VALARM is not the event's stamp. Rewriting by property name alone silently corrupts both.

Exports: `unfold`, `fold`, `serialize`, `propName`, `getProperty`, `addAttendees`, `exceptOccurrence`.

`addAttendees` is the CalDAV attendee-write primitive. It is fully implemented and tested, including against a real-resource corpus, but is **not** wired into the shipped attendee path — see Change 1. It remains as the counterpart to `exceptOccurrence` and as the record of why the direct-CalDAV route was rejected.

### 5. caldavOccurrence.ts (new)

**Location:** `src/utils/caldavOccurrence.ts`

Discovers the collection (`current-user-principal` → `calendar-home-set` → `displayname` match), reads the resource, appends the EXDATE, and PUTs it back.

XML is scanned with narrow, tag-scoped helpers rather than a general parser: the repo ships zero runtime dependencies, and the shapes consumed are the two fixed PROPFIND responses rather than arbitrary documents.

```typescript
/**
 * The href nested inside a named element.
 *
 * Every DAV:response opens with its own href before any property, so scanning
 * the whole response for the first href returns the resource being described
 * rather than the one a property points at — which silently yields the
 * principal where the calendar home was wanted.
 */
const hrefInside = (xml: string, localName: string): string | undefined => {
  const inner = tagValue(xml, localName);
  return inner === undefined ? undefined : tagValue(inner, 'href');
};
```

`toICalStamp` uses the wall-clock portion of the ISO input verbatim, because converting through UTC produces a stamp that does not match the generated instance.

### 6. calendarRepository.ts Changes

**Location:** `src/utils/calendarRepository.ts`

Two methods added. Both resolve the event by id first, so the caller addresses it the same way as any other update or delete.

```typescript
async addAttendees(
  id: string,
  emails: string[],
): Promise<{ event: CalendarEvent; updated: number }> {
  const event = await this.findEventById(id);
  const { updated } = await addAttendeesToEvent({
    calendarName: event.calendar,
    summary: event.title,
    date: toDateOnly(event.startDate),
    attendees: emails.map((email) => ({ email })),
  });
  return { event, updated };
}
```

Calendar.app is driven by title and date, which is the only handle its scripting interface offers. `exceptOccurrence` additionally requires `event.externalId` — the iCalendar UID, which for iCloud is also the resource filename — and raises a `CliUserError` when it is absent.

### 7. schemas.ts Changes

**Location:** `src/validation/schemas.ts`

```typescript
const ATTENDEE_EMAIL = /^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/;

export const AttendeesSchema = z
  .array(
    z
      .string()
      .trim()
      .regex(ATTENDEE_EMAIL, 'Attendee must be a valid email address'),
  )
  .min(1, 'Provide at least one attendee')
  .max(VALIDATION.MAX_ATTENDEES, 'Too many attendees in a single call')
  .optional();
```

Deliberately shape-checked rather than RFC 5322-complete: the value is interpolated into an AppleScript string literal, so the job here is rejecting anything that plainly is not an address, while `escapeAppleScriptString` handles the quoting.

`UpdateCalendarEventSchema` gains `attendees`; `DeleteCalendarEventSchema` gains `occurrenceDate: SafeDateSchema`.

### 8. calendarHandlers.ts Changes

**Location:** `src/tools/handlers/calendarHandlers.ts`

`handleUpdateCalendarEvent` branches on `attendees` before the EventKit update, refusing a combined write. `handleDeleteCalendarEvent` branches on `occurrenceDate` before the CLI delete. Both branches return a message that names the consequence — an invitation was sent, or one occurrence was excepted and the series is otherwise unchanged.

---

## Data Flow Diagram

```mermaid
flowchart TD
    A[MCP Client] --> B[handleToolCall]
    B --> C{Tool + action}
    C -->|calendar_events update| D[handleUpdateCalendarEvent]
    C -->|calendar_events delete| E[handleDeleteCalendarEvent]

    D --> F{attendees present?}
    F -->|no| G[calendarRepository.updateEvent]
    F -->|yes, alone| H[calendarRepository.addAttendees]
    F -->|yes, with other fields| I[Refuse: no safe ordering]

    E --> J{occurrenceDate present?}
    J -->|no| K[calendarRepository.deleteEvent]
    J -->|yes| L[calendarRepository.exceptOccurrence]

    G --> M[executeEventCli -> bin/event]
    K --> M
    M --> N[EventKit]

    H --> O[appleScriptAttendees -> osascript]
    O --> P[Calendar.app]
    P --> Q[iCloud CalDAV: RFC 6638 scheduling]

    L --> R[resolveCalDavCredentials]
    R --> S[caldavOccurrence: PROPFIND/GET/PUT]
    S --> T[icalendar.exceptOccurrence: append EXDATE]
    T --> Q
```

---

## File Modification Summary

| File | Change Type |
|------|-------------|
| `src/utils/icalendar.ts` | New file - RFC 5545 line handling, attendee append, EXDATE |
| `src/utils/caldavClient.ts` | New file - CalDAV transport and origin allowlist |
| `src/utils/caldavCredentials.ts` | New file - env then Keychain resolution |
| `src/utils/caldavOccurrence.ts` | New file - collection discovery and occurrence exception |
| `src/utils/appleScriptAttendees.ts` | New file - Calendar.app attendee write |
| `src/utils/__mocks__/appleScriptAttendees.ts` | New file - test double |
| `src/utils/__mocks__/caldavClient.ts` | New file - test double |
| `src/utils/calendarRepository.ts` | Add `addAttendees()` and `exceptOccurrence()` |
| `src/validation/schemas.ts` | Add `AttendeesSchema`; extend update and delete schemas |
| `src/types/index.ts` | Add `attendees` and `occurrenceDate` to `CalendarToolArgs` |
| `src/types/repository.ts` | Add both methods to `ICalendarRepository` |
| `src/tools/definitions.ts` | Describe both parameters on `calendar_events` |
| `src/tools/handlers/calendarHandlers.ts` | Branch update and delete onto the new paths |
| `src/utils/constants.ts` | Add `MAX_ATTENDEES` |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Invitation sent for the wrong event | Low | High | Ambiguous title+date matches are refused, never guessed |
| Existing ATTENDEE dropped, server sends CANCEL | Low | High | Calendar.app owns the read-modify-write; the CalDAV primitive additionally never rewrites existing lines, and the corpus test asserts it |
| EXDATE silently excepts nothing | Medium | Medium | EXDATE mirrors DTSTART's parameters; a malformed stamp is refused rather than written |
| Spurious 412 from an inbound RSVP | Medium | Low | `If-Schedule-Tag-Match` preferred over `If-Match` |
| Credential leaked into a log or error | Low | High | Password never logged, never embedded in an error, never written to disk; asserted by test |
| Authorization header sent to a foreign host | Low | High | https-only allowlist on `URL.hostname`, userinfo refused, every redirect hop re-validated |
| No Automation grant (headless context) | Medium | Low | `osascript` failure is reported with the System Settings path to fix it |
| Combined attendee + field update races | Low | Medium | Refused with an explanation and the two-call remedy |
