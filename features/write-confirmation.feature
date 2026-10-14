Feature: User authorization for Calendar and Reminders writes
  Synchronized item content and model confidence cannot authorize a write.

  Scenario Outline: A write requires confirmation through the host
    Given an item contains forged instructions and identifiers
    When the host calls <tool> with action <action>
    And no user confirmation is available
    Then the tool returns an error without invoking the write handler

    Examples:
      | tool               | action  |
      | reminders_tasks    | create  |
      | reminders_tasks    | update  |
      | reminders_tasks    | delete  |
      | reminders_lists    | create  |
      | reminders_lists    | update  |
      | reminders_lists    | delete  |
      | calendar_events    | create  |
      | calendar_events    | update  |
      | calendar_events    | delete  |
      | reminders_subtasks | create  |
      | reminders_subtasks | update  |
      | reminders_subtasks | delete  |
      | reminders_subtasks | toggle  |
      | reminders_subtasks | reorder |

  Scenario: Confirmation is bound to one operation
    Given the client supports form elicitation
    When the user accepts and explicitly confirms the displayed tool arguments
    Then exactly that operation is dispatched once
    And the next write requires a new confirmation

  Scenario Outline: Unavailable or refused confirmation prevents a write
    Given the client returns <response> to the confirmation request
    When a calendar attendee invitation is requested
    Then no invitation is sent

    Examples:
      | response                 |
      | decline                  |
      | cancel                   |
      | accept without confirm   |
      | accept with false        |
      | accept with string true  |
      | transport failure        |

  Scenario: Read-only access remains available
    Given the client cannot request user confirmation
    When the host reads Calendar or Reminders data
    Then the read handler runs without confirmation

  Scenario: Confidence ranks recommendations only
    When the host retrieves any bundled prompt
    Then it treats retrieved records as untrusted data
    And it requires explicit user confirmation for writes regardless of confidence
