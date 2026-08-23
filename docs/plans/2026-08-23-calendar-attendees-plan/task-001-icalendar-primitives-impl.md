# Task 001: iCalendar Primitives Implementation

## Feature

iCalendar Line Primitives - RFC 5545 line handling and VEVENT attendee editing, built for preservation rather than comprehension.

## BDD Scenario

```gherkin
Feature: iCalendar Preservation

Scenario: Unknown properties survive a round trip
  Given a real Calendar.app resource with VTIMEZONE, TRANSP and X-APPLE-* lines
  When it is unfolded and re-serialized
  Then every line is preserved

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
| `src/utils/icalendar.ts` | Create the line-handling module |

## Implementation Notes

1. Export `unfold`, `fold`, `serialize`, `propName`, `getProperty`, `addAttendees`.

2. Operate on the unfolded line list throughout. Preservation of unknown properties is the governing constraint — VTIMEZONE, VALARM, TRANSP, X-APPLE-STRUCTURED-LOCATION and the TZID parameter on DTSTART all carry meaning that must not be normalized away. An object model would lose them by default; a line list keeps them by default.

3. Fold at 75 octets, counted with `Buffer.byteLength`, and spend one octet on the leading space of each continuation. Counting characters splits multi-byte sequences.

4. Track the enclosing component per line index. A line's meaning depends on which component encloses it: DTSTART inside VTIMEZONE is a zone transition rule, DTSTAMP inside VALARM is not the event's stamp. Match on property name alone and both are silently corrupted.

5. In `addAttendees`, never rewrite an existing ATTENDEE — only append. Handle both shapes: an event with no ORGANIZER gains one plus a CHAIR attendee that has already accepted; an event Calendar.app already promoted gains only the new invitee.

6. Write ORGANIZER as a principal URL with the address in an `EMAIL` parameter. That is the form Calendar.app writes and the form iCloud stamps SCHEDULE-STATUS against; a `mailto:` value is unproven for writes.

7. Bump SEQUENCE and refresh DTSTAMP on the event, and only on the event.

8. Refuse rather than mangle: no VEVENT, more than one VEVENT, or any recurrence property present in the VEVENT. Apple derives one external identifier for every instance, so the target instance cannot be addressed unambiguously.

9. Document in the module header that this is deliberately not a general iCalendar parser, and why.

## Verification

```bash
# Run the module's tests
pnpm test -- src/utils/icalendar.test.ts

# Run the full suite to ensure no regressions
pnpm test

# Expected: all tests pass
```

## Dependencies

- **depends-on**: Task 001 Test (task-001-icalendar-primitives-test.md)

## Commit

```
feat(icalendar): add rfc 5545 line handling and attendee append
```
