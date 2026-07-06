# Apple Events MCP Server

## Project Overview
This project is a Model Context Protocol (MCP) server that provides native integration with Apple Reminders and Apple Calendar on macOS. It allows AI agents to read, create, update, and delete reminders and calendar events, manage lists, and organize tasks using natural language.

**Key Technologies:**
*   **Runtime:** Node.js (TypeScript)
*   **Native Integration:** Swift (EventKit)
*   **Protocol:** Model Context Protocol (MCP) SDK
*   **Validation:** Zod
*   **Testing:** Jest
*   **Linting/Formatting:** Biome

## Architecture
The project follows a 4-layer Clean Architecture:
1.  **Server Layer** (`src/server/`): Handles MCP protocol communication and request routing.
2.  **Handlers Layer** (`src/tools/handlers/`): Business logic for specific tools (reminders, calendars).
3.  **Utils/Repository Layer** (`src/utils/`): Helper functions, validation, data access patterns, and `eventCli.ts` — the wrapper around the vendored `event` CLI.
4.  **Native Bridge**: The vendored [`event`](https://github.com/FradSer/event) Swift CLI (built from `vendor/event` submodule into `bin/event`) directly interacts with the macOS EventKit API and handles permissions.

## Building and Running

### Prerequisites
*   Node.js 18+
*   macOS (for EventKit integration)
*   Xcode Command Line Tools (for Swift compilation)
*   pnpm

### Commands
*   **Install Dependencies:** `pnpm install` (also builds `bin/event` via postinstall on macOS)
*   **Build (TS & event CLI):** `pnpm build` (Required before starting)
*   **Build event CLI Only:** `pnpm build:event`
*   **Start Server:** `pnpm start` (Runs via stdio)
*   **Development Mode:** `pnpm dev`
*   **Run Tests:** `pnpm test`
*   **Lint & Format:** `pnpm lint` (Uses Biome)

## Available Tools
The server exposes 5 main tools:

1.  **`reminders_tasks`**: CRUD operations for individual reminders (create, read, update, delete). Supports filtering by list, due date, etc.
2.  **`reminders_lists`**: Manage reminder lists (create, read, update, delete).
3.  **`calendar_events`**: CRUD operations for calendar events. Supports time blocking and scheduling.
4.  **`calendar_calendars`**: Read-only access to available calendars.
5.  **`reminders_subtasks`**: Manages subtasks/checklists within reminders (create, read, update, delete, toggle, reorder).

## Permission Handling
The vendored `event` CLI requests EventKit permissions via the native async APIs (`requestFullAccessToReminders` / `requestFullAccessToEvents`). When access is denied / restricted / write-only it emits `Error: Permission denied: …` on stderr; `src/utils/eventCli.ts` maps that into a domain-typed `CliPermissionError` (`reminders` or `calendars`). Permission prompts are attributed to whichever host process spawns `bin/event` (Claude Desktop, Cursor, etc.) — the binary itself carries no embedded Info.plist.

## Critical Constraints
*   **macOS Only**: Strictly requires macOS with the EventKit framework.
*   **Binary Security**: `binaryValidator.ts` restricts the executable path to `bin/event` under the resolved project root.
*   **Date Formats**: Favors `YYYY-MM-DD HH:mm:ss` for local time and ISO 8601 for UTC.

## Development Guidelines

### Coding Style
*   **Language:** TypeScript (NodeNext) & Swift.
*   **Formatting:** Strictly follow Biome configuration (`biome.json`). Single quotes, space indentation.
*   **Imports:** Organize imports.

### Testing
*   **Framework:** Jest.
*   **Scope:** Unit tests for TypeScript logic, integration tests for the Swift bridge (mocked or actual).
*   **Command:** `pnpm test`

### Contribution
*   **Commits:** Follow Conventional Commits (e.g., `feat:`, `fix:`, `chore:`).
*   **Workflow:** Ensure `pnpm build` and `pnpm test` pass before committing.

## Key Files
*   `src/index.ts`: Entry point.
*   `src/server/server.ts`: Server configuration.
*   `vendor/event/`: git submodule pointing at the vendored Swift CLI (FradSer/event).
*   `src/utils/eventCli.ts`: Wrapper around `bin/event` — argv composition, raw JSON parsing, stderr → error mapping.
*   `scripts/build-event.mjs`: Builds `vendor/event` and produces `bin/event`.
*   `src/tools/definitions.ts`: MCP tool schema definitions.
*   `src/tools/handlers/subtaskHandlers.ts`: Subtask business logic.
*   `docs/migration-to-event-cli.md`: Dropped-field table & migration notes.
*   `package.json`: Project configuration and scripts.
