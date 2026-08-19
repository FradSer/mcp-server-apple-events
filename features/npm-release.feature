Feature: Publish the documented package version to npm
  The npm release workflow must be able to publish tagged releases so users of
  npx mcp-server-apple-events receive the version documented by the repository.

  Scenario: Install the package manager version declared by the project
    Given the package declares its package manager and version
    When the release workflow sets up pnpm
    Then the workflow does not declare a conflicting pnpm version
    And pnpm action setup can use the package manager declaration
