# Task 007: Final Verification

## Feature

Final Verification - Run full test suite and coverage check to ensure all fixes are complete.

## BDD Scenario

```gherkin
Feature: Final Verification

Scenario: All tests pass
  Given all implementation tasks are complete
  When the full test suite is run
  Then all tests pass
  And no regressions are introduced

Scenario: Coverage thresholds met
  Given all tests pass
  When coverage is measured
  Then statements coverage >= 96%
  And branches coverage >= 90%
  And functions coverage >= 98%
  And lines coverage >= 96%

Scenario: Lint and typecheck pass
  Given all code changes are complete
  When pnpm check is run
  Then no lint errors
  And no type errors
```

## Files to Verify

| File | Verification |
|------|--------------|
| All test files | All tests pass |
| `coverage/` | Coverage thresholds met |
| `src/` | No lint/type errors |

## Implementation Notes

1. Run the full test suite:
   ```bash
   pnpm test
   ```

2. Verify coverage thresholds:
   ```bash
   pnpm test -- --coverage
   ```

3. Run lint and typecheck:
   ```bash
   pnpm check
   ```

4. If any test fails:
   - Investigate the failure
   - Fix the issue or update the test as needed
   - Re-run verification

## Verification

```bash
# Full verification
pnpm test && pnpm check

# Expected: All tests pass, no lint/type errors
```

## Dependencies

- **depends-on**: All implementation tasks (001-006)

## Commit

```
test: verify all code review fixes complete
```

Note: This task may not require a commit if no changes are made.
