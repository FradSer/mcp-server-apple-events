# Task 003: CalDAV Credentials Test

## Feature

Credential Resolution - Specify environment-then-Keychain precedence and non-disclosure.

## BDD Scenario

```gherkin
Feature: Credential Resolution

Scenario: The environment wins over the Keychain
  Given ICLOUD_APPLE_ID and ICLOUD_APP_PASSWORD are both set
  When credentials are resolved
  Then the environment values are used
  And the Keychain is not consulted

Scenario: The Keychain fills in a missing password
  Given only ICLOUD_APPLE_ID is set
  When credentials are resolved
  Then the password is read from the Keychain service icloud-caldav-mcp

Scenario: Missing credentials give actionable setup guidance
  Given neither the environment nor the Keychain holds a password
  When credentials are resolved
  Then the error names both env vars and the security add-generic-password command

Scenario: No Apple ID configured at all
  Given ICLOUD_APPLE_ID is unset
  When credentials are resolved
  Then a MissingCalDavCredentialsError is raised without consulting the Keychain

Scenario: The password never appears in the error
  Given a resolution that fails after a password was read
  When the error is formatted
  Then the password does not appear in the message
```

## Files to Create

| File | Action |
|------|--------|
| `src/utils/caldavCredentials.test.ts` | Create resolution and non-disclosure tests |

## Implementation Notes

1. Mock `node:child_process` and assert on the `security` invocation, including the service name — a typo there fails open to "no credentials" rather than loudly.
2. Assert the Keychain is *not* consulted when the environment supplies both. Precedence is only observable from the call that did not happen.
3. Save and restore `process.env` around each case so ordering cannot leak state.
4. The non-disclosure assertion should match on the password value itself, not on a phrase, so it survives rewording of the message.

## Verification

```bash
# Run the credential tests
pnpm test -- src/utils/caldavCredentials.test.ts

# Expected: all resolution and non-disclosure tests pass
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(caldav): specify credential precedence and non-disclosure
```
