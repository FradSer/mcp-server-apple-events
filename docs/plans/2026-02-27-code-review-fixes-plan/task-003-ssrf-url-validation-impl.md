# Task 003: SSRF URL Validation Implementation

## Feature

SSRF URL Protection - Enhance regex to block IPv6 loopback, link-local, and cloud metadata endpoints.

## BDD Scenario

```gherkin
Feature: SSRF URL Protection

Scenario: Block IPv6 loopback
  Given a user provides url="http://[::1]/admin"
  When the URL is validated
  Then validation fails with "not allowed" error

Scenario: Allow public URLs
  Given a user provides url="https://example.com/page"
  When the URL is validated
  Then validation passes
```

## Files to Modify

| File | Action |
|------|--------|
| `src/validation/schemas.ts` | Enhance `URL_PATTERN` regex |

## Implementation Notes

1. Replace the existing `URL_PATTERN` with an enhanced version that blocks:

   **IPv4 ranges:**
   - `127.x.x.x` (loopback)
   - `192.168.x.x` (private)
   - `10.x.x.x` (private)
   - `172.16-31.x.x` (private)
   - `169.254.x.x` (link-local)
   - `0.0.0.0` (unspecified)
   - `localhost`

   **IPv6 ranges:**
   - `::1` (loopback)
   - `::` (unspecified)
   - `fe80::/10` (link-local)

   **Cloud metadata:**
   - `169.254.169.254` (AWS/Azure)
   - `100.100.100.200` (Alibaba)
   - `metadata.google.internal` (GCP)

2. Use `new RegExp()` constructor for better readability with complex pattern

3. Update the JSDoc comment to document blocked ranges

## Verification

```bash
# Run the schemas tests
pnpm test -- src/validation/schemas.test.ts

# Expected: All SSRF tests pass, no regressions in existing URL tests
```

## Dependencies

- **depends-on**: Task 003 Test (task-003-ssrf-url-validation-test.md)

## Commit

```
fix(schemas): enhance SSRF URL validation for IPv6 and cloud metadata
```
