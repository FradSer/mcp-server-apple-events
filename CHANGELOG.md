# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Location-based reminder alarms are writable** — `reminders_tasks` `create` and `update` accept `locationTrigger` (`title`, `latitude`, `longitude`, optional `radius` in meters and `proximity` of `enter`/`leave`), mapped to the vendored `event` CLI's existing `--location/--latitude/--longitude/--radius/--proximity` flags. `update` also accepts `clearLocationTrigger` (`--clear-location`) to remove location alarms; combining it with `locationTrigger` is rejected. Coordinates are required because the CLI does not geocode addresses.

## [1.6.2] - 2026-10-23

### Added

- **Timed calendar reads include unambiguous UTC timestamps** ([#153](https://github.com/FradSer/mcp-server-apple-events/issues/153)) — `calendar_events` adds `startDateISO` and `endDateISO` when the event's time zone resolves to one instant, while preserving the existing wall-clock fields.

### Fixed

- **Unsupported calendar moves fail clearly** ([#154](https://github.com/FradSer/mcp-server-apple-events/issues/154)) — updates that supply `targetCalendar` now return an explicit unsupported-operation error instead of silently reporting a no-op as success.
- **Single-reminder reads now use a direct by-id lookup** ([#108](https://github.com/FradSer/mcp-server-apple-events/issues/108)) — fetches one record with `event reminders get --id <id> --json` rather than serializing the full reminder collection for every read, update, or delete. The release workflow verifies the packaged CLI includes this command.

## [1.6.1] - 2026-10-17

### Changed (BREAKING)

- **Server write confirmation is now off by default** — addresses [#149](https://github.com/FradSer/mcp-server-apple-events/issues/149) and [#150](https://github.com/FradSer/mcp-server-apple-events/issues/150) via [#151](https://github.com/FradSer/mcp-server-apple-events/pull/151).
  Hosts without MCP form elicitation can write again. Add the startup-only
  `--require-write-confirmation` flag to restore v1.6.0's per-write confirmation
  barrier. The flag takes no value; invalid or unknown arguments fail startup.
  Negated flags such as `--no-require-write-confirmation` are explicitly rejected.
  No environment variable controls the policy, and tool arguments cannot change it.
  Enabled confirmation still binds to an argument snapshot and fails closed on
  rejection, cancellation, invalid replies, missing forms, or transport failure.
  Reads, input validation, execution boundaries, and untrusted record provenance
  remain in place in either mode. Help, MCP instructions, workflow prompts, and
  English/Chinese documentation describe the active policy and host authorization.

  **Security tradeoff:** the new default removes the per-write confirmation
  barrier against prompt injection. Deletes can remove data and calendar changes
  or invitations can notify other people without a server prompt. Existing JSON
  encoding and provenance are not equivalent protection. Host user authorization
  and macOS permissions still apply. A startup warning is emitted on stderr.

## [1.6.0] - 2026-10-15

### Changed (BREAKING)

- **Write actions now require user confirmation** — every action except
  `read` of `reminders_tasks`, `reminders_lists`, `reminders_subtasks` and
  `calendar_events` asks the client for approval through MCP form elicitation
  before the handler runs. The approval binds to one snapshot of the tool
  arguments and authorizes that one operation; the next write asks again. A
  client that cannot elicit form input is read-only: the call returns an error
  and the write handler never runs. Synchronized records are untrusted data,
  so item content and model confidence no longer authorize a write —
  confidence ranks recommendations only.

- **EventKit permission requests are no longer disclaimed** — fixes
  [#143](https://github.com/FradSer/mcp-server-apple-events/issues/143).
  The previous release launched `bin/event` through a `bin/event-disclaim`
  helper that disclaimed TCC responsibility at spawn time. That helper is
  removed: it shipped a public, self-responsible executable, so an unrelated
  local process could reuse its prior EventKit grant and read Reminders and
  Calendar without a prompt. The server now launches the validated `bin/event`
  directly, and macOS attributes the request to the application that launched
  the server. Each host needs its own grant, and a host that cannot request
  access fails instead of bypassing TCC. `bin/event-disclaim` and
  `scripts/disclaim.c` are gone; `bin/event` keeps the usage strings of
  `scripts/event-Info.plist` and the
  `com.apple.security.personal-information.{calendars,reminders}`
  entitlements of `scripts/event.entitlements`.

  **Upgrade note:** reinstall the package to remove the old
  `bin/event-disclaim` artifact, then revoke the old `event` entry under
  `System Settings > Privacy & Security > Reminders / Calendars`. Authorize
  each host you use: a grant made from a terminal does not authorize a
  separate desktop MCP client.

### Added

- **`calendar_calendars` reports the EventKit calendar catalog**
  ([#147](https://github.com/FradSer/mcp-server-apple-events/issues/147)) —
  a read without a date range calls `event calendar calendars` and returns
  every calendar EventKit reports for the `.event` entity, including a
  calendar with no event in any window. Each entry now carries `source`,
  `sourceType`, `allowsContentModifications`, `isImmutable`, and `color`, so
  two same-named calendars stay apart and a caller can tell a read-only
  calendar before a write fails. The previous listing derived names from a
  ±4-year `calendar list` scan, which could not see an empty calendar at all
  and missed calendars whose events EventKit left out of the window. A read
  with `startDate`/`endDate` keeps the event-derived listing and its
  per-calendar event count.

- **`calendar_events` reads by id through a direct EventKit lookup**
  ([#146](https://github.com/FradSer/mcp-server-apple-events/issues/146),
  [#108](https://github.com/FradSer/mcp-server-apple-events/issues/108)) —
  a read with `id` calls `event calendar get --id <id>`, which resolves the
  event with `EKEventStore.event(withIdentifier:)` — the same lookup update
  and delete use. The previous read scanned a ±4-year window split at today
  and filtered in TypeScript: it transferred the whole window for one event,
  and EventKit could leave the event out of that window even though a direct
  lookup found it, so an existing event read as "not found".

- **Vendored `event` CLI v0.8.0** — adds `calendar get` and
  `calendar calendars`, honours `--no-shortcuts` on `reminders create` and
  `reminders update`, and writes every diagnostic note to stderr
  ([FradSer/event#20](https://github.com/FradSer/event/pull/20)).

- **`attendees` on `calendar_events` update** — invites email addresses to an
  existing event, and the invitation is actually delivered.
  `EKCalendarItem.attendees` is `readonly` in the macOS SDK and EventKit has no
  attendee-mutation or invitation API at all — Apple models invitation delivery
  as the calendar server's job, which is why the framework exposes only a
  read-only `EKParticipantScheduleStatus` to observe it. No upstream `event`
  flag can close that gap. The write therefore bypasses the `event` CLI and
  goes through Calendar.app's scripting interface
  (`src/utils/appleScriptAttendees.ts`): the sdef marks attendee properties
  `access="r"`, which governs mutating an *existing* attendee, but
  `make new attendee ... with properties` is a creation and is permitted.
  Writing the attendee locally makes iCloud's CalDAV server perform RFC 6638
  scheduling and send the invitation. Verified against live iCloud:
  `SCHEDULE-STATUS=1.1` on the resource plus iMIP mail from
  `noreply@email.apple.com`.

  **Requires** Calendar.app, a GUI session, and an Automation grant under
  `System Settings > Privacy & Security > Automation` — the first call prompts
  for it. Attendees must be updated **alone**: they travel through Calendar.app
  while every other field travels through EventKit, and the two share no
  concurrency token, so a combined update has no safe ordering and is refused
  with an explanation. An ambiguous match is refused rather than guessed —
  Calendar.app can only be queried by title and start date, so two events
  sharing both are indistinguishable and writing to the wrong one would send a
  real invitation for it.

- **`occurrenceDate` on `calendar_events` delete** — excepts one occurrence of
  a recurring series, leaving the rest intact. Every occurrence of a series
  shares one EventKit identifier, and resolving it returns the master, whose
  occurrence date is its own `DTSTART`; `span: this-event` can therefore only
  ever except the series start, and aimed at any later occurrence it writes
  nothing and still reports success. Naming the occurrence routes the write
  over CalDAV instead, appending an `EXDATE`
  (`src/utils/caldavOccurrence.ts`). The `EXDATE` mirrors `DTSTART`'s value
  type and TZID, because an occurrence of a zoned series is identified by local
  wall time and a UTC-converted stamp matches no instance — it PUTs
  successfully and excepts nothing. Verified against live iCloud.

  **Requires** iCloud credentials: `ICLOUD_APPLE_ID` plus either
  `ICLOUD_APP_PASSWORD` or a Keychain entry under the service
  `icloud-caldav-mcp`, using an app-specific password. Credentials are read
  from the environment first, then the Keychain, never from MCP client config,
  and are never logged. Only iCloud-synced events qualify — an event with no
  external identifier has no CalDAV resource to locate, and says so.

  This is the server's first outbound network path. Requests are pinned to
  `caldav.icloud.com` / `pN-caldav.icloud.com` over https only, URLs carrying
  userinfo are refused, redirects are handled manually and re-validated on
  every hop, and `If-Schedule-Tag-Match` is preferred over `If-Match` so an
  inbound RSVP cannot cause a spurious 412.

- **Tool results carry structured, explicitly untrusted records** — each read
  and write result returns a `structuredContent` envelope whose provenance is
  `source: "apple-calendar-reminders"` and `trust: "untrusted"`, and the text
  content is a JSON mirror of that envelope. Synchronized fields are no longer
  flattened into Markdown, and a trusted summary keeps only a static
  description of the operation. A record that holds quotes, newlines,
  header-like lines or forged approval instructions therefore stays data, and
  a client that keeps the provenance cannot read it as an instruction or as
  authorization for another call.

### Changed

- `@modelcontextprotocol/sdk` is now 1.31.0, and the release workflow pins
  every action reference to a full commit SHA, so a tag push cannot execute a
  moved action tag.

### Fixed

- **Values that start with `-` no longer fail as missing options**
  ([#144](https://github.com/FradSer/mcp-server-apple-events/issues/144)) —
  the repositories build argv in the attached form (`--title=- buy milk`),
  which ArgumentParser reads as a value. A dictated title, a note that starts
  with a Markdown rule, or a location that starts with a dash reached the CLI
  as `--title "- buy milk"` and failed with `Missing value for '--title'`.
  An empty value keeps the separated form, because the CLI reads `--flag=` as
  a missing value.

- **A note on stdout no longer reports a saved write as a failure**
  ([#145](https://github.com/FradSer/mcp-server-apple-events/issues/145)) —
  `create` or `update` with `url` returned `isError: true` with "System error
  occurred" although the reminder was written with the URL set, so a client
  that retries on error creates a duplicate. The vendored CLI printed the
  missing-Shortcut notes to stdout before the JSON document; it now writes
  them to stderr, and the server parses the last JSON document on stdout so a
  note from an older binary cannot break the call either.

- **Reminder date-window reads in npm releases**
  ([#131](https://github.com/FradSer/mcp-server-apple-events/issues/131)) —
  package the `event` CLI version that accepts the `--start` and `--end`
  arguments used by `reminders_tasks` when `startDate` or `endDate` is
  provided.

- **Reminder note parsing is now linear**
  ([#141](https://github.com/FradSer/mcp-server-apple-events/issues/141)) —
  tag extraction and subtask parsing advanced a cursor and retried
  overlapping suffixes, so a note that repeats an unterminated `[#` marker
  consumed quadratic time and stalled the server. Each pass now advances one
  cursor per match and finishes in bounded time; the tests hold a note with
  30000 unterminated prefixes under 500 ms.

- **Remote and local calendar resources are bounded**
  ([#142](https://github.com/FradSer/mcp-server-apple-events/issues/142)) —
  the CalDAV client caps a decompressed response at 2 MiB, refuses a declared
  `Content-Length` above that cap before it reads a body, and applies one 30 s
  deadline across the whole redirect chain; a rejected response cancels its
  body and raises a typed error without response content. The iCalendar reader
  caps a resource at 2 MiB, 20000 lines, 64 KiB per line, a component depth of
  16, 2000 events and 1000 overrides, and refuses an oversized resource
  instead of serializing it.

- **A calendar read includes the named end day**
  ([#129](https://github.com/FradSer/mcp-server-apple-events/issues/129),
  [#130](https://github.com/FradSer/mcp-server-apple-events/issues/130)) —
  `event calendar list` treats its end bound as exclusive, and the previous
  code passed a caller's `endDate` verbatim, so a range that ended at
  `23:59:59` dropped every event of that day and a same-day read returned
  nothing. A date-only or non-midnight `endDate` now advances by one day
  (`2026-09-11` and `2026-09-11 23:59:59` both read through `2026-09-12`),
  while a midnight date-time keeps its exclusive meaning. A date-only bound
  with a year below 1000 is padded to four digits, and an inferred window
  keeps the caller's bound when the shifted bound would leave the `0000`–`9999`
  range.

## [1.5.0] - 2026-08-12

### Changed (BREAKING)

- **EventKit backend swapped to the `event` CLI.** The bundled `bin/EventKitCLI`
  Swift binary is gone; the server now shells out to the vendored
  [FradSer/event](https://github.com/FradSer/event) CLI (`bin/event`, built
  during `pnpm install` from the `vendor/event` git submodule). Two
  EventKit-backed projects now share one Swift codebase.
- **Dropped MCP tool fields** that the underlying CLI cannot set today
  (writes only; read-side still returns these fields verbatim when they were
  configured in Reminders.app / Calendar.app):
  - `reminders_tasks`: `alarms`, `clearAlarms`, `recurrence`, `recurrenceRules`,
    `clearRecurrence`, `locationTrigger`, `clearLocationTrigger`, reminder
    `location`, `completionDate`, `startDate` on create (still available on
    update), `completed` on create
  - `reminders_lists`: `color`
  - `calendar_events`: `alarms`, `clearAlarms`, `recurrenceRules`,
    `clearRecurrence`, `structuredLocation`, `url`, `isAllDay` (inferred from
    date format), `availability` on write (still supported as a read filter),
    `targetCalendar` on update (cross-calendar moves require delete+recreate),
    `filterAccount`
  - `calendar_calendars`: `filterAccount` (`event` has no EventKit account
    info to filter by); date-scoped listing and per-calendar `eventCount`
    are still supported, grouped by calendar title instead of an EventKit
    identifier
- **Reminder list update/delete now resolve `name → id` internally** before
  calling `event reminders lists update|delete --id <id>`. Behavior unchanged
  from the host's perspective.
- **Cross-list move and `isCompleted: false` on `reminders_tasks` update**
  surface a clear `CliUserError` instead of silently dropping the change —
  neither is supported by the `event` CLI today.

### Added

- `vendor/event/` git submodule pinning `FradSer/event` (initial pin: tag
  `v0.5.0`).
- `scripts/build-event.mjs` builds a universal (arm64 + x86_64) `vendor/event`
  binary via `swift build -c release` (one build per architecture, merged
  with `lipo`) and code-signs the result with a Developer ID Application
  certificate when available (ad-hoc fallback otherwise), hardened runtime.
- `src/utils/eventCli.ts` — new wrapper for the `event` binary. Parses raw
  JSON (no envelope), maps `Error: Permission denied: …` stderr to
  `CliPermissionError`, and maps other `Error: …` stderr to `CliUserError`.
- `docs/migration-to-event-cli.md` — migration notes for downstream users,
  including the dropped-field table.
- Date-range filtering for reminders.
- Timezone-aware calendar events.
- Per-event timezone support.
- Calendar ID filtering and date validation.
- Support for un-completing reminders.
- Pre-built universal `event` CLI binary distribution.

### Changed

- Hardened validation, subprocess execution, path handling, and untrusted-data output.
- Improved date parsing, timezone handling, recurrence support, and cross-list reminder moves.
- Upgraded dependencies and build tooling.

### Fixed

- **EventKit permission prompts now appear from any desktop MCP client**
  (Codex Desktop, Claude Desktop, Cursor, …) — fixes
  [#93](https://github.com/FradSer/mcp-server-apple-events/issues/93).
  Previously macOS TCC attributed the Reminders/Calendar request to the
  desktop app that launched the server; when that app lacked the EventKit
  usage strings (Codex Desktop ships none), TCC refused the request before
  EventKit was reached and no prompt ever appeared. The server now spawns
  `bin/event` through a new `bin/event-disclaim` shim (compiled from
  `scripts/disclaim.c`) that disclaims TCC responsibility at spawn time —
  the same mechanism Chromium and LLDB use — making `event` its own
  responsible process. `event` now embeds an Info.plist
  (`scripts/event-Info.plist`, bundle id `me.frad.event`) with all six
  Reminders/Calendar usage strings and is signed with the
  `com.apple.security.personal-information.{calendars,reminders}`
  entitlements (`scripts/event.entitlements`).

  **Upgrade note:** the permission prompt and the entry in
  `System Settings > Privacy & Security` now belong to `event`, not to the
  host app — approve the new prompt once. Grants previously given to
  Terminal / Claude Desktop no longer cover the MCP server.

- **`event` CLI calls are now bounded by a timeout** — fixes
  [#113](https://github.com/FradSer/mcp-server-apple-events/issues/113).
  Previously a call that blocked on an EventKit permission prompt which could
  never be displayed (headless/launchd context) hung the MCP request forever
  and leaked a child process per call while every health signal stayed green.
  Each spawn now uses a 30 s timeout with `SIGKILL` (tunable via the
  `EVENTKIT_CLI_TIMEOUT_MS` env var, milliseconds; invalid/zero values fall
  back to the default) and surfaces a readable, actionable error instead.
  The vendored `event` CLI (pinned to
  [FradSer/event#15](https://github.com/FradSer/event/pull/15)) matches —
  fail fast when no GUI session exists, give up on an unanswerable prompt
  after 15 s (`EVENT_PERMISSION_TIMEOUT_MS`) with a domain-typed
  `Permission denied` error — so the host shows a permission-specific
  message before the server's kill fires. A killed write may have completed
  despite the error; verify before retrying.

- Local date-window boundaries and historical date parsing.
- Unicode tags, malformed dates, calendar event grouping, and reminder completion updates.

### Removed

- `src/swift/` (all of it): `EventKitCLI.swift`, `Info.plist`,
  `EventKitCLI.entitlements`, plus their tests.
- `scripts/build-swift.mjs` and its corresponding test.
- `src/utils/cliExecutor.ts` and its test, replaced by `eventCli.ts`.

## [1.4.0] - 2026-03-10

### Added

- **List Colors & Emojis**: Set reminder list color and emoji/emblem via native EventKit API
- **Alarm Types**: Support for different alarm types on reminders (date, time, location-based)
- **Account/Source Filtering**: Filter calendar events by account and source
- **CliUserError**: New error type for clear user-facing CLI error messages
- E2E tests using MCP client protocol
- Local build configuration documentation

### Changed

- Bumped @modelcontextprotocol/sdk from 1.25.1 to 1.26.0

### Fixed

- Safe emblem batch parsing for reminder lists
- Full access permission errors for calendar operations
- Correct priority values for reminders using EventKit standard
- Support for completed status on reminder creation
- Source setting for new reminder lists
- Secure AppleScript execution with improved types
- Error handling for missing Swift binary
- Documented default end time for calendar events

## [1.3.0] - 2026-02-04

### Added

- **Priority Support**: Set reminder priority levels (high/medium/low/none) via native EventKit API
- **Recurring Reminders**: Support for daily, weekly, monthly, yearly recurrence with flexible rules
- **Location Triggers**: Geofence-based reminders that trigger on arrival or departure
- **Tags/Labels**: Cross-list categorization with `[#tag]` format stored in notes
- **Subtasks/Checklists**: Checklist items with progress tracking stored in notes
- **New Tool**: `reminders_subtasks` for managing checklist items within reminders
- **Enhanced Filtering**: Filter by priority, recurring, location-based, and tags
- **Visual Indicators**: 🔄 (recurring), 📍 (location), 🏷️ (tags), 📋 (subtasks) in output
- Reminder link utilities for note management
- Explicit timezone offset to `buildTimeFormat` prompt helper
- `reminderDateParser` for safe timezone-aware date parsing

### Changed

- Enhanced `reminders_tasks` with new parameters: `priority`, `recurrence`, `locationTrigger`, `tags`, `subtasks`
- Added new read filters: `filterPriority`, `filterRecurring`, `filterLocationBased`, `filterTags`
- Added tag management options: `addTags`, `removeTags` for update action
- Added recurrence/location clearing: `clearRecurrence`, `clearLocationTrigger`
- Updated documentation with comprehensive usage examples for all new features

### Fixed

- Documented EventKit limitation: reminder flag status not available in public API
- Timeout management for permission prompt AppleScripts
- Permission prompt race conditions and reliability issues
- Proactive AppleScript trigger for permission prompts
- Quotation marks in daily task prompt date format
- Timezone setting when creating/updating events
- Type narrowing for calendar calendars router
- TypeScript compilation and linting errors in tests and binary validator

## [1.2.0] - 2025-11-15

### Added

- Calendar events complete CRUD support (create, read, update, delete operations)
- Calendar permissions management integrated into EventKit CLI
- Extended JSON Schema support for enhanced MCP tool definitions
- Comprehensive timezone integration tests with DST handling
- Automatic permission handling in handlers layer with retry mechanism
- Shared prompt abstractions for consistent behavior across templates
- Work categorization for intelligent time blocking
- Permission helper utilities and troubleshooting scripts
- Time consistency and helper utilities for improved date handling
- Notes formatting and reminder links utilities

### Changed

- **BREAKING**: Project renamed from `mcp-server-apple-reminders` to `mcp-server-apple-events`
- **BREAKING**: MCP tools renamed to underscore notation (e.g., `reminders_tasks`, `calendar_events`)
- **BREAKING**: RemindersCLI renamed to EventKitCLI for unified Apple services support
- Simplified prompt constraints and abstractions (reduced from ~70 to ~60 constraints)
- Unified confidence policy across all prompt templates
- Removed TypeScript timezone normalization (Swift CLI is single source of truth)
- Moved permission handling entirely to Swift CLI layer
- Enhanced daily task organizer with calendar integration
- Optimized time blocking with research-backed deep work constraints
- Upgraded dependencies and updated lockfile
- Simplified dev server startup process
- Enhanced tool handlers with better error handling and validation

### Fixed

- Timezone handling for bare date strings (e.g., "2025-11-15")
- Auto-trigger permission prompts with AppleScript fallback
- Secure binary path validation with allowed paths constraints
- Support for colonless timezone offsets (e.g., "+0800")
- Persist reminder timezone metadata in EventKit
- Local timezone usage for date parsing instead of UTC
- Support for legacy tool aliases during migration
- Calendar events prompt reference accuracy
- Non-null assertion safety in permission prompt memoization

### Removed

- Permissions tool from MCP interface (handled automatically by Swift CLI)
- Swift permission status checking from TypeScript layer
- Obsolete permission repository and manual helpers
- Unused time consistency and reminder links modules (consolidated)
- Unsupported deep link format from reminders

## [1.1.0] - 2025-10-30

### Added

- Simplified prompts API with improved structure

### Changed

- Refactored prompts module for better type safety
- Removed legacy code and duplicate tests
- Improved validation and formatting for list actions

## [1.0.1] - 2025-10-30

### Changed

- Refactored to remove duplicate list action from reminders tool for improved API clarity

## [1.0.0] - 2025-10-30

### Added

- Complete Swift CLI integration with native EventKit operations
- Dual URL storage strategy (EventKit field + structured notes format)
- Comprehensive input validation and security patterns
- Structured prompt templates for task management workflows
- Enhanced error handling with consistent response formatting
- MCP protocol compliance with standardized tool definitions

### Fixed

- Swift binary compilation and permission handling improvements
- Unicode character support for international reminders
- Binary path resolution with enhanced fallback mechanisms
- Date parsing consistency across different formats

## [0.10.0] - 2025-10-28

### Added

- Move reminder functionality to transfer reminders between lists
- Swift CLI implementation for EventKit integration with dual URL storage
- Support for multiple date formats including ISO 8601
- ID parameter support for reading single reminder details
- Enhanced npx execution without build requirements
- Structured prompt coverage and comprehensive testing

### Fixed

- Due date and URL parameter support for reminder creation
- Jest configuration for better TypeScript support
- Reminder type safety enforcement
- Project root fallback restoration

## [0.9.0] - 2025-10-10

### Added

- Structured prompt registry that consolidates Apple Reminders workflows with shared mission, process, constraint, and quality bar scaffolding.
- Strongly typed prompt metadata and argument parsing for six guided productivity flows surfaced through MCP `ListPrompts` and `GetPrompt` endpoints.

### Changed

- Refined prompt builder utilities to favor constraint-driven message assembly and consistent output formatting across prompts.
- Hardened project root detection helpers with fallback traversal support for launches from nested directories.

### Fixed

- Restored project root fallback traversal so CLI startup resolves the bundled Swift bridge reliably during editor integrations.

## [0.8.1] - 2025-10-09

### Changed

- Updated English and Chinese READMEs so integrators discover the 0.8.0 bulk operations and list CRUD workflows without reverse-engineering the API surface.

### Fixed

- Removed redundant apostrophe escaping in the AppleScript string sanitizer to stop single-quote reminder titles from triggering syntax errors while preserving double-quote safety guarantees.

## [0.8.0] - 2025-09-10

### Added

- Complete CRUD operations for reminder lists with unified interface
- Enhanced URL support with structured format for consistent parsing
- Comprehensive input validation and security enhancements
- Advanced test coverage with integration tests for URL handling

### Changed

- **Enhanced**: URL handling with structured format supporting multiple URL sections
- **Improved**: Error handling and code quality across all modules
- **Optimized**: MCP tools with simplified pure CRUD operations architecture
- **Enhanced**: Reminder functionality with better URL integration
- **Updated**: Test suite with improved mocking and expectations

### Fixed

- URL validation pattern to allow URLs without explicit paths (e.g., https://google.com)
- Multiple URL sections parsing in structured format
- Project root detection with enhanced fallback mechanisms
- Critical test mocking issues and expectations alignment
- Input validation edge cases and security vulnerabilities
- Package.json validation for proper project root identification

## [0.7.3] - 2025-09-03

### Added

- Biome linting for consistent code formatting and quality checks
- Enhanced development workflow with unified cursor rules and standards
- Consolidated development guide for improved onboarding

### Changed

- **Refactored**: Enhanced utility classes and improved code organization
- **Refactored**: Improved server architecture and request handling
- **Enhanced**: Tool handlers with better error handling and validation
- **Updated**: TypeScript configuration for better development experience
- **Improved**: Type definitions and validation schemas for enhanced type safety
- **Enhanced**: Test suites for improved coverage and reliability
- **Updated**: Documentation with improved examples and comprehensive guides

### Fixed

- Improved unicode handling in AppleScript execution
- Removed unnecessary permission checks from MCP handlers
- Enhanced deployment process and resolved build issues
- Extracted common patterns to reduce code duplication

## [0.7.2] - 2025-01-13

### Changed

- **MAJOR REFACTORING**: Restructured entire codebase following SOLID principles and design patterns
- All functions reduced to <20 lines (previously 100+ lines in some cases)
- Eliminated 800+ lines of duplicated code across the application
- Reduced cyclomatic complexity from 15+ to 3-5 in most functions
- Consolidated permissions management from 4 separate files into 1 unified module
- Enhanced tool validation with action-specific parameter requirements
- Improved error messages with detailed validation feedback
- **Optimization**: Removed unnecessary `@jest/globals` dependency, reducing package size and installation time
- **Refactor**: Simplified test file imports by using global Jest functions
- **Performance**: Reduced development dependencies count, improving project build efficiency

### Fixed

- Swift permission checking deadlock by removing `exit()` calls before dispatch group cleanup
- ES module import consistency by replacing `require()` with proper `import` statements
- TypeScript compilation errors with proper null handling for optional parameters
- Validation schema conflicts with intelligent list selection feature
- Binary path resolution with enhanced fallback mechanisms
- Fixed TypeScript compilation errors in build process, ensuring all test files work properly

## [0.7.1] - 2025-08-20

### Added

- Comprehensive permissions management system with proactive EventKit and AppleScript permission validation
- Conditional subschemas for precise action-specific parameter validation using JSON Schema `allOf/if/then` constructs
- 9 new utility modules following separation of concerns and SOLID principles
- Repository pattern implementation for clean data access abstraction
- Strategy pattern for pluggable reminder organization algorithms (priority, due date, category, completion status)
- Builder pattern for reusable AppleScript generation
- Centralized error handling with consistent response patterns
- User-friendly permission guidance with system-specific troubleshooting instructions

## [0.7.0] - 2025-08-15

### Added

- Comprehensive binary validation and security module for enhanced system protection
- Unicode validation and handling for international character support
- Enhanced security checks for binary path validation

### Changed

- **BREAKING**: Unified tool architecture from 6 tools to 2 action-based tools for improved usability
- Streamlined API structure reduces complexity while maintaining full functionality
- Enhanced async handling for system preferences
- Optimized date-only implementation with improved architecture

### Fixed

- Resolved merge conflicts and build errors after refactor merge
- Corrected AppleScript date format consistency issues
- Fixed binary path discovery fallbacks

## [0.6.0] - 2025-08-05

### Added

- Batch operations for organizing multiple reminders with `update_reminder` tool
- Organization strategies: priority, due date, category, and completion status
- Dynamic list creation through `list_reminder_lists` tool with `createNew` parameter
- Flexible filtering for batch operations (completion status, search terms, due dates)
- Auto-list creation during batch organization operations

### Changed

- Enhanced `update_reminder` tool to support batch mode for organizing multiple reminders
- Updated `list_reminder_lists` tool to support creating new reminder lists
- Improved documentation in CLAUDE.md for new batch operation features

### Fixed

- Resolved merge conflicts and build errors after refactor merge
- Corrected AppleScript date format to use proper English month names (MMMM D, YYYY)

## [0.5.2] - 2025-07-15

### Changed

- Comprehensive date handling optimization and enhancement
- Optimized date utility test structure and fixed TypeScript issues

### Fixed

- Updated date format for AppleScript compatibility
- Force English locale for AppleScript compatibility to ensure consistent date parsing
- Locale-independent date format implementation for Apple Reminders

## [0.5.1] - 2025-07-01

### Added

- Date-only reminder support with locale-independent parsing
- Enhanced date parsing with improved architecture

### Changed

- Optimized date-only implementation with better error handling

## [0.5.0] - 2025-06-25

### Added

- URL support for reminders with seamless note integration
- Advanced MCP server features and enhanced functionality
- Comprehensive documentation updates

### Changed

- Enhanced reminder handling with improved note and URL integration
- Updated Jest configuration for better ES modules support
- Removed 'URL:' prefix from reminder notes for cleaner integration

### Fixed

- Improved handling of empty notes with URLs in update reminder functionality

## [0.4.0] - 2025-05-20

### Added

- Update, delete, and move operations for reminders
- Enhanced filtering capabilities for `list_reminders` tool
- Comprehensive test coverage for enhanced list functionality
- MseeP.ai security assessment badge

### Removed

- Priority and recurrence features that weren't implemented

## [0.3.2] - 2025-05-10

### Added

- Caching for system 24-hour time preference detection
- Support for both 12-hour and 24-hour formats based on system settings

### Changed

- Refactored AM/PM logic using built-in formatting capabilities
- Enhanced date parsing to dynamically support system time format preferences

## [0.3.1] - 2025-04-30

### Added

- Enhanced project metadata and comprehensive documentation

### Fixed

- Improved date parsing error handling in parseDate function

## [0.3.0] - 2025-04-15

### Added

- Migration to npm package management
- Updated dependencies for better compatibility

### Changed

- Moved from previous package manager to npm
- Updated project structure for npm distribution

## [0.2.0] - 2025-03-20

### Added

- Native Swift integration for reminder management using EventKit
- Enhanced project documentation and structure
- Improved reminder creation date format specification

### Changed

- Refactored reminder list handling for better performance
- Updated documentation with comprehensive usage examples

## [0.1.0] - 2025-02-15

### Added

- Enhanced reminder creation and listing with note support
- Modular code organization into src/ directory structure

### Changed

- Reorganized codebase into proper module structure
- Improved reminder creation workflow

## [0.0.1] - 2025-01-30

### Added

- Initial project setup for MCP server
- Basic Apple Reminders integration
- Foundation for macOS native reminder management

[unreleased]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.6.2...HEAD
[1.6.2]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/FradSer/mcp-server-apple-events/releases/tag/v1.0.0
[0.10.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.7.3...v0.8.0
[0.7.3]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.7.0...v0.7.1
[0.7.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/FradSer/mcp-server-apple-events/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/FradSer/mcp-server-apple-events/releases/tag/v0.0.1
