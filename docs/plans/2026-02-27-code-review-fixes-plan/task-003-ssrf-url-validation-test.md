# Task 003: SSRF URL Validation Test

## Feature

SSRF URL Protection - Add tests to verify that the enhanced URL pattern blocks all known bypass vectors.

## BDD Scenario

```gherkin
Feature: SSRF URL Protection

Scenario: Block IPv4 loopback
  Given a user provides url="http://127.0.0.1/admin"
  When the URL is validated
  Then validation fails with "not allowed" error

Scenario: Block IPv6 loopback
  Given a user provides url="http://[::1]/admin"
  When the URL is validated
  Then validation fails with "not allowed" error

Scenario: Block cloud metadata endpoint
  Given a user provides url="http://169.254.169.254/latest/meta-data/"
  When the URL is validated
  Then validation fails with "not allowed" error

Scenario: Block link-local IPv4
  Given a user provides url="http://169.254.1.1/resource"
  When the URL is validated
  Then validation fails with "not allowed" error

Scenario: Block IPv6 link-local
  Given a user provides url="http://[fe80::1]/resource"
  When the URL is validated
  Then validation fails with "not allowed" error

Scenario: Block AWS cloud metadata
  Given a user provides url="http://169.254.169.254/latest/meta-data/"
  When the URL is validated
  Then validation fails

Scenario: Block Alibaba cloud metadata
  Given a user provides url="http://100.100.100.200/latest/meta-data/"
  When the URL is validated
  Then validation fails

Scenario: Block GCP metadata hostname
  Given a user provides url="http://metadata.google.internal"
  When the URL is validated
  Then validation fails

Scenario: Allow public URLs
  Given a user provides url="https://example.com/page"
  When the URL is validated
  Then validation passes
```

## Files to Modify

| File | Action |
|------|--------|
| `src/validation/schemas.test.ts` | Add new tests for SSRF protection |

## Implementation Notes

1. Add a new describe block for "SSRF Protection"
2. Test each bypass vector individually:
   - IPv4 loopback: `127.0.0.1`, `127.0.0.0/8`
   - IPv6 loopback: `::1`, `[::1]`
   - IPv6 unspecified: `::`, `[::]`
   - IPv6 link-local: `fe80::/10`
   - IPv4 link-local: `169.254.0.0/16`
   - Cloud metadata: `169.254.169.254`, `100.100.100.200`, `metadata.google.internal`
3. Test that valid public URLs still pass

## Verification

```bash
# Run the schemas tests
pnpm test -- src/validation/schemas.test.ts

# Expected: All SSRF tests pass
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(schemas): add SSRF URL validation tests
```
