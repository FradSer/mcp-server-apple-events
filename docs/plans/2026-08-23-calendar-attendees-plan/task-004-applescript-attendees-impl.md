# Task 004: AppleScript Attendees Implementation

## Feature

AppleScript Attendee Write - Add attendees to an existing Calendar.app event, which causes iCloud to send the invitation.

## BDD Scenario

```gherkin
Feature: Inviting Attendees

Scenario: Attendees are added through Calendar.app, not the CLI
  Given an existing event resolved by id
  When calendar_events update is called with attendees
  Then the addresses are written via Calendar.app scripting
  And no event CLI write is issued

Scenario: The script is one argv element, never a shell string
  Given any script content
  When osascript is invoked
  Then execFile is used with an argument array
  And no shell metacharacter can be interpreted

Feature: Refusing an Ambiguous Match

Scenario: Two events share a title and a date
  Given two events titled "Team standup" starting on the same day
  When attendees are added to that title and date
  Then an AmbiguousEventError is raised reporting the count
  And neither event is modified
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/appleScriptAttendees.ts` | Create the Calendar.app attendee-write module |

## Implementation Notes

1. Document the why in the module header. `EKCalendarItem.attendees` is `readonly` in the macOS SDK and there is no attendee-mutation or invitation API anywhere in EventKit — Apple models invitation delivery as the calendar server's job, which is why the framework exposes a read-only `EKParticipantScheduleStatus` to observe it. The `event` CLI is a pure EventKit wrapper and inherits that limitation.

2. Calendar.app's sdef marks attendee properties `access="r"`, which governs mutating an *existing* attendee. `make new attendee ... with properties` is a creation and is permitted. Writing the attendee locally makes iCloud's CalDAV server perform RFC 6638 scheduling and deliver the invitation.

3. Record the trade-off accepted: this requires Calendar.app and a TCC Automation grant, so it is unsuitable for headless contexts. It buys the absence of any credential and, more importantly, lets Calendar.app own the read-modify-write — CalDAV's only write primitive is whole-resource replacement, where dropping an existing ATTENDEE reads as removal and makes the server send cancellations, a class of failure that does not exist on this path.

4. Wrap `execFile` explicitly rather than with `promisify`. `child_process.execFile` carries a `util.promisify.custom` implementation that resolves to `{ stdout, stderr }`; a mocked module does not, so `promisify` would silently resolve to the bare stdout string and the shape would differ between test and production.

5. `escapeAppleScriptString` escapes backslashes before quotes, so an input ending in a backslash cannot consume the escape of the quote that follows it. Control characters are rejected outright rather than escaped: AppleScript string literals cannot span lines, and a silently mangled title would match the wrong event.

6. Scan for control characters by code point rather than with a regex literal — a character class containing literal control characters is itself flagged by the linter, and escaping around that would obscure the intent. Include U+2028/U+2029, which terminate a line for parsing purposes even though they are not C0 controls.

7. `buildAttendeeScript` returns sentinel strings rather than acting on an ambiguous match: Calendar.app can only be queried by title and start date, so two events sharing both are indistinguishable, and writing to the wrong one would send a real invitation for it. Map `NOTFOUND` → `EventNotFoundError` and `AMBIGUOUS:n` → `AmbiguousEventError`.

8. Validate the date as `YYYY-MM-DD` and each address for shape before assembling. Build the day window in AppleScript by zeroing the time components and adding 24 hours, so the match is date-scoped rather than instant-scoped.

9. On `osascript` failure, surface stderr and name the likely cause: System Settings → Privacy & Security → Automation.

## Verification

```bash
# Run the module's tests
pnpm test -- src/utils/appleScriptAttendees.test.ts

# Run the full suite to ensure no regressions
pnpm test

# Expected: all tests pass
```

## Dependencies

- **depends-on**: Task 004 Test (task-004-applescript-attendees-test.md)

## Commit

```
feat(attendees): invite addresses via calendar.app scripting
```
