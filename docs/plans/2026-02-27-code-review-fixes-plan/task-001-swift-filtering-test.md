# Task 001: Swift-Only Filtering Test

## Feature

Swift-Only Filtering - Update tests to verify that only priority, recurring, locationBased, and tags are filtered by JS layer.

## BDD Scenario

```gherkin
Feature: Swift-Only Filtering

Scenario: Date filters handled by Swift CLI
  Given a user requests reminders with dueWithin="this-week"
  When the repository fetches reminders
  Then Swift CLI receives the --dueWithin argument
  And JS-side filtering does NOT re-apply date filters
  And only priority, recurring, locationBased, and tags are filtered by JS

Scenario: List filters handled by Swift CLI
  Given a user requests reminders with filterList="Work"
  When the repository fetches reminders
  Then Swift CLI receives the --filterList argument
  And JS-side filtering does NOT re-apply list filters

Scenario: Search filters handled by Swift CLI
  Given a user requests reminders with search="meeting"
  When the repository fetches reminders
  Then Swift CLI receives the --search argument
  And JS-side filtering does NOT re-apply search filters

Scenario: Default showCompleted is false
  Given a user requests reminders without specifying showCompleted
  When the repository builds CLI arguments
  Then --showCompleted is set to "false"
  And completed reminders are excluded by default
```

## Files to Modify

| File | Action |
|------|--------|
| `src/utils/reminderRepository.test.ts` | Update existing tests and add new assertions |

## Implementation Notes

1. Update the existing test "should default showCompleted to true when not specified" to expect `false` instead of `true`
2. Verify that `applyReminderFilters` is called with only JS-side filters (priority, recurring, locationBased, tags)
3. Ensure the test verifies that CLI receives the correct arguments

## Verification

```bash
# Run the specific test file
pnpm test -- src/utils/reminderRepository.test.ts

# Expected: All tests pass with updated assertions
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(repository): verify swift-only filtering behavior
```
