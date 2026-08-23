# Task 005: Occurrence Exception Implementation

## Feature

Occurrence Exception - Except a single occurrence of a recurring series by appending an EXDATE over CalDAV.

## BDD Scenario

```gherkin
Feature: Excepting a Single Occurrence

Scenario: EXDATE carries the same TZID as DTSTART
  Given a recurring series whose DTSTART carries a TZID parameter
  When an occurrence is excepted
  Then the emitted EXDATE carries the identical parameter
  And the wall clock is preserved rather than converted to UTC

Scenario: Excepting the same occurrence twice is idempotent
  Given a series that already excepts 20260921T090000
  When the same occurrence is excepted again
  Then the line list is returned unchanged

Scenario: A resource with overrides is refused
  Given a calendar object containing more than one VEVENT
  When an occurrence is excepted
  Then the resource is refused rather than mangled
```

## Files to Modify

| File | Action |
|------|--------|
| `src/utils/icalendar.ts` | Add `exceptOccurrence()` |
| `src/utils/caldavOccurrence.ts` | Create the CalDAV occurrence module |

## Implementation Notes

1. Document the why. Every occurrence of a series shares one EventKit identifier, and resolving it yields the master, whose occurrence date is its own DTSTART. A delete with `span=this-event` therefore excepts the series start and nothing else — aimed at any later occurrence it writes nothing and still reports success. EXDATE names the instant directly.

2. In `exceptOccurrence`, mirror DTSTART's parameters onto the EXDATE. The EXDATE must carry the same value type and TZID as DTSTART — a floating or differently-zoned EXDATE will not match the generated instance and the occurrence stays put. Slice the parameter string off DTSTART rather than reconstructing it.

3. Validate the stamp against `YYYYMMDDTHHMMSS[Z]` and refuse anything else rather than writing it.

4. Refuse a non-recurring event (no RRULE — there is no occurrence to except) and a multi-VEVENT resource (the series already has overrides, which this does not model).

5. Return the line list unchanged when the occurrence is already excepted. Bump SEQUENCE only when a line is actually added.

6. In `caldavOccurrence.ts`, resolve the collection through the standard chain: `current-user-principal` → `calendar-home-set` → Depth-1 listing matched on `displayname`.

7. Read the XML with narrow, tag-scoped helpers rather than a general parser: the repo ships zero runtime dependencies, and the shapes consumed are the two fixed PROPFIND responses rather than arbitrary documents. Scope the href lookup *inside* the named element — every DAV:response opens with its own href before any property, so scanning the whole response returns the resource being described rather than the one the property points at, which silently yields the principal where the calendar home was wanted.

8. `toICalStamp` uses the wall-clock portion of the ISO input verbatim. An occurrence of a TZID-qualified series is identified by local wall time, so converting through UTC would produce a stamp that does not match the generated instance and the EXDATE would silently fail to except anything.

9. Build the resource href as `<collection>/<uid>.ics` — for iCloud the iCalendar UID is also the resource filename. Carry both the ETag and the Schedule-Tag from the GET into the PUT so `caldavClient` can pick the right conditional header.

## Verification

```bash
# Run the EXDATE tests
pnpm test -- src/utils/icalendarExdate.test.ts

# Run the CalDAV round-trip tests
pnpm test -- src/utils/caldavOccurrence.test.ts

# Run the full suite to ensure no regressions
pnpm test

# Expected: all tests pass
```

## Dependencies

- **depends-on**: Task 005 Test (task-005-occurrence-exception-test.md)

## Commit

```
feat(occurrence): except one occurrence via caldav exdate
```
