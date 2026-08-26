# Task 002: CalDAV Transport Test

## Feature

CalDAV Transport - Specify the origin allowlist, redirect handling, status mapping, and conditional-header preference for the server's first outbound-network code.

## BDD Scenario

```gherkin
Feature: CalDAV Transport

Scenario: Plain http is refused
  Given a CalDAV URL with an http scheme
  When the URL is validated
  Then the request is refused

Scenario: A look-alike suffix host is refused
  Given a URL whose host merely ends in caldav.icloud.com
  When the URL is validated
  Then the request is refused

Scenario: Userinfo cannot smuggle a foreign host past the check
  Given "https://caldav.icloud.com:443@evil.example/"
  When the URL is validated
  Then the URL is refused for containing userinfo
  And the Authorization header never reaches evil.example

Scenario: Redirects are re-validated, never followed automatically
  Given a CalDAV request that receives a redirect
  When the client processes it
  Then redirect handling is manual
  And the new target is re-checked against the allowlist

Scenario: Repeated redirects give up rather than loop
  Given a server that redirects indefinitely
  When the client follows redirects
  Then it stops after MAX_REDIRECTS and reports the limit

Scenario: 401 is a credential problem, not a capability problem
  Given a CalDAV request that returns 401
  When the response is handled
  Then a CalDAVAuthError is raised
  And the message points at the app-specific password

Scenario: The password never appears in an error
  Given any failing CalDAV request
  When the error is formatted
  Then the password does not appear in the message

Scenario: Schedule-Tag is preferred over ETag
  Given a resource read that returned a Schedule-Tag
  When the PUT is issued
  Then If-Schedule-Tag-Match is sent
  And If-Match is not

Scenario: SCHEDULE-STATUS is read in its quoted, multi-valued form
  Given an ATTENDEE line whose SCHEDULE-STATUS is quoted and comma-separated
  When the status is parsed
  Then every value is returned
  And the resource is not misreported as unscheduled
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/caldavClient.test.ts` | Create transport and allowlist tests |
| `src/utils/__mocks__/caldavClient.ts` | Create the module test double |

## Implementation Notes

1. Mock `fetch`; assert on what was sent, not only on what came back. The `Authorization` header reaching the wrong host is the failure that matters, and it is invisible from the response.
2. Carry a regression comment on the userinfo case naming the bug it prevents — checking `netloc.split(':')` instead of `hostname` lets userinfo smuggle a foreign host past the check.
3. Assert `redirect: 'manual'` explicitly. An automatic redirect is not a behavior the response can reveal.
4. Cover both conditional-header branches: schedule tag present (expect `If-Schedule-Tag-Match`, expect no `If-Match`) and absent (expect `If-Match`).
5. The mock exports `request`, `assertAllowedCalDavUrl`, `parseScheduleStatus`, and all three error classes, so consumers can be tested against typed failures.

## Verification

```bash
# Run the transport tests
pnpm test -- src/utils/caldavClient.test.ts

# Expected: all transport and allowlist tests pass
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(caldav): specify origin allowlist and transport behavior
```
