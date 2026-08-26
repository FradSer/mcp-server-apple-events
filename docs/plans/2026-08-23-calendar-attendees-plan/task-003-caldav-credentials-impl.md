# Task 003: CalDAV Credentials Implementation

## Feature

Credential Resolution - Resolve iCloud CalDAV credentials from the environment, then the macOS Keychain, and never from config.

## BDD Scenario

```gherkin
Feature: Credential Resolution

Scenario: The environment wins over the Keychain
  Given ICLOUD_APPLE_ID and ICLOUD_APP_PASSWORD are both set
  When credentials are resolved
  Then the environment values are used
  And the Keychain is not consulted

Scenario: Missing credentials give actionable setup guidance
  Given neither the environment nor the Keychain holds a password
  When credentials are resolved
  Then the error names both env vars and the security add-generic-password command
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/caldavCredentials.ts` | Create the resolution module |

## Implementation Notes

1. Export `KEYCHAIN_SERVICE = 'icloud-caldav-mcp'`, `resolveCalDavCredentials()`, and `MissingCalDavCredentialsError`.

2. Environment first so a deployment can inject them; macOS Keychain second so an interactive machine needs no environment at all. Per the repository guidelines, secrets live in `.env.local` or the Keychain — never in the MCP client config.

3. Read the Keychain with `security find-generic-password -a <appleId> -s <service> -w` via `execFile`. Resolve `undefined` on any error rather than throwing: an absent entry is an expected state, not a failure.

4. The password is returned to the caller and never logged, never embedded in an error, and never written to disk by this module.

5. `MissingCalDavCredentialsError` must name both environment variables *and* the exact `security add-generic-password` invocation, so the fix does not require reading the source. Interpolate the Apple ID when one is known.

6. Require an app-specific password, not the account password. State this where a user will read it (both READMEs, task 007).

## Verification

```bash
# Run the credential tests
pnpm test -- src/utils/caldavCredentials.test.ts

# Run the full suite to ensure no regressions
pnpm test

# Expected: all tests pass
```

## Dependencies

- **depends-on**: Task 003 Test (task-003-caldav-credentials-test.md)

## Commit

```
feat(caldav): resolve credentials from env then keychain
```
