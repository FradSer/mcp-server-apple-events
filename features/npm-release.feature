Feature: Publish the documented package version to npm
  The npm release workflow must be able to publish tagged releases so users of
  npx mcp-server-apple-events receive the version documented by the repository.

  Scenario: Install the package manager version declared by the project
    Given the package declares its package manager and version
    When the release workflow sets up pnpm
    Then the workflow does not declare a conflicting pnpm version
    And pnpm action setup can use the package manager declaration

  Scenario: Publish through npm trusted publishing
    Given npm has a trusted publisher configured for FradSer/mcp-server-apple-events and release.yml
    When the release workflow publishes a tagged release
    Then the job grants GitHub's OIDC token permission
    And the job uses Node.js 24 and npm 11.5.1 or newer
    And npm publish does not use a long-lived npm token

  Scenario: Recover the existing v1.5.0 tag
    Given the v1.5.0 tag exists but was created before this workflow merged
    When the release workflow is dispatched manually
    Then the only selectable recovery tag is v1.5.0
