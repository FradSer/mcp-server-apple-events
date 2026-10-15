Feature: Bound CalDAV response resources
  CalDAV requests must release transport resources when servers redirect, fail,
  send oversized bodies, or stop making progress.

  Scenario: Accept a response at the byte limit
    Given the decompressed CalDAV response byte stream is exactly 2 MiB before text decoding
    When the CalDAV request reads the response
    Then it returns the complete body

  Scenario: Reject a response above the byte limit
    Given the decompressed CalDAV response byte stream is larger than 2 MiB before text decoding
    When the CalDAV request reads the response
    Then it cancels the response body
    And it raises an actionable CalDavError without response content

  Scenario: Enforce the cumulative byte limit across chunks
    Given every response chunk is smaller than 2 MiB
    And the decompressed chunks together exceed 2 MiB before text decoding
    When the CalDAV request reads the response
    Then it cancels the response body
    And it raises an actionable CalDavError

  Scenario: Decode a character split across chunks
    Given a valid UTF-8 character is split between response chunks
    When the CalDAV request reads the response
    Then it returns the complete character

  Scenario: Reject a declared oversized response before reading it
    Given a CalDAV response declares a Content-Length larger than 2 MiB
    When the CalDAV request receives the response
    Then it cancels the response body
    And it raises an actionable CalDavError without response content

  Scenario: Enforce one deadline across a redirect chain
    Given a CalDAV request follows redirects that consume time
    When the overall request exceeds 30 seconds
    Then the current response is aborted
    And it raises an actionable timeout CalDavError

  Scenario: Enforce the deadline while response headers are pending
    Given a CalDAV server does not send response headers
    When 30 seconds elapse
    Then the request is aborted
    And it raises an actionable timeout CalDavError

  Scenario: Enforce the deadline while response bytes are pending
    Given a CalDAV server sends headers but stops sending body bytes
    When 30 seconds elapse
    Then the response body is cancelled
    And it raises an actionable timeout CalDavError

  Scenario: Preserve authentication and conflict errors
    Given a CalDAV response has status 401, 403, or 412
    When the CalDAV request handles the response
    Then it raises the corresponding authentication or conflict error
    And it disposes the response body
