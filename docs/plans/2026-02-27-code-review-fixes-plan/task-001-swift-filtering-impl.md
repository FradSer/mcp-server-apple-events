# Task 001: Swift-Only Filtering Implementation

## Feature

Swift-Only Filtering - Remove redundant JS-side filtering, trust Swift CLI for all date/list/search/completion filtering.

## BDD Scenario

```gherkin
Feature: Swift-Only Filtering

Scenario: Date filters handled by Swift CLI
  Given a user requests reminders with dueWithin="this-week"
  When the repository fetches reminders
  Then Swift CLI receives the --dueWithin argument
  And JS-side filtering does NOT re-apply date filters
  And only priority, recurring, locationBased, and tags are filtered by JS
```

## Files to Modify

| File | Action |
|------|--------|
| `src/utils/reminderRepository.ts` | Modify `findReminders()` method |

## Implementation Notes

1. Change the default value of `showCompleted` from `true` to `false`:
   - Line 148: `filters.showCompleted ?? true` -> `filters.showCompleted ?? false`

2. Simplify the `applyReminderFilters` call to only include JS-side filters:
   - Remove: `showCompleted`, `list`, `search`, `dueWithin` from the filter object
   - Keep: `priority`, `recurring`, `locationBased`, `tags`

3. Remove the redundant filter clearing logic (the `...filters` spread with undefined overrides)

## Verification

```bash
# Run the repository tests
pnpm test -- src/utils/reminderRepository.test.ts

# Run full test suite to ensure no regressions
pnpm test

# Expected: All tests pass
```

## Dependencies

- **depends-on**: Task 001 Test (task-001-swift-filtering-test.md)

## Commit

```
fix(repository): swift-only filtering, showCompleted defaults to false
```
