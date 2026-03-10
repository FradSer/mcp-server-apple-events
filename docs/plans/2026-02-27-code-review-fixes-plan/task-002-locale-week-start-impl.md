# Task 002: Locale-Aware Week Start Implementation

## Feature

Locale-Aware Week Start - Change from hardcoded Sunday to locale-aware using Intl API.

## BDD Scenario

```gherkin
Feature: Locale-Aware Week Start

Scenario: US locale uses Sunday as week start
  Given the system locale is "en-US"
  And today is Wednesday, January 17, 2024
  When getWeekStart() is called
  Then the result is Sunday, January 14, 2024

Scenario: Fallback to Sunday when Intl.Locale unavailable
  Given Intl.Locale.weekInfo is not available
  When getWeekStart() is called
  Then Sunday is used as the week start
```

## Files to Modify

| File | Action |
|------|--------|
| `src/utils/dateUtils.ts` | Modify `getWeekStart()` and `getWeekEnd()` functions |

## Implementation Notes

1. Add an optional `locale` parameter to `getWeekStart()` and `getWeekEnd()`

2. Use `Intl.Locale` with `weekInfo` property to get the locale's first day of week:
   - `weekInfo.firstDay` returns 1-7 where 1=Monday, 7=Sunday
   - Convert to JavaScript's 0-6 format (0=Sunday)

3. Implement fallback to Sunday (0) if:
   - `Intl.Locale` is not available
   - `weekInfo` property is undefined
   - Any error occurs during locale detection

4. Update the date calculation to use the locale-aware first day:
   - Calculate days to subtract: `(dayOfWeek - firstDay + 7) % 7`

5. Update JSDoc comments to document locale-aware behavior

## Verification

```bash
# Run the date utils tests
pnpm test -- src/utils/dateUtils.test.ts

# Run date filtering tests to ensure no regressions
pnpm test -- src/utils/dateFiltering.test.ts

# Expected: All tests pass
```

## Dependencies

- **depends-on**: Task 002 Test (task-002-locale-week-start-test.md)

## Commit

```
feat(dateUtils): locale-aware week start using Intl.Locale
```
