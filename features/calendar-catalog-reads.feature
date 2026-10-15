Feature: Calendar reads answer by identifier and from the EventKit catalog
  A by-id event read uses the same EventKit lookup as update and delete, and a
  calendar listing reports the catalog instead of the calendars that happen to
  hold an event inside a scanned window.

  Scenario: Read an event by id
    Given an event that exists in EventKit
    When calendar_events reads it by id
    Then the event is resolved through EKEventStore.event(withIdentifier:)
    And no date window is scanned

  Scenario: Read an id that does not exist
    Given no event carries the requested id
    When calendar_events reads it by id
    Then the CLI not-found message reaches the caller unchanged

  Scenario: List calendars without a date range
    Given EventKit reports calendars, including one with no event in any window
    When calendar_calendars reads without a date range
    Then every calendar EventKit reports is returned
    And each entry carries its source and whether it allows content modifications

  Scenario: List calendars with a date range
    Given a caller supplies startDate and endDate
    When calendar_calendars reads
    Then only calendars with an event inside the range are returned
    And each entry carries the in-range event count
