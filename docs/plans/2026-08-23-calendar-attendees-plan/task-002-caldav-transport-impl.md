# Task 002: CalDAV Transport Implementation

## Feature

CalDAV Transport - Minimal CalDAV client against iCloud, with the origin check as the load-bearing control.

## BDD Scenario

```gherkin
Feature: CalDAV Transport

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

Scenario: Schedule-Tag is preferred over ETag
  Given a resource read that returned a Schedule-Tag
  When the PUT is issued
  Then If-Schedule-Tag-Match is sent
  And If-Match is not
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/caldavClient.ts` | Create the transport module |

## Implementation Notes

1. Pin the allowlist to `caldav.icloud.com` and `pN-caldav.icloud.com`, anchored. This follows the shape of the binary-path pinning in `eventCli.ts`: narrow the allowlist to exactly the hosts we mean.

2. `assertAllowedCalDavUrl` must use `URL.hostname`, never a string split on the authority. Reject userinfo outright rather than parsing around it.

3. Set `redirect: 'manual'` and re-apply the allowlist check on every hop rather than trusting the first validation to hold. Resolve a relative `Location` against the current target before checking it, so a relative hop is validated rather than rejected as unparseable. Cap at `MAX_REDIRECTS`.

4. Map status codes to distinct error types:
   - 401/403 → `CalDavAuthError`, worded so it is never read as "CalDAV is unsupported"
   - 412 → `CalDavConflictError`, advising a re-read and retry
   - other 4xx/5xx → `CalDavError`

5. Prefer `If-Schedule-Tag-Match` over `If-Match`. Per RFC 6638 §3.2.10, once a resource has attendees an inbound RSVP changes the ETag without changing anything we care about, so `If-Match` produces spurious 412s.

6. `parseScheduleStatus` must handle the quoted, comma-separated form. Per RFC 6638 §3.2.9, `1.0` is Pending, `1.1` is Sent — explicitly without confirmation of delivery — and `1.2` is Delivered. Document that `1.1` means the server scheduled it, not that the recipient received anything.

7. Never place the password in an error message.

## Verification

```bash
# Run the transport tests
pnpm test -- src/utils/caldavClient.test.ts

# Run the full suite to ensure no regressions
pnpm test

# Expected: all tests pass
```

## Dependencies

- **depends-on**: Task 002 Test (task-002-caldav-transport-test.md)

## Commit

```
feat(caldav): add icloud transport with pinned origin allowlist
```
