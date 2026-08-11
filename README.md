# Apple Events MCP Server ![Version 1.5.0](https://img.shields.io/badge/version-1.5.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

[![MCP Toplist](https://mcptoplist.com/badge/glama%2FFradSer%2Fmcp-server-apple-events.svg)](https://mcptoplist.com/server/glama%2FFradSer%2Fmcp-server-apple-events)

[![X Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://x.com/FradSer)

English | [简体中文](README.zh-CN.md)

A Model Context Protocol (MCP) server providing native integration with Apple Reminders and Calendar on macOS via the EventKit framework. Exposes reminders, lists, subtasks, and calendar events through a standardized interface with full CRUD operations.

The EventKit backend is the standalone [`event`](https://github.com/FradSer/event) Swift CLI, vendored as a git submodule and built into `bin/event` during `pnpm install` — no separate `brew install` required. See [docs/migration-to-event-cli.md](docs/migration-to-event-cli.md) for the v1.5.0 backend swap and the list of write fields not yet exposed by `event`.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [macOS Permissions](#macos-permissions)
- [Usage Examples](#usage-examples)
- [Available MCP Tools](#available-mcp-tools)
- [Structured Prompt Library](#structured-prompt-library)
- [Development](#development)
- [License](#license)
- [Contributing](#contributing)

## Features

- Full CRUD for reminders, subtasks, reminder lists, and calendar events
- Priority (high/medium/low/none), tags, and checklist subtasks with progress tracking
- Multi-criteria filtering: completion, due-date range, priority, tags, full-text search, recurring, location-based
- Flexible date formats (`YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, ISO 8601) with timezone awareness
- Native macOS integration via EventKit — values configured in Reminders.app / Calendar.app round-trip through read responses
- Automatic macOS permission discovery and prompting
- Full Unicode support with comprehensive input validation

## Prerequisites

- **Node.js 20 or later**
- **macOS** (required for EventKit)
- **Xcode Command Line Tools** (only when building from source)
- **pnpm** (recommended)

The published npm package ships a pre-built, universal, code-signed `bin/event` binary, so `npx` users need neither Xcode nor a Swift toolchain. Building from a git clone requires the items above.

## Quick Start

```bash
npx mcp-server-apple-events
```

## Configuration

Add the server to your MCP client. The `npx` form works for every client below; for a local build, replace `command`/`args` with `node` pointing at `dist/index.js`.

### Cursor

Settings → MCP → Add new global MCP server:

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "npx",
      "args": ["-y", "mcp-server-apple-events"]
    }
  }
}
```

### ChatWise

Settings → Tools → "+", then:

- Type: `stdio`
- ID: `apple-reminders`
- Command: `mcp-server-apple-events`
- Args: (empty)

### Claude Desktop

Edit `claude_desktop_config.json` (open it via Settings → Developer Option → Edit Config, or directly at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS / `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "npx",
      "args": ["-y", "mcp-server-apple-events"]
    }
  }
}
```

For a local build:

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-apple-events/dist/index.js"]
    }
  }
}
```

See the [official MCP docs](https://modelcontextprotocol.io/docs/develop/connect-local-servers) for connecting local servers. Restart Claude Desktop completely (quit, not just close) for changes to take effect.

## macOS Permissions

The vendored `event` CLI embeds its own Info.plist (bundle id `me.frad.event`) declaring all Reminders and Calendar privacy strings, and is spawned through the bundled `bin/event-disclaim` shim, which disclaims TCC responsibility at spawn time. macOS therefore attributes the permission request to **`event`** itself, not the app that launched the MCP server — so the first EventKit call prompts for "event", the grant appears under `System Settings > Privacy & Security > Reminders / Calendars` as `event`, and one grant covers every MCP client on the machine (Claude Desktop, Codex Desktop, Cursor, terminal clients, …). See [issue #93](https://github.com/FradSer/mcp-server-apple-events/issues/93) for background.

When `event` detects a `notDetermined` status it calls `requestFullAccessToReminders` / `requestFullAccessToEvents`, which surfaces the system prompt. If the OS ever loses track of permissions, rerun `./check-permissions.sh` to re-open the dialogs.

### Calendar read errors

If you see `Failed to read calendar events`, set Calendar to **Full Calendar Access** under `System Settings > Privacy & Security > Calendars`, or rerun `./check-permissions.sh` (it checks both Reminders and Calendars).

### Recovering a stuck TCC state (no prompt ever appears)

If the permission dialog never appears and `event` is missing from `System Settings → Privacy & Security → Reminders / Calendars`, your machine is in a stale/misattributed TCC state. The server-side disclaim fix prevents this on a clean machine but cannot clear already-corrupted entries. Recovery:

1. Reset Calendar and Reminders TCC entries globally (per-app reset frequently does **not** work — the bare form clears all entries, which is what clears the bad state):

   ```bash
   tccutil reset Calendar
   tccutil reset Reminders
   ```

   > This clears Calendar/Reminders access for **every** app; other apps re-prompt next time.

2. Re-trigger the permission from inside a Claude conversation (Claude Desktop or Claude Code) by asking, e.g., *"Use AppleScript to check my Calendar and Reminders."* Grant access and the server should work normally. See [issue #83](https://github.com/FradSer/mcp-server-apple-events/issues/83).

### Headless / launchd runs hang instead of failing

When the server runs from a context with no GUI session (SSH, launchd agent/daemon), the first EventKit call can block forever waiting on a permission prompt that can never be rendered — the MCP request never settles and a child process leaks per call. The server now kills any `event` call that exceeds 30 s (`SIGKILL`) and returns a readable error instead. Tune it with the `EVENTKIT_CLI_TIMEOUT_MS` environment variable (milliseconds; invalid/zero values fall back to the default — the timeout cannot be disabled, though huge values up to `2^31-1` ms are accepted). The vendored `event` CLI (pinned via [FradSer/event#15](https://github.com/FradSer/event/pull/15)) additionally fails fast when no GUI session exists and gives up on an unanswerable prompt after 15 s (`EVENT_PERMISSION_TIMEOUT_MS`), reporting `Permission denied: Timed out waiting for ...` so the host can show a permission-specific message before the server's kill fires (15 s < 30 s). See [issue #113](https://github.com/FradSer/mcp-server-apple-events/issues/113).

### macOS 26 (Tahoe) `could not build module 'Foundation'`

If `pnpm build` fails with `could not build module 'Foundation'` (or `SDK is not supported by the compiler`), your Swift toolchain is older than the macOS 26 SDK requires — it needs **Swift 6.3 or newer**, but the Command Line Tools shipped with early macOS 26 point releases include Swift 6.2.x. `pnpm build:event` detects this and prints the same remediation; see [issue #85](https://github.com/FradSer/mcp-server-apple-events/issues/85). Fix by installing Xcode 26.x from the App Store, or updating Command Line Tools to a Swift 6.3+ version:

```bash
softwareupdate --list
sudo softwareupdate -i "Command Line Tools for Xcode-<latest>"
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer   # if full Xcode is installed
xcrun swiftc --version    # should report Apple Swift version 6.3 or newer
```

## Usage Examples

Once configured, ask Claude to interact with your Apple Reminders and Calendar. Example prompts:

```text
Create a reminder to "Buy groceries" for tomorrow at 5 PM with tags shopping and errands.
Add a high-priority reminder to "Finish quarterly report" due Friday in my "Work" list.
Create "Grocery shopping" with subtasks: milk, eggs, bread, butter.
Show me all high-priority reminders due today tagged "urgent".
Show subtasks for my "Grocery shopping" reminder and mark "milk" as complete.
Update "Buy groceries" — change the title to "Buy organic groceries" and set priority to high.
Show reminders from my "Work" list, and list all my reminder lists.
Create a calendar event "Team standup" tomorrow from 9:00 to 9:30 in "Work".
Show my calendar events for the next week.
```

The server processes natural-language requests, interacts with Apple's native Reminders and Calendar apps, and returns formatted results.

> Alarms, recurrence rules, and location triggers are read-only via this server — configure them in Reminders.app / Calendar.app. They still appear in read results with visual indicators.

## Available MCP Tools

Service-scoped tools mirror Apple Reminders and Calendar domains. All take an `action` field plus action-specific parameters (the MCP client introspects the full Zod schema; only actions are listed here). Date fields accept `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss` (local time), or ISO 8601 with timezone.

| Tool | Actions | Notes |
| --- | --- | --- |
| `reminders_tasks` | `read`, `create`, `update`, `delete` | Priority, tags, subtasks. `startDate` is set via `update`, not `create`; on `read` it scopes the due-date window alongside `endDate`. Cross-list moves unsupported. |
| `reminders_subtasks` | `read`, `create`, `update`, `delete`, `toggle`, `reorder` | Stored in the notes field (human-readable in Reminders.app). |
| `reminders_lists` | `read`, `create`, `update`, `delete` | Rename via `name` → `newName`. |
| `calendar_events` | `read`, `create`, `update`, `delete` | All-day inferred from date format. Cross-calendar moves unsupported. `span` scopes recurring deletes. |
| `calendar_calendars` | `read` | Calendars holding ≥1 event in the (optional) `startDate`/`endDate` window. |

Example calls:

```json
{
  "action": "create",
  "title": "Buy groceries",
  "dueDate": "2024-03-25 18:00:00",
  "targetList": "Shopping",
  "note": "Don't forget milk and eggs",
  "priority": 1,
  "tags": ["shopping", "errands"],
  "subtasks": ["Milk", "Eggs", "Bread"]
}
```

```json
{ "action": "read", "filterList": "Work", "dueWithin": "today", "filterPriority": "high", "filterTags": ["urgent"] }
```

```json
{ "action": "read", "startDate": "2026-08-01", "endDate": "2026-08-31" }
```

```json
{ "action": "update", "id": "reminder-123", "completed": false, "addTags": ["followup"] }
```

```json
{ "action": "toggle", "reminderId": "reminder-123", "subtaskId": "a1b2c3d4" }
```

```json
{ "action": "create", "name": "Project Alpha" }
```

```json
{ "action": "create", "title": "Team standup", "startDate": "2026-05-04 09:00:00", "endDate": "2026-05-04 09:30:00", "targetCalendar": "Work" }
```

### Read response shape

Read responses carry visual indicators: 🔄 recurring, 📍 location-based, 🏷️ has tags, 📋 has subtasks. Example:

```text
- [ ] Buy groceries 🏷️📋
  - List: Shopping
  - ID: reminder-123
  - Priority: high
  - Tags: #shopping #errands
  - Subtasks (1/3):
    - [x] Milk
    - [ ] Eggs
    - [ ] Bread
  - Due: 2024-03-25 18:00:00
```

The `url` field is stored in the native `url` property (visible via the "i" icon in Reminders.app) and also appended to the notes in a structured `URLs:` block for parsing and multi-URL support. URLs accept any valid URI scheme (`http`, `https`, `mailto`, `tel`, `obsidian`, `shortcuts`, …); `file`, `javascript`, `data`, and similar dangerous schemes are rejected, and http(s) hostnames are checked against an SSRF blocklist.

> **Read-only fields**: alarms, recurrence rules, location triggers, structured locations, calendar `url`/`availability`/`isAllDay`, and cross-calendar moves are not writable via this server — they round-trip from values configured in Reminders.app / Calendar.app. See [docs/migration-to-event-cli.md](docs/migration-to-event-cli.md) for the full dropped-field table and workarounds.

## Structured Prompt Library

The server ships a prompt registry exposed via the MCP `ListPrompts` / `GetPrompt` endpoints. Each template shares a mission, context inputs, numbered process, constraints, output format, and quality bar so downstream assistants get predictable scaffolding.

- **daily-task-organizer** — optional `today_focus`; produces a same-day execution blueprint, balances priority work with recovery, auto-creates calendar time blocks for due-today reminders.
- **smart-reminder-creator** — optional `task_idea`; generates an optimally scheduled reminder structure.
- **reminder-review-assistant** — optional `review_focus` (e.g. `overdue` or a list name); audits and optimizes existing reminders.
- **weekly-planning-workflow** — optional `user_ideas`; guides a Monday-through-Sunday reset with time blocks tied to existing lists.

Prompts are constrained to native Apple Reminders capabilities and ask for missing context before irreversible actions. Run `pnpm test -- src/server/prompts.test.ts` after amending prompt copy.

## Development

```bash
pnpm install        # postinstall builds bin/event from vendor/event on macOS
pnpm build          # TypeScript + vendored event CLI
pnpm test           # Jest suite: repositories, schemas, build script, prompt templates
pnpm exec biome check   # lint + format
```

The CLI entry point walks up to ten directories to find `package.json`, so the server can start from nested paths (e.g. `dist/` or editor task runners) without losing `bin/event`. Keep the manifest reachable within that depth if you customize the folder layout.

### Scripts

- `pnpm build` — TypeScript + vendored `event` CLI (required before running from source)
- `pnpm build:ts` — TypeScript only
- `pnpm build:event` — vendored `event` CLI only (`swift build -c release` → `bin/event`)
- `pnpm build:release` — build plus notarization (release packaging)
- `pnpm test` / `pnpm test:ci` — Jest suite / with coverage
- `pnpm lint` — Biome format/fix + TypeScript type check
- `pnpm check` — lint + tests with coverage

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
