Feature: Preserve the calling application's EventKit permission boundary
  Calendar and Reminders access must remain subject to macOS attribution of
  the calling application instead of reusing a public helper's prior grant.

  Scenario Outline: Execute protected commands without disclaiming responsibility
    Given the event binary and a legacy event-disclaim shim are both available
    When the server executes a <command> command
    Then it launches the validated event binary directly
    And it passes the command arguments unchanged
    And it never resolves or executes the legacy shim

    Examples:
      | command          |
      | JSON read        |
      | plain-text write |

  Scenario: Distribute only the direct EventKit executable
    Given a release is built and packaged
    When the npm package is inspected
    Then it contains bin/event and its source-build support files
    And it contains neither event-disclaim nor scripts/disclaim.c
    And build, install, release and notarization paths do not use the shim

  Scenario: Preserve permission denial from the calling application
    Given macOS denies the calling application Reminders access
    When the event binary returns a permission error
    Then the server returns a typed permission error
    And it does not retry through a self-responsible helper

  Scenario: Permission diagnostics ignore a legacy shim
    Given a legacy event-disclaim executable remains in a source checkout
    When the permission check script runs
    Then it invokes event directly for Reminders and Calendars
    And it does not execute the legacy shim

  Scenario: Revalidate a changed event binary
    Given a validated event binary has been cached
    When the binary changes between commands
    Then the server validates it again before the next direct launch
