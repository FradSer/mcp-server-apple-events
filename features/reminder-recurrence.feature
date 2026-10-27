Feature: Write reminder repeat rules through MCP
  Reminder repeat writes use the vendored event CLI without accessing a real
  reminder store in automated tests.

  Scenario: Create and read a repeat rule
    Given a reminder with a due date and a valid repeat rule
    When the create action reaches the CLI
    Then each rule field reaches its corresponding CLI option
    And the returned recurrence rule appears in structured and JSON content

  Scenario: Replace or clear a repeat rule
    Given an existing reminder
    When update specifies a rule or requests clearRecurrence
    Then the matching CLI options are passed without requiring a new due date

  Scenario: Reject invalid rule combinations
    Given invalid frequency, interval, end, weekday, day, or month fields
    When the MCP server validates a create or update request
    Then it reports an error without invoking the CLI

  Scenario: Reject a rule for a reminder without a due date
    Given the CLI reports that the reminder has no due date
    When the MCP server attempts a repeat rule update
    Then the error is returned without reporting a successful write
