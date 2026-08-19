Feature: Publish the documented package version to npm
  The npm release workflow must be able to publish tagged releases so users of
  npx mcp-server-apple-events receive the version documented by the repository.

  Scenario: Install the package manager version declared by the project
    Given the package declares its package manager and version
    When the release workflow sets up pnpm
    Then the workflow does not declare a conflicting pnpm version
    And pnpm action setup can use the package manager declaration

  Scenario: Package the upstream event release assets
    Given the FradSer/event v0.6.0 release provides Darwin arm64 and amd64 archives
    When the release workflow prepares the npm package
    Then it downloads event-darwin-arm64.tar.gz and event-darwin-amd64.tar.gz
    And it combines both binaries with lipo into bin/event
    And it compiles only scripts/disclaim.c for bin/event-disclaim
    And it ad-hoc signs bin/event with scripts/event-Info.plist and scripts/event.entitlements
    And it does not build, notarize, or invoke Swift for event locally
    And dependency installation ignores lifecycle scripts

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
