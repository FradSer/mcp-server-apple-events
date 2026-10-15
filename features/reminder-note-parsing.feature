Feature: Bounded work when parsing synchronized reminder notes
  Reminder metadata parsing advances through note text without retrying
  overlapping suffixes, including when delimiters are malformed.

  Scenario: Many unterminated bracket tags
    Given a reminder note containing 30000 repeated "[#" prefixes and no closing bracket
    When tags are extracted or stripped
    Then no bracket tags are returned
    And stripping preserves the malformed note
    And each operation finishes within 500 milliseconds

  Scenario: Many unterminated subtask sections
    Given a reminder note containing 30000 standalone subtask start markers and no end marker
    When subtasks are parsed or stripped
    Then no subtasks are returned
    And stripping preserves the malformed note apart from surrounding whitespace
    And each operation finishes within 500 milliseconds

  Scenario: Existing metadata syntax is preserved
    Given notes containing bracket tags, Unicode bare tags, and multiple subtask sections
    When metadata is parsed and stripped
    Then bracket tags use the first nonempty opening and next closing bracket
    And Unicode bare tags remain supported
    And only the first complete standalone subtask section is parsed or stripped
    And both LF and CRLF line endings are supported
    And inline subtask marker text remains ordinary note content
