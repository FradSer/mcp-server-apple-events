# BDD Specifications

## Overview

This document defines the behavior-driven development specifications for the code review fixes. Each scenario follows the Given-When-Then pattern.

---

## Feature: Swift-Only Filtering

### Scenario: Date filters handled by Swift CLI

```gherkin
Given a user requests reminders with dueWithin="this-week"
When the repository fetches reminders
Then Swift CLI receives the --dueWithin argument
And JS-side filtering does NOT re-apply date filters
And only priority, recurring, locationBased, and tags are filtered by JS
```

### Scenario: List filters handled by Swift CLI

```gherkin
Given a user requests reminders with filterList="Work"
When the repository fetches reminders
Then Swift CLI receives the --filterList argument
And JS-side filtering does NOT re-apply list filters
```

### Scenario: Search filters handled by Swift CLI

```gherkin
Given a user requests reminders with search="meeting"
When the repository fetches reminders
Then Swift CLI receives the --search argument
And JS-side filtering does NOT re-apply search filters
```

---

## Feature: showCompleted Default Value

### Scenario: Default hides completed reminders

```gherkin
Given a user requests reminders without specifying showCompleted
When the repository builds CLI arguments
Then --showCompleted is set to "false"
And completed reminders are excluded by default
```

### Scenario: Explicit true shows completed

```gherkin
Given a user requests reminders with showCompleted=true
When the repository builds CLI arguments
Then --showCompleted is set to "true"
And completed reminders are included
```

---

## Feature: Locale-Aware Week Start

### Scenario: US locale uses Sunday as week start

```gherkin
Given the system locale is "en-US"
And today is Wednesday, January 17, 2024
When getWeekStart() is called
Then the result is Sunday, January 14, 2024
```

### Scenario: Chinese locale uses Monday as week start

```gherkin
Given the system locale is "zh-CN"
And today is Wednesday, January 17, 2024
When getWeekStart() is called
Then the result is Monday, January 15, 2024
```

### Scenario: Arabic locale uses Saturday as week start

```gherkin
Given the system locale is "ar-SA"
And today is Wednesday, January 17, 2024
When getWeekStart() is called
Then the result is Saturday, January 13, 2024
```

### Scenario: Fallback to Sunday when Intl.Locale unavailable

```gherkin
Given Intl.Locale.weekInfo is not available
When getWeekStart() is called
Then Sunday is used as the week start
```

---

## Feature: SSRF URL Protection

### Scenario: Block IPv4 loopback

```gherkin
Given a user provides url="http://127.0.0.1/admin"
When the URL is validated
Then validation fails with "not allowed" error
```

### Scenario: Block IPv6 loopback

```gherkin
Given a user provides url="http://[::1]/admin"
When the URL is validated
Then validation fails with "not allowed" error
```

### Scenario: Block cloud metadata endpoint

```gherkin
Given a user provides url="http://169.254.169.254/latest/meta-data/"
When the URL is validated
Then validation fails with "not allowed" error
```

### Scenario: Block link-local IPv4

```gherkin
Given a user provides url="http://169.254.1.1/resource"
When the URL is validated
Then validation fails with "not allowed" error
```

### Scenario: Block IPv6 link-local

```gherkin
Given a user provides url="http://[fe80::1]/resource"
When the URL is validated
Then validation fails with "not allowed" error
```

### Scenario: Allow public URLs

```gherkin
Given a user provides url="https://example.com/page"
When the URL is validated
Then validation passes
```

---

## Feature: Subtask Tool Routing

### Scenario: Read subtasks

```gherkin
Given a valid tool call to "reminders_subtasks" with action="read"
When handleToolCall processes the request
Then handleReadSubtasks is called with the correct arguments
And the result is returned successfully
```

### Scenario: Create subtask

```gherkin
Given a valid tool call to "reminders_subtasks" with action="create"
When handleToolCall processes the request
Then handleCreateSubtask is called with reminderId and title
And a new subtask is created with a generated ID
```

### Scenario: Toggle subtask

```gherkin
Given a valid tool call to "reminders_subtasks" with action="toggle"
When handleToolCall processes the request
Then handleToggleSubtask is called with reminderId and subtaskId
And the subtask completion status is flipped
```

### Scenario: Delete subtask

```gherkin
Given a valid tool call to "reminders_subtasks" with action="delete"
When handleToolCall processes the request
Then handleDeleteSubtask is called with reminderId and subtaskId
And the subtask is removed from the notes
```

### Scenario: Reorder subtasks

```gherkin
Given a valid tool call to "reminders_subtasks" with action="reorder"
When handleToolCall processes the request
Then handleReorderSubtasks is called with the new order array
And subtasks appear in the specified order
```

### Scenario: Missing reminderId

```gherkin
Given a tool call to "reminders_subtasks" without reminderId
When handleToolCall processes the request
Then an error response is returned
And the error message mentions "reminderId"
```

---

## Feature: Production Error Handling

### Scenario: Development mode shows detailed errors

```gherkin
Given NODE_ENV="development"
And an internal error occurs
When createErrorMessage generates the response
Then the full error message is returned
```

### Scenario: Production mode sanitizes errors

```gherkin
Given NODE_ENV="production"
And DEBUG is not set
And an internal error occurs
When createErrorMessage generates the response
Then "System error occurred" is returned
```

### Scenario: Production mode with DEBUG shows details

```gherkin
Given NODE_ENV="production"
And DEBUG="1"
And an internal error occurs
When createErrorMessage generates the response
Then the full error message is returned
```

### Scenario: ValidationError always shown

```gherkin
Given NODE_ENV="production"
And a ValidationError occurs
When createErrorMessage generates the response
Then the validation error details are shown
```

### Scenario: Permission error always shown

```gherkin
Given NODE_ENV="production"
And a permission error occurs
When createErrorMessage generates the response
Then the permission error message is shown
And includes System Settings instructions
```

---

## Feature: Argument Injection Safety

### Scenario: Shell metacharacters are not interpreted

```gherkin
Given a user provides title="test; rm -rf /"
When the CLI is executed
Then the semicolon is treated as literal text
And NOT as a command separator
```

### Scenario: execFile prevents shell injection

```gherkin
Given the executeCli function is called
When arguments are passed to the Swift binary
Then execFile is used (not exec)
And arguments are passed as a separate array
And no shell interpretation occurs
```

---

## Testing Strategy

### Unit Tests

- `reminderRepository.test.ts` - Update for new filter behavior
- `dateUtils.test.ts` - Add locale-aware week start tests
- `schemas.test.ts` - Add SSRF protection tests
- `errorHandling.test.ts` - Add environment mode tests

### Integration Tests

- `index.test.ts` - Add subtask routing tests
- `e2e.test.ts` - Verify end-to-end behavior

### Coverage Requirements

| Component | Target |
|-----------|--------|
| Statements | 96% |
| Branches | 90% |
| Functions | 98% |
| Lines | 96% |
