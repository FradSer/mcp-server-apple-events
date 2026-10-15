Feature: Bounded native reads in MCP protocol tests
  Protocol tests exercise the server without requiring local account permission grants.

  Scenario Outline: An unavailable native account read settles within the test deadline
    Given the native helper cannot complete a <tool> read
    And the MCP test client launches the server with a five-second native read timeout
    When the test calls the read tool through the stdio transport
    Then the server returns an MCP tool error before Jest's ten-second deadline
    And the test does not require an account permission grant

    Examples:
      | tool               |
      | reminders_tasks    |
      | reminders_lists    |
      | calendar_calendars |

  Scenario: A permitted account read uses the same protocol
    Given a native account read succeeds before the timeout
    When the protocol test calls a read tool
    Then it receives the native records in an MCP result
