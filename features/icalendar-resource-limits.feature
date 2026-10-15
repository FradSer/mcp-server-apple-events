Feature: Bounded recurring calendar resource processing
  Scenario Outline: Reject a calendar that exceeds a processing limit
    Given a calendar exceeding the <limit> limit
    When its lines are unfolded or a recurring occurrence is excepted
    Then an actionable calendar size or complexity error is returned
    And the resource is not serialized or written back

    Examples:
      | limit                  |
      | 2 MiB of UTF-8 data     |
      | 20000 content lines    |
      | 64 KiB per line        |
      | 16 nested components   |
      | 2000 VEVENT components |
      | 1000 recurrence IDs    |

  Scenario: Many matching overrides are removed without repeated interval scans
    Given a recurring master and 1000 overrides naming the deleted occurrence
    And a timezone component
    When the occurrence is excepted
    Then each matching override is removed in a single ordered traversal
    And the master receives its EXDATE and SEQUENCE update
    And the timezone is preserved

  Scenario: Excessive serialization expansion is refused
    Given calendar lines within the input size limit
    When RFC 5545 folding exceeds the serialized byte or physical line limit
    Then serialization fails before a calendar write

  Scenario: Complexity errors do not replace the remote calendar resource
    Given a fetched recurring calendar resource with an overlong property
    When a single occurrence is deleted
    Then the calendar length error is returned
    And no CalDAV PUT is sent

  Scenario: The calendar repository preserves resource limit failures
    Given an iCloud event resolved through its calendar identifier
    And a fetched resource that exceeds the calendar processing limits
    When the repository deletes a single occurrence
    Then the limit error reaches the caller
    And neither a CalDAV PUT nor a native calendar deletion is sent

  Scenario: A bounded resource can still be edited through the repository
    Given an iCloud recurring event within the processing limits
    When the repository deletes a single occurrence
    Then it writes the EXDATE through CalDAV
    And it returns the event and excepted timestamp
