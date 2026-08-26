# Task 007: Documentation

## Feature

Documentation - Record both parameters, their runtime requirements, and the fact that they bypass the `event` CLI.

## BDD Scenario

```gherkin
Feature: Documentation

Scenario: Both parameters appear on the canonical write-surface table
  Given docs/migration-to-event-cli.md lists the calendar_events write surface
  When attendees and occurrenceDate are documented
  Then each row states that it bypasses the event CLI
  And each states why EventKit cannot express it

Scenario: The READMEs stay in sync
  Given README.md and README.zh-CN.md document the same tool surface
  When a parameter is added to one
  Then the other gains the same structure

Scenario: Runtime requirements are stated where a user will hit them
  Given attendees requires a TCC Automation grant
  And occurrenceDate requires iCloud credentials
  When the READMEs document each parameter
  Then the requirement and its setup step appear alongside it

Scenario: The changelog records the capabilities under Unreleased
  Given CHANGELOG.md follows Keep a Changelog
  When both capabilities are recorded
  Then they appear under an Added heading in the Unreleased section
```

## Files to Modify

| File | Action |
|------|--------|
| `CHANGELOG.md` | Add both capabilities under `## [Unreleased]` |
| `README.md` | Document both parameters, the Automation grant, and the credential setup |
| `README.zh-CN.md` | Mirror the English structure |
| `docs/migration-to-event-cli.md` | Add both to the `calendar_events` write-surface table |

## Implementation Notes

1. `docs/migration-to-event-cli.md` is the canonical write-surface doc. Attendees were never listed there because they were never writable — add both capabilities and state that they bypass the `event` CLI rather than extending it. Note that no upstream `event` flag can close the attendee gap, since EventKit itself has no attendee-mutation or invitation API.

2. The two READMEs are kept in sync. Document both parameters in whatever way each file already documents `calendar_events` parameters — the tool table Notes column plus an example call — rather than introducing a new format.

3. State the runtime requirements where a user will hit them:
   - `attendees` needs Calendar.app plus an Automation grant under System Settings → Privacy & Security → Automation, and a GUI session
   - `occurrenceDate` needs `ICLOUD_APPLE_ID` plus either `ICLOUD_APP_PASSWORD` or a Keychain entry under service `icloud-caldav-mcp`, using an app-specific password

4. Keep the changelog entries in the existing voice: what changed, why it could not be done before, and the upgrade-relevant consequence. Both go under `### Added` in `## [Unreleased]`.

5. Do not touch `package.json` version or anything the release plumbing asserts on — `src/__tests__/package-release.test.ts` pins that contract.

## Verification

```bash
# Verify the release contract is untouched
pnpm test -- src/__tests__/package-release.test.ts

# Verify lint passes on the docs
pnpm exec biome check

# Expected: no errors
```

## Dependencies

- **depends-on**: Task 006 Impl (task-006-tool-surface-wiring-impl.md)

## Commit

```
docs(calendar): document attendees and occurrenceDate
```
