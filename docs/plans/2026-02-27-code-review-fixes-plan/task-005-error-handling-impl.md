# Task 005: Production Error Handling Implementation

## Feature

Production Error Handling - Add explicit development mode check with production-safe defaults.

## BDD Scenario

```gherkin
Feature: Production Error Handling

Scenario: Production mode sanitizes errors
  Given NODE_ENV="production"
  And DEBUG is not set
  And an internal error occurs
  When createErrorMessage generates the response
  Then "System error occurred" is returned

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
| `src/utils/errorHandling.ts` | Add `isDevelopmentMode()` helper function |

## Implementation Notes

1. Extract an `isDevelopmentMode()` helper function:

   - Check `NODE_ENV` for: `development`, `dev`
   - Check `DEBUG` for: `true`, `1`
   - Default to `false` (production-safe) if neither is set

2. Update `createErrorMessage()` to use the new helper:

   - Replace inline check with `isDevelopmentMode()` call
   - Ensure undefined `NODE_ENV` defaults to production-safe behavior

3. Export the helper function for testability

## Verification

```bash
# Run the error handling tests
pnpm test -- src/utils/errorHandling.test.ts

# Expected: All environment mode tests pass
```

## Dependencies

- **depends-on**: Task 005 Test (task-005-error-handling-test.md)

## Commit

```
fix(errorHandling): add explicit development mode check
```
