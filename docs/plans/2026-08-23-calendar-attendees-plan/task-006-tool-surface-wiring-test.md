# Task 006: Tool Surface Wiring Test

## Feature

Tool Surface Wiring - Specify how the repository resolves an event by id and then addresses each subsystem, and that an attendee-only change never touches the CLI.

## BDD Scenario

```gherkin
Feature: Inviting Attendees

Scenario: Attendees are added through Calendar.app, not the CLI
  Given an existing event resolved by id
  When calendar_events update is called with attendees
  Then the addresses are written via Calendar.app scripting
  And no event CLI write is issued

Scenario: Calendar.app is addressed by title and date
  Given an event whose id resolves to title "Team standup" on 2026-09-21
  When attendees are added
  Then Calendar.app is queried by that title and that day
  And the date is passed as a bare day, not a full timestamp

Scenario: Every address is forwarded
  Given an update carrying three attendee addresses
  When attendees are added
  Then all three are passed to the script

Scenario: A missing event is reported, not invented
  Given an id that resolves to no event
  When attendees are added
  Then the not-found error propagates
  And no invitation is sent

Scenario: Attendees must be updated alone
  Given an update carrying both attendees and a new title
  When the handler validates the arguments
  Then the update is refused
  And the message explains that the two travel through different subsystems

Scenario: Attendees cannot be an empty list
  Given an update carrying an empty attendees array
  When the schema validates the arguments
  Then validation fails with "Provide at least one attendee"

Scenario: Too many attendees in one call
  Given an update carrying more attendee addresses than MAX_ATTENDEES
  When the schema validates the arguments
  Then validation fails with "Too many attendees in a single call"

Feature: Excepting a Single Occurrence

Scenario: An event with no external identifier cannot be located
  Given an event whose externalId is absent
  When occurrenceDate is supplied to delete
  Then a CliUserError explains that only iCloud-synced events qualify
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/calendarRepositoryAttendees.test.ts` | Create repository wiring tests |

## Implementation Notes

1. Mock `appleScriptAttendees` and `caldavClient` via their `__mocks__` entries, and mock `eventCli` as the existing repository tests do.

2. The load-bearing assertion is the negative one: an attendee-only change must issue no CLI write at all. A repository that also called `updateEvent` would still pass every positive assertion.

3. Assert the date is passed as a bare `YYYY-MM-DD`. Calendar.app is matched on a day window, and a full timestamp silently narrows it.

4. Assert the resolved event is returned alongside the count, since the handler's message quotes the event title.

5. Cover the schema bounds (`min(1)`, `max(MAX_ATTENDEES)`, address shape) as validation cases rather than repository cases — they must fail before any subsystem is reached.

## Verification

```bash
# Run the repository wiring tests
pnpm test -- src/utils/calendarRepositoryAttendees.test.ts

# Run all calendar tests
pnpm test -- src/utils/calendarRepository

# Expected: all wiring tests pass
```

## Dependencies

- **depends-on**: Task 004 Impl (task-004-applescript-attendees-impl.md)
- **depends-on**: Task 005 Impl (task-005-occurrence-exception-impl.md)

## Commit

```
test(calendar): verify attendee and occurrence routing
```
