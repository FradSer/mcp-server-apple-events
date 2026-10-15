Feature: Free-text values survive argv construction and stdout noise
  Caller text reaches the vendored `event` CLI as one argv entry, so a value
  that starts with a dash is never read as the next option, and a diagnostic
  note on stdout never turns a saved write into a reported failure.

  Scenario: A title that starts with a dash
    Given a reminder create with title "- buy milk"
    When the repository builds the CLI command
    Then the title travels as a single "--title=- buy milk" argument
    And the CLI receives the text instead of reporting a missing value

  Scenario: A value that names another option
    Given a reminder create with title "--completed"
    When the repository builds the CLI command
    Then the title travels as a single "--title=--completed" argument

  Scenario: Notes that start with a Markdown rule
    Given a calendar event create with note "---\nkey: value"
    When the repository builds the CLI command
    Then the note travels as a single "--notes=---\nkey: value" argument

  Scenario: An empty free-text value
    Given a caller supplies an empty string for a free-text field
    When the repository builds the CLI command
    Then the flag and the empty value travel as two arguments
    Because the CLI reads "--flag=" as a missing value

  Scenario: A note printed before the JSON document
    Given the CLI writes a "Note: ..." line to stdout before the JSON document
    When the server parses the command output
    Then the last JSON document on stdout is returned
    And a write the CLI saved is not reported as a parse failure

  Scenario: Output that holds no JSON document
    Given the CLI writes only note lines to stdout
    When the server parses the command output
    Then the call fails with the existing invalid-output error
