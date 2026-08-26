# Task 004: AppleScript Attendees Test

## Feature

AppleScript Attendee Write - Specify string escaping, script assembly, sentinel handling, and the refusal to guess between ambiguous matches.

## BDD Scenario

```gherkin
Feature: AppleScript String Safety

Scenario: Backslashes are escaped before quotes
  Given a title ending in a backslash before a quote
  When the script is built
  Then the backslash is doubled first
  And it cannot consume the escape of the quote that follows

Scenario: Control characters are rejected rather than escaped
  Given a title containing a newline, carriage return, tab or null byte
  When the script is built
  Then an AppleScriptAttendeeError is raised
  And no script is executed

Scenario: Ordinary Unicode passes through intact
  Given a title containing em dashes and CJK punctuation
  When the script is built
  Then the characters are left unchanged

Feature: Refusing an Ambiguous Match

Scenario: Two events share a title and a date
  Given two events titled "Team standup" starting on the same day
  When attendees are added to that title and date
  Then an AmbiguousEventError is raised reporting the count
  And neither event is modified

Scenario: No event matches the title and date
  Given no event titled "Team standup" on 2026-09-21
  When attendees are added
  Then an EventNotFoundError is raised naming the title, date and calendar

Feature: Inviting Attendees

Scenario: Every address is forwarded
  Given an update carrying three attendee addresses
  When attendees are added
  Then all three are passed to the script
  And one make new attendee line is emitted per address

Scenario: A non-address value is rejected before it reaches the script
  Given "not-an-address" as an attendee
  When the script is built
  Then an AppleScriptAttendeeError names the invalid address
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/appleScriptAttendees.test.ts` | Create escaping, assembly and sentinel tests |
| `src/utils/appleScriptAttendees.integration.test.ts` | Create the live Calendar.app test, gated |
| `src/utils/__mocks__/appleScriptAttendees.ts` | Create the module test double |

## Implementation Notes

1. Escaping gets the most coverage. The script is assembled by interpolating user-supplied text — calendar names, event titles, addresses — into an AppleScript source string, so escaping is the primary risk on this path.

2. Mock `node:child_process` and drive the three sentinel outputs (`NOTFOUND`, `AMBIGUOUS:n`, `OK:n`) plus the `osascript` failure case. Assert the failure message points at System Settings → Privacy & Security → Automation, since a missing TCC grant is the most likely real-world failure.

3. Test `buildAttendeeScript` separately from `addAttendeesToEvent`. Assembly failures should be provable without any subprocess.

4. Gate the integration test on `APPLESCRIPT_E2E=1`. It requires a GUI session and a TCC Automation grant, and adding an attendee to a real event causes iCloud to send a real invitation. The repo's existing `src/e2e.test.ts` is ungated and hits real EventKit on every `pnpm test`; that precedent is deliberately not extended to anything that sends mail.

5. The integration test asserts only the two refusal paths — ambiguous and not-found — so a live run cannot itself send mail. Note the two fixture events it expects.

6. The mock exports `addAttendeesToEvent` plus all three error classes, so the repository can be tested against typed failures.

## Verification

```bash
# Run the unit tests
pnpm test -- src/utils/appleScriptAttendees.test.ts

# Run the live test against Calendar.app
APPLESCRIPT_E2E=1 pnpm test -- src/utils/appleScriptAttendees.integration.test.ts

# Expected: unit tests pass; integration tests pass or skip silently
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(attendees): specify applescript escaping and match refusal
```
