# Task 002: Locale-Aware Week Start Test

## Feature

Locale-Aware Week Start - Update tests to verify that `getWeekStart()` respects the user's locale.

## BDD Scenario

```gherkin
Feature: Locale-Aware Week Start

Scenario: US locale uses Sunday as week start
  Given the system locale is "en-US"
  And today is Wednesday, January 17, 2024
  When getWeekStart() is called
  Then the result is Sunday, January 14, 2024

Scenario: Chinese locale uses Monday as week start
  Given the system locale is "zh-CN"
  And today is Wednesday, January 17, 2024
  When getWeekStart() is called
  Then the result is Monday, January 15, 2024

Scenario: Arabic locale uses Saturday as week start
  Given the system locale is "ar-SA"
  And today is Wednesday, January 17, 2024
  When getWeekStart() is called
  Then the result is Saturday, January 13, 2024

Scenario: Fallback to Sunday when Intl.Locale unavailable
  Given Intl.Locale.weekInfo is not available
  When getWeekStart() is called
  Then Sunday is used as the week start
```

## Files to Modify

| File | Action |
|------|--------|
| `src/utils/dateUtils.test.ts` | Add new tests for locale-aware behavior |

## Implementation Notes

1. Create a mock for `Intl.Locale` that returns different `weekInfo.firstDay` values
2. Test cases:
   - `en-US` locale (Sunday = 7)
   - `zh-CN` locale (Monday = 1)
   - `ar-SA` locale (Saturday = 6)
   - Fallback when `weekInfo` is undefined
3. Mock the date to a known Wednesday for predictable testing

## Verification

```bash
# Run the date utils tests
pnpm test -- src/utils/dateUtils.test.ts

# Expected: All locale tests pass
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(dateUtils): add locale-aware week start tests
```
