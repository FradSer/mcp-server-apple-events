# Task 004: Subtask Tool Routing Test

## Feature

Subtask Tool Routing - Add test coverage for `reminders_subtasks` tool routing.

## BDD Scenario

```gherkin
Feature: Subtask Tool Routing

Scenario: Read subtasks
  Given a valid tool call to "reminders_subtasks" with action="read"
  When handleToolCall processes the request
  Then handleReadSubtasks is called with the correct arguments
  And the result is returned successfully

Scenario: Create subtask
  Given a valid tool call to "reminders_subtasks" with action="create"
  When handleToolCall processes the request
  Then handleCreateSubtask is called with reminderId and title
  And a new subtask is created with a generated ID

Scenario: Update subtask
  Given a valid tool call to "reminders_subtasks" with action="update"
  When handleToolCall processes the request
  Then handleUpdateSubtask is called with reminderId, subtaskId, and updates

Scenario: Delete subtask
  Given a valid tool call to "reminders_subtasks" with action="delete"
  When handleToolCall processes the request
  Then handleDeleteSubtask is called with reminderId and subtaskId

Scenario: Toggle subtask
  Given a valid tool call to "reminders_subtasks" with action="toggle"
  When handleToolCall processes the request
  Then handleToggleSubtask is called with reminderId and subtaskId
  And the subtask completion status is flipped

Scenario: Reorder subtasks
  Given a valid tool call to "reminders_subtasks" with action="reorder"
  When handleToolCall processes the request
  Then handleReorderSubtasks is called with the new order array

Scenario: Missing reminderId
  Given a tool call to "reminders_subtasks" without reminderId
  When handleToolCall processes the request
  Then an error response is returned
  And the error message mentions "reminderId"
```

## Files to Create

| File | Action |
|------|--------|
| `src/tools/reminders_subtasks.test.ts` | Create new test file |

## Implementation Notes

1. Follow the existing test patterns in `src/tools/index.test.ts`
2. Use `jest.mock()` to mock the subtask handlers
3. Use `it.each()` to test all 6 actions with a single test case
4. Test error handling for missing `reminderId`
5. Verify that each handler is called with the correct arguments

## Verification

```bash
# Run the new test file
pnpm test -- src/tools/reminders_subtasks.test.ts

# Run all tools tests
pnpm test -- src/tools/

# Expected: All subtask routing tests pass
```

## Dependencies

- None (this is a test-only task)

## Commit

```
test(tools): add subtask tool routing tests
```
