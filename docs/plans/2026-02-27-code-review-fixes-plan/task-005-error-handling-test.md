# Task 005: Production Error Handling Test

## Feature

Production Error Handling - Add tests to verify environment-based error message sanitization.

## BDD Scenario

```gherkin
Feature: Production Error Handling

Scenario: Development mode shows detailed errors
  Given NODE_ENV="development"
  And an internal error occurs
  When createErrorMessage generates the response
  Then the full error message is returned

Scenario: Production mode sanitizes errors
  Given NODE_ENV="production"
  And DEBUG is not set
  And an internal error occurs
  When createErrorMessage generates the response
  Then "System error occurred" is returned

Scenario: Production mode with DEBUG shows details
  Given NODE_ENV="production"
  And DEBUG="1"
  And an internal error occurs
  When createErrorMessage generates the response
  Then the full error message is returned

Scenario: ValidationError always shown
  Given NODE_ENV="production"
  And a ValidationError occurs
  When createErrorMessage generates the response
  Then the validation error details are shown

Scenario: Permission error always shown
  Given NODE_ENV="production"
  And a permission error occurs
  When createErrorMessage generates the response
  Then the permission error message is shown
  And includes System Settings instructions

Scenario: Undefined NODE_ENV defaults to production-safe
  Given NODE_ENV is undefined
  And DEBUG is not set
  And an internal error occurs
  When createErrorMessage generates the response
  Then "System error occurred" is returned
```

## Files to Modify

| File | Action |
|------|--------|
| `src/utils/errorHandling.test.ts` | Add new tests for environment modes |

## Implementation Notes

1. Test the `isDevelopmentMode()` helper function (if extracted)
2. Test `createErrorMessage()` with various environment configurations:
   - `NODE_ENV=development`
   - `NODE_ENV=production` (no DEBUG)
   - `NODE_ENV=production` with `DEBUG=1`
   - `NODE_ENV=undefined`
3. Use `beforeEach`/`afterEach` to save and restore `process.env`
4. Test that ValidationError and permission errors are always shown with details

## Verification

```bash
# Run the error handling tests
pnpm test -- src/utils/errorHandling.test.ts

# Expected: All environment mode tests pass
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(errorHandling): add environment mode tests
```
