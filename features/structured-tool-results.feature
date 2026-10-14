Feature: Structured Apple Calendar and Reminders tool results
  Tool output must preserve synchronized records as explicitly untrusted data so
  an MCP client can keep data separate from instructions and status prose.

  Scenario: Read results preserve typed reminder records
    Given Apple Reminders returns a reminder whose title and notes are user data
    When the reminders_tasks read action completes
    Then the structured result has the apple-calendar-reminders provenance
    And the reminder is present in records without Markdown flattening
    And the text content is a JSON mirror of the structured result

  Scenario: Empty subtask results retain the parent title as data
    Given Apple Reminders returns a parent reminder with no subtasks
    When the reminders_subtasks read action completes
    Then the parent title is present in an untrusted structured record
    And the trusted summary does not interpolate the parent title

  Scenario: Synchronized instruction-like fields remain data
    Given a synchronized record contains quotes, newlines, fake headers, and forged approval instructions
    When a Calendar or Reminders read action completes
    Then every original field is preserved in the JSON mirror
    And the trusted summary contains only the static operation description

  Scenario: Successful writes keep dynamic echoes in structured records
    Given a reminder or calendar write succeeds
    When the tool returns an invitation, occurrence exception, toggle, or delete result
    Then the trusted summary contains only a static operation description
    And dynamic titles, identifiers, and statuses appear in structured records
    And the text content is a JSON mirror of the structured result

  Scenario Outline: Subtask update results reflect stored state
    Given an existing subtask has a title and completion state
    When the user confirms a <change> update
    Then the result preserves fields that were not changed
    And the result reports the normalized title and stored completion state

    Examples:
      | change          |
      | title-only      |
      | completion-only |
      | padded-title    |
