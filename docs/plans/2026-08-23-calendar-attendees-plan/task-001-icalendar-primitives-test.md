# Task 001: iCalendar Primitives Test

## Feature

iCalendar Line Primitives - Specify unfolding, folding, component-aware property access, and attendee append against resources authored by Calendar.app.

## BDD Scenario

```gherkin
Feature: iCalendar Preservation

Scenario: Unknown properties survive a round trip
  Given a real Calendar.app resource with VTIMEZONE, TRANSP and X-APPLE-* lines
  When it is unfolded and re-serialized
  Then every line is preserved

Scenario: The TZID parameter on DTSTART is not coerced to UTC
  Given a DTSTART carrying TZID=America/New_York
  When the resource round-trips
  Then the parameter is unchanged

Scenario: Folding is counted in octets
  Given a line containing multi-byte characters longer than 75 octets
  When it is folded
  Then no character is split across a fold boundary
  And no emitted line exceeds 75 octets

Scenario: Edits are component-aware
  Given a DTSTART inside a VTIMEZONE STANDARD block
  And a DTSTAMP inside a VALARM
  When a VEVENT-level edit is applied
  Then neither nested property is rewritten

Scenario: An existing ATTENDEE is never dropped
  Given a resource that already carries attendees with SCHEDULE-STATUS
  When an invitee is appended
  Then every existing ATTENDEE line survives byte-identical
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/icalendar.test.ts` | Create unit tests over a real fixture resource |
| `src/utils/icalendar.corpus.test.ts` | Create invariant tests over a real `.ics` corpus |

## Implementation Notes

1. Use a real Calendar.app-authored resource as the fixture, not a hand-written minimal one. The properties that must survive are exactly the ones a synthetic fixture omits.
2. Cover three attendee shapes: a plain event gaining ORGANIZER for the first time, an event Calendar.app already promoted to a meeting, and a resource that must be refused (multi-VEVENT, recurring).
3. Assert insertion position, not just presence — an ATTENDEE appended after `END:VEVENT` is not in the event.
4. Gate the corpus test on `ICAL_CORPUS` pointing at a directory of `.ics` files, and `describe.skip` when it is unset. The corpus is a user's actual calendar and cannot live in the repo.
5. State the stakes in the corpus test header: CalDAV's only write primitive is whole-resource replacement, so a dropped ATTENDEE is read by the server as removal and makes it send a CANCEL. A rewrite bug is a silent mass-cancel, not a failed write.

## Verification

```bash
# Run the unit tests
pnpm test -- src/utils/icalendar.test.ts

# Run the corpus invariants against a real calendar export
ICAL_CORPUS=/path/to/ics pnpm test -- src/utils/icalendar.corpus.test.ts

# Expected: unit tests pass; corpus tests pass or skip silently
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(icalendar): specify line handling and attendee append
```
