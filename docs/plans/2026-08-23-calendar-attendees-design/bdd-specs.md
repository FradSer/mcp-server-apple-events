# BDD Specifications

## Overview

This document defines the behavior-driven development specifications for the attendee and occurrence-exception capabilities. Each scenario follows the Given-When-Then pattern.

---

## Feature: Inviting Attendees

### Scenario: Attendees are added through Calendar.app, not the CLI

```gherkin
Given an existing event resolved by id
When calendar_events update is called with attendees
Then the addresses are written via Calendar.app scripting
And no event CLI write is issued
```

### Scenario: Calendar.app is addressed by title and date

```gherkin
Given an event whose id resolves to title "Team standup" on 2026-09-21
When attendees are added
Then Calendar.app is queried by that title and that day
And the date is passed as a bare day, not a full timestamp
```

### Scenario: Every address is forwarded

```gherkin
Given an update carrying three attendee addresses
When attendees are added
Then all three are passed to the script
And one make new attendee line is emitted per address
```

### Scenario: Attendees must be updated alone

```gherkin
Given an update carrying both attendees and a new title
When the handler validates the arguments
Then the update is refused
And the message explains that the two travel through different subsystems
```

### Scenario: Attendees cannot be an empty list

```gherkin
Given an update carrying an empty attendees array
When the schema validates the arguments
Then validation fails with "Provide at least one attendee"
```

### Scenario: Too many attendees in one call

```gherkin
Given an update carrying more attendee addresses than MAX_ATTENDEES
When the schema validates the arguments
Then validation fails with "Too many attendees in a single call"
```

### Scenario: A non-address value is rejected before it reaches the script

```gherkin
Given an update carrying "not-an-address" as an attendee
When the schema validates the arguments
Then validation fails with "Attendee must be a valid email address"
```

### Scenario: A missing event is reported, not invented

```gherkin
Given an id that resolves to no event
When attendees are added
Then the not-found error propagates
And no invitation is sent
```

---

## Feature: Refusing an Ambiguous Match

### Scenario: Two events share a title and a date

```gherkin
Given two events titled "Team standup" starting on the same day
When attendees are added to that title and date
Then an AmbiguousEventError is raised reporting the count
And neither event is modified
```

### Scenario: No event matches the title and date

```gherkin
Given no event titled "Team standup" on 2026-09-21
When attendees are added
Then an EventNotFoundError is raised naming the title, date and calendar
```

---

## Feature: AppleScript String Safety

### Scenario: Double quotes are escaped

```gherkin
Given a title containing a double quote
When the script is built
Then the quote is escaped as \"
```

### Scenario: Backslashes are escaped before quotes

```gherkin
Given a title ending in a backslash before a quote
When the script is built
Then the backslash is doubled first
And it cannot consume the escape of the quote that follows
```

### Scenario: Control characters are rejected rather than escaped

```gherkin
Given a title containing a newline, carriage return, tab or null byte
When the script is built
Then an AppleScriptAttendeeError is raised
And no script is executed
```

### Scenario: Ordinary Unicode passes through intact

```gherkin
Given a title containing em dashes and CJK punctuation
When the script is built
Then the characters are left unchanged
```

### Scenario: The script is one argv element, never a shell string

```gherkin
Given any script content
When osascript is invoked
Then execFile is used with an argument array
And no shell metacharacter can be interpreted
```

---

## Feature: Excepting a Single Occurrence

### Scenario: EXDATE carries the same TZID as DTSTART

```gherkin
Given a recurring series whose DTSTART carries a TZID parameter
When an occurrence is excepted
Then the emitted EXDATE carries the identical parameter
And the wall clock is preserved rather than converted to UTC
```

### Scenario: A UTC series emits a UTC EXDATE

```gherkin
Given a recurring series whose DTSTART is a UTC stamp
When an occurrence is excepted
Then the emitted EXDATE is also a UTC stamp
```

### Scenario: The EXDATE lands inside the VEVENT

```gherkin
Given a resource with a VALARM after the event properties
When an occurrence is excepted
Then the EXDATE is written before END:VEVENT
And not appended after the component closes
```

### Scenario: An existing EXDATE is appended alongside, not replaced

```gherkin
Given a series that already excepts one occurrence
When a second occurrence is excepted
Then both EXDATE values survive
```

### Scenario: Excepting the same occurrence twice is idempotent

```gherkin
Given a series that already excepts 20260921T090000
When the same occurrence is excepted again
Then the line list is returned unchanged
```

### Scenario: SEQUENCE is bumped so the change reads as a revision

```gherkin
Given a series with SEQUENCE:0
When an occurrence is excepted
Then SEQUENCE is incremented
```

### Scenario: A non-recurring event has no occurrence to except

```gherkin
Given an event with no RRULE
When an occurrence is excepted
Then an error is raised saying there is no occurrence to except
```

### Scenario: A malformed stamp is refused rather than written

```gherkin
Given an occurrence value that is not YYYYMMDDTHHMMSS[Z]
When an occurrence is excepted
Then the invalid format is reported
And nothing is written
```

### Scenario: A resource with overrides is refused

```gherkin
Given a calendar object containing more than one VEVENT
When an occurrence is excepted
Then the resource is refused rather than mangled
```

### Scenario: An event with no external identifier cannot be located

```gherkin
Given an event whose externalId is absent
When occurrenceDate is supplied to delete
Then a CliUserError explains that only iCloud-synced events qualify
```

### Scenario: The wall clock is not converted through UTC

```gherkin
Given an occurrence ISO value carrying an offset
When toICalStamp converts it
Then the wall-clock portion is used verbatim
And no offset arithmetic is applied
```

---

## Feature: iCalendar Preservation

### Scenario: Unknown properties survive a round trip

```gherkin
Given a real Calendar.app resource with VTIMEZONE, TRANSP and X-APPLE-* lines
When it is unfolded and re-serialized
Then every line is preserved
```

### Scenario: The TZID parameter on DTSTART is not coerced to UTC

```gherkin
Given a DTSTART carrying TZID=America/New_York
When the resource round-trips
Then the parameter is unchanged
```

### Scenario: Folding is counted in octets

```gherkin
Given a line containing multi-byte characters longer than 75 octets
When it is folded
Then no character is split across a fold boundary
And no emitted line exceeds 75 octets
```

### Scenario: Edits are component-aware

```gherkin
Given a DTSTART inside a VTIMEZONE STANDARD block
And a DTSTAMP inside a VALARM
When a VEVENT-level edit is applied
Then neither nested property is rewritten
```

### Scenario: An existing ATTENDEE is never dropped

```gherkin
Given a resource that already carries attendees with SCHEDULE-STATUS
When an invitee is appended
Then every existing ATTENDEE line survives byte-identical
```

---

## Feature: CalDAV Transport

### Scenario: Plain http is refused

```gherkin
Given a CalDAV URL with an http scheme
When the URL is validated
Then the request is refused
```

### Scenario: A host outside the allowlist is refused

```gherkin
Given a URL pointing at a host that is not caldav.icloud.com or pN-caldav.icloud.com
When the URL is validated
Then the request is refused
```

### Scenario: A look-alike suffix host is refused

```gherkin
Given a URL whose host merely ends in caldav.icloud.com
When the URL is validated
Then the request is refused
```

### Scenario: Userinfo cannot smuggle a foreign host past the check

```gherkin
Given "https://caldav.icloud.com:443@evil.example/"
When the URL is validated
Then the URL is refused for containing userinfo
And the Authorization header never reaches evil.example
```

### Scenario: Redirects are re-validated, never followed automatically

```gherkin
Given a CalDAV request that receives a redirect
When the client processes it
Then redirect handling is manual
And the new target is re-checked against the allowlist
```

### Scenario: A redirect leaving the allowlist is refused

```gherkin
Given a redirect Location pointing outside the allowlist
When the client follows it
Then the request is refused
```

### Scenario: Repeated redirects give up rather than loop

```gherkin
Given a server that redirects indefinitely
When the client follows redirects
Then it stops after MAX_REDIRECTS and reports the limit
```

### Scenario: 401 is a credential problem, not a capability problem

```gherkin
Given a CalDAV request that returns 401
When the response is handled
Then a CalDAVAuthError is raised
And the message points at the app-specific password
```

### Scenario: 412 is reported as a stale-tag conflict

```gherkin
Given a CalDAV request that returns 412
When the response is handled
Then a CalDavConflictError is raised advising a re-read and retry
```

### Scenario: The password never appears in an error

```gherkin
Given any failing CalDAV request
When the error is formatted
Then the password does not appear in the message
```

### Scenario: Schedule-Tag is preferred over ETag

```gherkin
Given a resource read that returned a Schedule-Tag
When the PUT is issued
Then If-Schedule-Tag-Match is sent
And If-Match is not
```

### Scenario: ETag is used when no Schedule-Tag exists

```gherkin
Given a resource read that returned only an ETag
When the PUT is issued
Then If-Match is sent
```

### Scenario: SCHEDULE-STATUS is read in its quoted, multi-valued form

```gherkin
Given an ATTENDEE line whose SCHEDULE-STATUS is quoted and comma-separated
When the status is parsed
Then every value is returned
And the resource is not misreported as unscheduled
```

---

## Feature: Credential Resolution

### Scenario: The environment wins over the Keychain

```gherkin
Given ICLOUD_APPLE_ID and ICLOUD_APP_PASSWORD are both set
When credentials are resolved
Then the environment values are used
And the Keychain is not consulted
```

### Scenario: The Keychain fills in a missing password

```gherkin
Given only ICLOUD_APPLE_ID is set
When credentials are resolved
Then the password is read from the Keychain service icloud-caldav-mcp
```

### Scenario: Missing credentials give actionable setup guidance

```gherkin
Given neither the environment nor the Keychain holds a password
When credentials are resolved
Then the error names both env vars and the security add-generic-password command
```

### Scenario: No Apple ID configured at all

```gherkin
Given ICLOUD_APPLE_ID is unset
When credentials are resolved
Then a MissingCalDavCredentialsError is raised without consulting the Keychain
```

### Scenario: The password never appears in the error

```gherkin
Given a resolution that fails after a password was read
When the error is formatted
Then the password does not appear in the message
```

---

## Testing Strategy

### Unit Tests

- `icalendar.test.ts` - unfold/fold/serialize round trips, component isolation, attendee append
- `icalendarExdate.test.ts` - EXDATE emission, TZID mirroring, idempotence, refusals
- `caldavClient.test.ts` - origin allowlist, redirect re-validation, status mapping, conditional headers
- `caldavCredentials.test.ts` - env/Keychain precedence and non-disclosure
- `caldavOccurrence.test.ts` - collection discovery, resource href, PUT body and tags
- `appleScriptAttendees.test.ts` - escaping, script assembly, sentinel handling
- `calendarRepositoryAttendees.test.ts` - id resolution then title/date addressing, no CLI write

### Integration Tests

- `appleScriptAttendees.integration.test.ts` - live Calendar.app, gated on `APPLESCRIPT_E2E=1`
- `icalendar.corpus.test.ts` - invariants over a real `.ics` corpus, gated on `ICAL_CORPUS`

Both gates default to skipped. The attendee integration test is gated because adding an attendee to a real event causes iCloud to send real mail; the repo's existing `src/e2e.test.ts` is ungated and hits real EventKit on every `pnpm test`, and that precedent is deliberately not extended to anything that sends mail.

### Coverage Requirements

| Component | Target |
|-----------|--------|
| Statements | 93% |
| Branches | 78% |
| Functions | 97% |
| Lines | 94% |
