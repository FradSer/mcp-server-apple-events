# Task 005: Occurrence Exception Test

## Feature

Occurrence Exception - Specify EXDATE emission, TZID mirroring, idempotence, and the CalDAV round trip that carries it.

## BDD Scenario

```gherkin
Feature: Excepting a Single Occurrence

Scenario: EXDATE carries the same TZID as DTSTART
  Given a recurring series whose DTSTART carries a TZID parameter
  When an occurrence is excepted
  Then the emitted EXDATE carries the identical parameter
  And the wall clock is preserved rather than converted to UTC

Scenario: A UTC series emits a UTC EXDATE
  Given a recurring series whose DTSTART is a UTC stamp
  When an occurrence is excepted
  Then the emitted EXDATE is also a UTC stamp

Scenario: The EXDATE lands inside the VEVENT
  Given a resource with a VALARM after the event properties
  When an occurrence is excepted
  Then the EXDATE is written before END:VEVENT

Scenario: An existing EXDATE is appended alongside, not replaced
  Given a series that already excepts one occurrence
  When a second occurrence is excepted
  Then both EXDATE values survive

Scenario: Excepting the same occurrence twice is idempotent
  Given a series that already excepts 20260921T090000
  When the same occurrence is excepted again
  Then the line list is returned unchanged

Scenario: A non-recurring event has no occurrence to except
  Given an event with no RRULE
  When an occurrence is excepted
  Then an error is raised saying there is no occurrence to except

Scenario: A malformed stamp is refused rather than written
  Given an occurrence value that is not YYYYMMDDTHHMMSS[Z]
  When an occurrence is excepted
  Then the invalid format is reported
  And nothing is written

Scenario: The wall clock is not converted through UTC
  Given an occurrence ISO value carrying an offset
  When toICalStamp converts it
  Then the wall-clock portion is used verbatim
  And no offset arithmetic is applied

Scenario: The resource href is built from the UID
  Given an event whose externalId is its iCalendar UID
  When the occurrence is excepted over CalDAV
  Then the resource href is the collection href plus <uid>.ics

Scenario: The schedule tag is carried through
  Given a resource read that returned a Schedule-Tag
  When the modified resource is PUT
  Then If-Schedule-Tag-Match is sent so an RSVP cannot cause a false conflict
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/icalendarExdate.test.ts` | Create EXDATE emission tests |
| `src/utils/caldavOccurrence.test.ts` | Create collection-discovery and round-trip tests |

## Implementation Notes

1. Keep the EXDATE tests separate from `icalendar.test.ts`. They exercise a distinct failure mode — a well-formed write that matches no instance — and mixing them into the attendee suite obscures that.

2. Assert the emitted parameter string, not just that an `EXDATE` line exists. A floating or differently-zoned EXDATE is syntactically valid, PUTs successfully, and excepts nothing.

3. Cover both series shapes: TZID-qualified and UTC. They require opposite handling and each is wrong for the other.

4. Assert VTIMEZONE is preserved untouched. It is the component most likely to be collateral damage from a naive line rewrite.

5. In `caldavOccurrence.test.ts`, mock `caldavClient` and assert the PROPFIND chain resolves principal → calendar-home-set → collection by display name, and that a similarly-named calendar does not match.

6. Assert the PUT body carries the new EXDATE with the series TZID — the end-to-end property, not just the unit one.

## Verification

```bash
# Run the EXDATE tests
pnpm test -- src/utils/icalendarExdate.test.ts

# Run the CalDAV round-trip tests
pnpm test -- src/utils/caldavOccurrence.test.ts

# Expected: all occurrence tests pass
```

## Dependencies

- **depends-on**: Task 001 Impl (task-001-icalendar-primitives-impl.md)
- **depends-on**: Task 002 Impl (task-002-caldav-transport-impl.md)

## Commit

```
test(occurrence): specify exdate emission and caldav round trip
```
