# Task 006: Tool Surface Wiring Implementation

## Feature

Tool Surface Wiring - Expose `attendees` on update and `occurrenceDate` on delete, and route each to its subsystem.

## BDD Scenario

```gherkin
Feature: Inviting Attendees

Scenario: Attendees must be updated alone
  Given an update carrying both attendees and a new title
  When the handler validates the arguments
  Then the update is refused
  And the message explains that the two travel through different subsystems

Scenario: A non-address value is rejected before it reaches the script
  Given an update carrying "not-an-address" as an attendee
  When the schema validates the arguments
  Then validation fails with "Attendee must be a valid email address"

Feature: Excepting a Single Occurrence

Scenario: An event with no external identifier cannot be located
  Given an event whose externalId is absent
  When occurrenceDate is supplied to delete
  Then a CliUserError explains that only iCloud-synced events qualify
```

## Files to Modify

| File | Action |
|------|--------|
| `src/utils/constants.ts` | Add `MAX_ATTENDEES` to `VALIDATION` |
| `src/validation/schemas.ts` | Add `AttendeesSchema`; extend update and delete schemas |
| `src/types/index.ts` | Add `attendees` and `occurrenceDate` to `CalendarToolArgs` |
| `src/types/repository.ts` | Add both methods to `ICalendarRepository` |
| `src/utils/calendarRepository.ts` | Add `addAttendees()` and `exceptOccurrence()` |
| `src/tools/definitions.ts` | Describe both parameters on `calendar_events` |
| `src/tools/handlers/calendarHandlers.ts` | Branch update and delete onto the new paths |

## Implementation Notes

1. `AttendeesSchema` is deliberately shape-checked rather than RFC 5322-complete: the value is interpolated into an AppleScript string literal, so the job here is rejecting anything that plainly is not an address, while `escapeAppleScriptString` handles the quoting. Bound it with `min(1)` and `max(VALIDATION.MAX_ATTENDEES)`.

2. `DeleteCalendarEventSchema` gains `occurrenceDate: SafeDateSchema`, so it inherits the same date handling as every other date field on the tool.

3. In `handleUpdateCalendarEvent`, branch on attendees *before* the EventKit update and refuse a combined write. Attendees and EventKit fields travel through different subsystems with no shared concurrency token, so a combined write would have no defined ordering; requiring attendees to stand alone keeps each call atomic. Name the remedy — issue two calls — rather than only the problem.

4. In `handleDeleteCalendarEvent`, branch on `occurrenceDate` before the CLI delete.

5. Both success messages should name the consequence, not just the mechanism: adding an attendee sends a real invitation and links the event so later moves and deletions propagate; excepting an occurrence leaves the rest of the series unchanged. The caller cannot see either from the tool result otherwise.

6. In the repository, resolve the event by id first on both paths, so the caller addresses it the same way as any other update — by id — while Calendar.app is driven by title and date, which is the only handle its scripting interface offers.

7. `exceptOccurrence` requires `event.externalId`. Raise a `CliUserError` naming the reason when it is absent: only iCloud-synced events have a CalDAV resource to locate.

8. In `definitions.ts`, mark each parameter with the action it belongs to ("Update only", "Delete only") — the tool takes a single argument bag, so the schema alone does not convey it.

## Verification

```bash
# Run the wiring tests
pnpm test -- src/utils/calendarRepositoryAttendees.test.ts

# Run the validation and tool tests
pnpm test -- src/validation/ src/tools/

# Run the full suite to ensure no regressions
pnpm test

# Expected: all tests pass
```

## Dependencies

- **depends-on**: Task 006 Test (task-006-tool-surface-wiring-test.md)
- **depends-on**: Task 003 Impl (task-003-caldav-credentials-impl.md)

## Commit

```
feat(calendar): add attendees to update and occurrenceDate to delete
```
