# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/FradSer/mcp-server-apple-events/compare/v1.4.0...HEAD
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
