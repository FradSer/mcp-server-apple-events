# Apple Events MCP Server ![Version 1.5.0](https://img.shields.io/badge/version-1.5.0-blue) ![License: MIT](https://img.shields.io/badge/license-MIT-green)

[![X Follow](https://img.shields.io/twitter/follow/FradSer?style=social)](https://x.com/FradSer)

English | [简体中文](README.zh-CN.md)

A Model Context Protocol (MCP) server that provides native integration with Apple Reminders and Calendar on macOS. It exposes Apple Reminders and Calendar Events through a standardized interface with full CRUD operations.

> [!NOTE]
> **How this server is built: [event](https://github.com/FradSer/event) — a pure Swift CLI for Apple Reminders and Calendar on macOS.**
>
> As of v1.5.0, this server's EventKit backend is the standalone [`event`](https://github.com/FradSer/event) CLI. It is vendored as a git submodule under `vendor/event` and built during `pnpm install`, so `bin/event` ships inside this package and no separate `brew install` is required. The two projects share one Swift codebase. A number of MCP tool write fields were dropped in the swap because `event` does not expose CLI flags for them yet — alarms, recurrence rules, location triggers, reminder `location`, calendar `url` / `structuredLocation` / `availability` / `isAllDay` writes, and cross-calendar moves. Read paths are preserved verbatim, so values configured in Reminders.app or Calendar.app still round-trip through this server. See [docs/migration-to-event-cli.md](docs/migration-to-event-cli.md) for the full dropped-field table and workarounds. For scripting and automation outside this MCP server, prefer the standalone [`event`](https://github.com/FradSer/event) CLI directly.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [macOS Permission Requirements](#macos-permission-requirements-sonoma-14--sequoia-15)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Structured Prompt Library](#structured-prompt-library)
- [Available MCP Tools](#available-mcp-tools)
- [Organization Strategies](#organization-strategies)
- [Tags System](#tags-system)
- [Development](#development)
- [License](#license)
- [Contributing](#contributing)

## Features

### Core Functionality

- **List Management**: View all reminders and reminder lists with advanced filtering options
- **Reminder Operations**: Full CRUD operations (Create, Read, Update, Delete) for reminders across lists
- **Rich Content Support**: Titles, notes, due/start dates, URLs, priority, tags, and completion status
- **Native macOS Integration**: Direct integration with Apple Reminders using the EventKit framework

### Enhanced Reminder Features

- **Priority Support**: Set reminder priority (high/medium/low/none) with visual indicators
- **Tags/Labels**: Organize reminders with custom tags for cross-list categorization and filtering
- **Subtasks/Checklists**: Add checklist items to reminders with progress tracking
- **Recurrence, Alarms, and Location Triggers**: Read-only via this server — configure them in Reminders.app. They round-trip through read responses and display visual indicators.

### Advanced Features

- **Smart Organization**: Automatic categorization and intelligent filtering by priority, due date, category, or completion status
- **Multi-criteria Search**: Filter by completion status, due date ranges, tags, and full-text search
- **Permission Management**: Automatic validation and request for required macOS system permissions
- **Flexible Date Handling**: Multiple date formats (`YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, ISO 8601) with timezone awareness
- **Unicode Support**: Full international character support with comprehensive input validation

### Technical Excellence

- **Clean Architecture**: 4-layer architecture following Clean Architecture principles with dependency injection
- **Type Safety**: Complete TypeScript coverage with Zod schema validation for runtime type checking
- **High Performance**: Swift-compiled binary for performance-critical EventKit operations
- **Robust Error Handling**: Consistent error responses with detailed diagnostic information
- **Repository Pattern**: Data access abstraction with standardized CRUD operations

## Prerequisites

- **Node.js 20 or later**
- **macOS** (required for Apple Reminders integration)
- **Xcode Command Line Tools** (required for compiling Swift code when building from source)
- **pnpm** (recommended for package management)

The published npm package ships a pre-built, universal, code-signed `bin/event` binary, so `npx` users do not need Xcode or a Swift toolchain. Building from a git clone requires the items above.

## macOS Permission Requirements (Sonoma 14+ / Sequoia 15)

Apple separates Reminders and Calendar permissions into _write-only_ and _full-access_ scopes. The vendored `event` CLI embeds its own Info.plist (bundle id `me.frad.event`) declaring all the privacy strings:

- `NSRemindersUsageDescription`
- `NSRemindersFullAccessUsageDescription`
- `NSRemindersWriteOnlyAccessUsageDescription`
- `NSCalendarsUsageDescription`
- `NSCalendarsFullAccessUsageDescription`
- `NSCalendarsWriteOnlyAccessUsageDescription`

The MCP server spawns `event` through the bundled `bin/event-disclaim` shim, which disclaims TCC responsibility at spawn time — so macOS attributes the permission request to `event` itself, not to whichever app launched the MCP server. The first EventKit call therefore shows a prompt for **"event"**, and the grant appears under `System Settings > Privacy & Security > Reminders / Calendars` as `event`. One grant covers every MCP client on the machine (Claude Desktop, Codex Desktop, Cursor, terminal clients, …).

When the CLI detects a `notDetermined` authorization status it calls `requestFullAccessToReminders` / `requestFullAccessToEvents`, which triggers macOS to show the correct prompt. If the OS ever loses track of permissions, rerun `./check-permissions.sh` to re-open the dialogs.

If a Claude tool call still encounters a permission failure, see *Desktop MCP clients* below.

### Troubleshooting Calendar Read Errors

If you see `Failed to read calendar events`, verify Calendar is set to **Full Calendar Access**:

- Open `System Settings > Privacy & Security > Calendars`
- Find the app that launches this MCP server (for example Terminal or Claude Desktop)
- Change access to **Full Calendar Access**

You can also re-run `./check-permissions.sh` (it validates both Reminders and Calendars access).

### Desktop MCP clients (Claude Desktop, Codex Desktop, …)

macOS attributes Reminders and Calendar access to the **responsible** process. By default that is the desktop app that launched the MCP server, not the `event` subprocess — and if that app's bundle is missing the `NSRemindersUsageDescription` / `NSCalendarsUsageDescription` keys (Codex Desktop ships only `NSAppleEventsUsageDescription`), TCC refuses the request before EventKit is even reached:

```text
Reminder permission denied. Unknown error
```

Since the fix for [issue #93](https://github.com/FradSer/mcp-server-apple-events/issues/93), this server breaks that attribution chain itself: `bin/event` is always spawned through the `bin/event-disclaim` shim, which uses the same responsibility-disclaim spawn attribute as Chromium and LLDB, so `event` becomes its own TCC-responsible process. `event` embeds the required usage strings and is signed with the `com.apple.security.personal-information.{reminders,calendars}` hardened-runtime entitlements, so the EventKit prompt appears no matter which desktop client launched the server.

Notes after upgrading:

- The permission prompt (and the entry in `System Settings > Privacy & Security`) is now for **`event`**, not for Terminal / Claude Desktop / Codex Desktop. Existing grants made to those host apps no longer apply to the MCP server; approve the new `event` prompt once.
- With an ad-hoc (local) build, macOS keys the grant to the exact binary hash — rebuilding `bin/event` re-prompts. Prebuilt npm releases are Developer ID-signed, so the grant is stable across updates. Local builds can set `APPLE_SIGNING_IDENTITY` for the same stability.
- Running `./bin/event` directly (without the shim) still uses host attribution, so direct Terminal use keeps working exactly as before via Terminal's own grant.

#### Recovering a stuck TCC state (no prompt ever appears)

If the Calendar/Reminders permission dialog never appears at all and `event` is missing from **System Settings → Privacy & Security → Reminders / Calendars**, your machine is likely in a stale/misattributed TCC state. The server-side disclaim fix above prevents this on a clean machine, but it cannot clear entries that are already corrupted. The reliable recovery is:

1. **Reset Calendar and Reminders TCC entries *globally* (not per-app)** in Terminal:

   ```bash
   tccutil reset Calendar
   tccutil reset Reminders
   ```

   Resetting *per-bundle* (e.g. `tccutil reset Calendar com.anthropic.claudefordesktop`) frequently does **not** work — the stale/misattributed entries that block the prompt survive. The bare forms clear *all* entries for that service, which is what actually clears the bad state.

   > Note: this clears Calendar/Reminders access for **every** app. Other apps will re-prompt the next time they need access.

2. **Re-trigger the permission from inside the Claude client.** After the reset, in a Claude conversation (Claude Desktop or Claude Code), ask something like:

   > "Use AppleScript to check my Calendar and Reminders."

   This reliably invokes the system permission flow and macOS surfaces the normal Calendar/Reminders prompt. Grant access and the MCP server should work normally. See [issue #83](https://github.com/FradSer/mcp-server-apple-events/issues/83) for the original report and confirmation.

**Verification command**

```bash
pnpm test -- src/__tests__/build-event.test.ts
```

This pins the contract of `scripts/build-event.mjs` — the build compiles `vendor/event` once per architecture (arm64 + x86_64) via `swift build -c release` with the Info.plist linked into the `__TEXT,__info_plist` section, merges the two with `lipo` into a universal `bin/event`, compiles the `bin/event-disclaim` shim from `scripts/disclaim.c`, and code-signs both (Developer ID Application certificate when available, ad-hoc fallback otherwise) with hardened runtime — `event` additionally with the personal-information entitlements.

### Troubleshooting `could not build module 'Foundation'` on macOS 26 (Tahoe)

If `pnpm build` fails with `could not build module 'Foundation'` (or `SDK is not supported by the compiler`), your Swift toolchain is older than the macOS 26 SDK requires. The macOS 26+ SDK ships a `Foundation.swift-interface` that needs **Swift 6.3 or newer**; the Command Line Tools that shipped with the first macOS 26 point releases include Swift 6.2.x, which cannot parse it. See [issue #85](https://github.com/FradSer/mcp-server-apple-events/issues/85).

`pnpm build:event` now detects this mismatch and prints the same remediation, but if you hit it manually:

1. Install Xcode 26.x from the App Store (ships Swift 6.3+), or
2. Update Command Line Tools to a version that ships Swift 6.3+:
   ```bash
   softwareupdate --list
   sudo softwareupdate -i "Command Line Tools for Xcode-<latest>"
   ```
3. If both are installed, point `xcode-select` at the full Xcode:
   ```bash
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   ```

Verify with:

```bash
xcrun swiftc --version          # should report Apple Swift version 6.3 or newer
xcrun --show-sdk-version        # should match your macOS major version
```

## Quick Start

Run the server directly using `npx`:

```bash
npx mcp-server-apple-events
```

## Configuration

### Configure Cursor

1. Open Cursor
2. Open Cursor settings
3. Click on "MCP" in the sidebar
4. Click "Add new global MCP server"
5. Configure the server with the following settings:

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

### Configure ChatWise

1. Open ChatWise
2. Go to Settings
3. Navigate to the Tools section
4. Click the "+" button
5. Configure the tool with the following settings:
   - Type: `stdio`
   - ID: `apple-reminders`
   - Command: `mcp-server-apple-events`
   - Args: (leave empty)

### Configure Claude Desktop

Configure Claude Desktop to recognize the Apple Events MCP server. There are two ways to access the configuration:

#### Option 1: Through Claude Desktop UI

1. Open Claude Desktop app
2. Enable Developer Mode from the top-left menu bar
3. Open Settings and navigate to the Developer Option
4. Click the Edit Config button to open `claude_desktop_config.json`

#### Option 2: Direct File Access

For macOS:

```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

For Windows:

```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

Add the following configuration to your `claude_desktop_config.json`:

**Option A: Using npx (recommended)**

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

**Option B: Using local build**

If you have built the project locally, use node with the path to `dist/index.js`:

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

For more information on connecting local MCP servers, see the [official MCP documentation](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

Restart Claude Desktop completely (quit, not just close the window) for the changes to take effect. Look for the tool icon to verify the Apple Events server is connected.

## Usage Examples

Once configured, you can ask Claude to interact with your Apple Reminders. Here are some example prompts:

### Creating Reminders

```text
Create a reminder to "Buy groceries" for tomorrow at 5 PM.
Add a reminder to "Call mom" with a note "Ask about weekend plans".
Create a reminder in my "Work" list to "Submit report" due next Friday.
Create a reminder with URL "Check this website: https://google.com".
```

### Creating Reminders with Priority

```text
Create a high priority reminder to "Finish quarterly report" due Friday.
Add an urgent high-priority reminder to "Call client back" for today.
Create a medium priority reminder to "Review documents".
```

### Creating Reminders with Tags

```text
Create a reminder "Review PR" with tags work and urgent.
Add a reminder "Buy birthday gift" tagged personal and shopping.
Create a reminder with tags: project-alpha, backend, review.
```

### Creating Reminders with Subtasks

```text
Create a reminder "Grocery shopping" with subtasks: milk, eggs, bread, butter.
Add a reminder "Pack for trip" with checklist items: passport, charger, clothes, toiletries.
Create "Sprint planning" with subtasks: review backlog, estimate stories, assign tasks.
```

### Managing Subtasks

```text
Show subtasks for my "Grocery shopping" reminder.
Mark the "milk" subtask as complete.
Add a new subtask "cheese" to my grocery list reminder.
Reorder the subtasks in my packing list.
```

### Filtering Reminders

```text
Show me all high priority reminders.
Show reminders tagged with "work".
Show recurring reminders only.
Find location-based reminders.
Show reminders with incomplete subtasks.
```

### Update Reminders

```text
Update the reminder "Buy groceries" with a new title "Buy organic groceries".
Update "Call mom" reminder to be due today at 6 PM.
Update the reminder "Submit report" and mark it as completed.
Change the notes on "Buy groceries" to "Don't forget milk and eggs".
Set priority to high on my "Finish report" reminder.
Add the tag "urgent" to my "Review PR" reminder.
```

### Managing Reminders

```text
Show me all my reminders.
List all reminders in my "Shopping" list.
Show my completed reminders.
```

### Working with Lists

```text
Show all my reminder lists.
Show reminders from my "Work" list.
```

The server will process your natural language requests, interact with Apple's native Reminders app, return formatted results to Claude, and maintain native integration with macOS.

> Recurring reminders, alarms, and location-based triggers are read-only via this server. Configure them in Reminders.app — they still appear in read results with visual indicators.

## Structured Prompt Library

The server ships with a consolidated prompt registry exposed via the MCP `ListPrompts` and `GetPrompt` endpoints. Each template shares a mission, context inputs, numbered process, constraints, output format, and quality bar so downstream assistants receive predictable scaffolding instead of brittle free-form examples.

- **daily-task-organizer** — optional `today_focus` (what you most want to accomplish today) input produces a same-day execution blueprint that keeps priority work balanced with recovery time. Supports intelligent task clustering, focus block scheduling, automatic reminder list organization, and auto-creates calendar time blocks when many due-today reminders need fixed slots. Quick Win clusters become 15-minute "Focus Sprint — [Outcome]" holds that finish at each reminder's due timestamp, while Standard tasks map to 30-, 45-, or 60-minute events anchored to the same due-time window.
- **smart-reminder-creator** — optional `task_idea` (a short description of what you want to do) generates an optimally scheduled reminder structure.
- **reminder-review-assistant** — optional `review_focus` (e.g., overdue or a list name) to audit and optimize existing reminders.
- **weekly-planning-workflow** — optional `user_ideas` (your thoughts and ideas for what you want to accomplish this week) guides a Monday-through-Sunday reset with time blocks tied to existing lists.

### Design constraints and validation

- Prompts are intentionally constrained to native Apple Reminders capabilities (no third-party automations) and ask for missing context before committing to irreversible actions.
- Shared formatting keeps outputs renderable as Markdown sections or tables without extra parsing glue in client applications.
- Run `pnpm test -- src/server/prompts.test.ts` to assert metadata, schema compatibility, and narrative assembly each time you amend prompt copy.

## Available MCP Tools

This server exposes service-scoped MCP tools that mirror Apple Reminders and Calendar domains. Use the identifier that matches the resource you want to manipulate:

- `reminders_tasks` — manage individual reminders
- `reminders_subtasks` — manage checklist items within a reminder
- `reminders_lists` — manage reminder lists
- `calendar_events` — manage calendar events (time blocks)
- `calendar_calendars` — inspect available calendars

All tools take an `action` field plus action-specific parameters. Date fields accept `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss` (local time), or ISO 8601 with timezone.

### Reminder Tasks Tool

**Tool Name**: `reminders_tasks`

Manages individual reminder tasks with full CRUD support, including priority, tags, and subtasks. Alarms, recurrence rules, and location-based triggers are read-only via this tool — configure them in Reminders.app.

**Actions**: `read`, `create`, `update`, `delete`

#### Parameters by Action

**Read Action** (`action: "read"`):

- `id` _(optional)_: Unique identifier of a specific reminder to read
- `filterList` _(optional)_: Name of the reminder list to show
- `showCompleted` _(optional)_: Include completed reminders (default: false)
- `search` _(optional)_: Search term to filter reminders by title or notes
- `dueWithin` _(optional)_: Filter by due date range (`today`, `tomorrow`, `this-week`, `overdue`, `no-date`)
- `filterPriority` _(optional)_: Filter by priority level (`high`, `medium`, `low`, `none`)
- `filterRecurring` _(optional)_: Only show recurring reminders when true
- `filterLocationBased` _(optional)_: Only show location-based reminders when true
- `filterTags` _(optional)_: Filter by tags (reminder must have ALL specified tags)

**Create Action** (`action: "create"`):

- `title` _(required)_: Title of the reminder
- `dueDate` _(optional)_: Due date
- `targetList` _(optional)_: Name of the reminders list to add to
- `note` _(optional)_: Note text to attach to the reminder
- `url` _(optional)_: URL to associate with the reminder (any valid URI scheme)
- `priority` _(optional)_: Priority level (0=none, 1=high, 5=medium, 9=low)
- `tags` _(optional)_: Array of tags to set on the reminder
- `subtasks` _(optional)_: Array of subtask titles to create with the reminder

> `startDate` is not available on create — set it via `update` after creation.

**Update Action** (`action: "update"`):

- `id` _(required)_: Unique identifier of the reminder to update
- `title` _(optional)_: New title for the reminder
- `startDate` _(optional)_: New start date
- `dueDate` _(optional)_: New due date
- `note` _(optional)_: New note text
- `url` _(optional)_: New URL to attach to the reminder
- `completed` _(optional)_: Mark the reminder completed (`true`) or uncompleted (`false`)
- `targetList` _(optional)_: Name of the list containing the reminder (cross-list moves are not supported — delete and recreate instead)
- `priority` _(optional)_: New priority level (0=none, 1=high, 5=medium, 9=low)
- `tags` _(optional)_: Replace all tags with this array
- `addTags` _(optional)_: Tags to add (merges with existing)
- `removeTags` _(optional)_: Tags to remove

**Delete Action** (`action: "delete"`):

- `id` _(required)_: Unique identifier of the reminder to delete

#### Example Usage

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
{
  "action": "read",
  "filterList": "Work",
  "showCompleted": false,
  "dueWithin": "today",
  "filterPriority": "high",
  "filterTags": ["urgent"]
}
```

```json
{
  "action": "update",
  "id": "reminder-123",
  "completed": false,
  "addTags": ["followup"]
}
```

```json
{
  "action": "delete",
  "id": "reminder-123"
}
```

### Reminder Subtasks Tool

**Tool Name**: `reminders_subtasks`

Manages subtasks/checklists within reminders. Subtasks are stored in the notes field using a human-readable format visible in the native Reminders app.

**Actions**: `read`, `create`, `update`, `delete`, `toggle`, `reorder`

#### Parameters by Action

**Read Action** (`action: "read"`):

- `reminderId` _(required)_: Parent reminder ID

**Create Action** (`action: "create"`):

- `reminderId` _(required)_: Parent reminder ID
- `title` _(required)_: Subtask title

**Update Action** (`action: "update"`):

- `reminderId` _(required)_: Parent reminder ID
- `subtaskId` _(required)_: Subtask ID to update
- `title` _(optional)_: New title
- `completed` _(optional)_: New completion status

**Delete Action** (`action: "delete"`):

- `reminderId` _(required)_: Parent reminder ID
- `subtaskId` _(required)_: Subtask ID to delete

**Toggle Action** (`action: "toggle"`):

- `reminderId` _(required)_: Parent reminder ID
- `subtaskId` _(required)_: Subtask ID to toggle

**Reorder Action** (`action: "reorder"`):

- `reminderId` _(required)_: Parent reminder ID
- `order` _(required)_: Array of all subtask IDs in desired order

#### Example Usage

```json
{
  "action": "read",
  "reminderId": "reminder-123"
}
```

```json
{
  "action": "create",
  "reminderId": "reminder-123",
  "title": "Pick up dry cleaning"
}
```

```json
{
  "action": "toggle",
  "reminderId": "reminder-123",
  "subtaskId": "a1b2c3d4"
}
```

#### Subtask Storage Format

Subtasks are stored in the notes field with this human-readable format:

```text
User notes here...

---SUBTASKS---
[ ] {a1b2c3d4} First task
[x] {e5f6g7h8} Completed task
[ ] {i9j0k1l2} Another task
---END SUBTASKS---
```

This format ensures subtasks are visible in the native Reminders app while enabling programmatic access.

### Reminder Lists Tool

**Tool Name**: `reminders_lists`

Manages reminder lists — view existing lists or create new ones for organizing reminders.

**Actions**: `read`, `create`, `update`, `delete`

#### Parameters by Action

**Read Action** (`action: "read"`):

- No additional parameters required

**Create Action** (`action: "create"`):

- `name` _(required)_: Name for the new reminder list

**Update Action** (`action: "update"`):

- `name` _(required)_: Current name of the list to update
- `newName` _(required)_: New name for the reminder list

**Delete Action** (`action: "delete"`):

- `name` _(required)_: Name of the list to delete

#### Example Usage

```json
{
  "action": "create",
  "name": "Project Alpha"
}
```

### Calendar Events Tool

**Tool Name**: `calendar_events`

Handles EventKit calendar events (time blocks) with CRUD capabilities. URL, structured location, all-day toggle, availability, alarms, and recurrence rules are read-only via this tool — configure them in Calendar.app. All-day events are inferred from the date format (`YYYY-MM-DD` without a time component).

**Actions**: `read`, `create`, `update`, `delete`

#### Parameters by Action

**Read Action** (`action: "read"`):

- `id` _(optional)_: Unique identifier of an event to read
- `filterCalendar` _(optional)_: Calendar name filter
- `search` _(optional)_: Keyword match against title, notes, or location
- `availability` _(optional)_: Filter by availability (`busy`, `free`, `tentative`, `unavailable`, `not-supported`)
- `startDate` _(optional)_: Filter events starting on/after this date (defaults to today if both dates omitted)
- `endDate` _(optional)_: Filter events ending on/before this date (defaults to today + 14 days if both dates omitted)

**Create Action** (`action: "create"`):

- `title` _(required)_: Event title
- `startDate` _(required)_: Start date/time
- `endDate` _(required)_: End date/time
- `targetCalendar` _(optional)_: Calendar name to create in
- `note` _(optional)_: Additional notes
- `location` _(optional)_: Location text

**Update Action** (`action: "update"`):

- `id` _(required)_: Event identifier
- `title` _(optional)_: New title
- `startDate` _(optional)_: New start date/time
- `endDate` _(optional)_: New end date/time
- `note` _(optional)_: New notes
- `location` _(optional)_: New location text

> Events cannot be moved across calendars via update — delete and recreate in the target calendar.

**Delete Action** (`action: "delete"`):

- `id` _(required)_: Event identifier to remove
- `span` _(optional)_: Scope for recurring event deletes (`this-event` or `future-events`)

### Calendar Collections Tool

**Tool Name**: `calendar_calendars`

Returns the available calendars, derived from the calendars that hold at least one event in the read window. Useful before creating or updating events to confirm valid calendar names. Optional date range filters scope that window and annotate each calendar with its in-range event count.

**Actions**: `read`

**Optional Parameters**:

- `startDate`: Range start for scoped calendar discovery
- `endDate`: Range end for scoped calendar discovery

#### Example Usage

```json
{
  "action": "read"
}
```

```json
{
  "action": "read",
  "startDate": "2026-05-04",
  "endDate": "2026-05-11"
}
```

#### Example Response

```json
{
  "content": [
    {
      "type": "text",
      "text": "### Calendars (Total: 3)\n- Work - 5 events\n- Personal - 2 events\n- Shared - 1 event"
    }
  ],
  "isError": false
}
```

Note: the vendored `event` CLI has no EventKit calendar identifiers, so the synthesized `id` mirrors the calendar `title` and is omitted from the markdown output when they're identical.

### Read-Only Field Shapes

Reminders and events returned by read actions carry alarms, recurrence rules, and location triggers that this server does not write. They round-trip from values configured in Reminders.app / Calendar.app.

Alarm object (read response):

```json
{
  "relativeOffset": -900,
  "absoluteDate": "2025-11-04T09:00:00+08:00",
  "locationTrigger": {
    "title": "Office",
    "latitude": 37.7749,
    "longitude": -122.4194,
    "radius": 100,
    "proximity": "enter"
  }
}
```

Recurrence rule object (read response):

```json
{
  "frequency": "daily" | "weekly" | "monthly" | "yearly",
  "interval": 1,
  "endDate": "YYYY-MM-DD",
  "occurrenceCount": 10,
  "daysOfWeek": [1, 3, 5],
  "daysOfMonth": [1, 15],
  "monthsOfYear": [3, 6]
}
```

### Response Formats

**Success Response**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Successfully created reminder: Buy groceries"
    }
  ],
  "isError": false
}
```

**Reminder with Enhanced Features**: When reading reminders, the output includes visual indicators:

- 🔄 - Recurring reminder
- 📍 - Location-based reminder
- 🏷️ - Has tags
- 📋 - Has subtasks

Example output:

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

**Note about URL fields**: The `url` field is fully supported by the EventKit API. When you create or update a reminder with a URL parameter, the URL is stored in the native `url` property (visible in Reminders app detail view via the "i" icon) and also appended to the notes in a structured format for parsing and multi-URL support:

```text
Reminder note content here...

URLs:
- https://example.com
- https://another-url.com
```

URLs accept any valid URI scheme (`http`, `https`, `mailto`, `tel`, `obsidian`, `shortcuts`, etc.). File, javascript, data, and similar dangerous schemes are rejected, and http(s) hostnames are checked against an SSRF blocklist.

**List Response**:

```json
{
  "reminders": [
    {
      "title": "Buy groceries",
      "list": "Shopping",
      "isCompleted": false,
      "dueDate": "2024-03-25 18:00:00",
      "priority": 1,
      "tags": ["shopping", "errands"],
      "subtasks": [
        { "id": "a1b2c3d4", "title": "Milk", "isCompleted": true },
        { "id": "e5f6g7h8", "title": "Eggs", "isCompleted": false }
      ],
      "subtaskProgress": { "completed": 1, "total": 2, "percentage": 50 },
      "notes": "Don't forget the organic options",
      "url": null
    }
  ],
  "total": 1,
  "filter": {
    "list": "Shopping",
    "showCompleted": false
  }
}
```

## Organization Strategies

The server provides intelligent reminder organization capabilities through four built-in strategies:

### Priority Strategy

Automatically categorizes reminders based on priority keywords:

- **High Priority**: Contains words like "urgent", "important", "critical", "asap"
- **Medium Priority**: Default category for standard reminders
- **Low Priority**: Contains words like "later", "someday", "eventually", "maybe"

### Due Date Strategy

Organizes reminders based on their due dates:

- **Overdue**: Past due dates
- **Today**: Due today
- **Tomorrow**: Due tomorrow
- **This Week**: Due within the current week
- **Next Week**: Due next week
- **Future**: Due beyond next week
- **No Date**: Reminders without due dates

### Category Strategy

Intelligently categorizes reminders by content analysis:

- **Work**: Business, meetings, projects, office, client related
- **Personal**: Home, family, friends, self-care related
- **Shopping**: Buy, store, purchase, groceries related
- **Health**: Doctor, exercise, medical, fitness, workout related
- **Finance**: Bills, payments, bank, budget related
- **Travel**: Trips, flights, hotels, vacation related
- **Education**: Study, learn, courses, books, research related
- **Uncategorized**: Doesn't match any specific category

### Completion Status Strategy

Simple binary organization:

- **Active**: Incomplete reminders
- **Completed**: Finished reminders

### Usage Examples

Organize all reminders by priority:

```text
Organize my reminders by priority
```

Categorize work-related reminders:

```text
Organize reminders from Work list by category
```

Sort overdue items:

```text
Organize overdue reminders by due date
```

## Tags System

Tags provide cross-list categorization for reminders. They are stored in the notes field using the `[#tag]` format, which keeps them human-readable in the native Reminders app. Both `[#tag]` and bare `#tag` formats are supported on read.

### Tag Format

Tags are stored at the end of notes:

```text
User notes here...

[#work] [#urgent] [#project-alpha]
```

### Tag Rules

- Tags can contain letters, numbers, underscores, and hyphens
- Maximum 50 characters per tag
- Case-sensitive
- Filter by multiple tags uses AND logic (reminder must have ALL specified tags)

### Example Tag Operations

Create with tags:

```json
{
  "action": "create",
  "title": "Review code",
  "tags": ["work", "code-review", "urgent"]
}
```

Filter by tags:

```json
{
  "action": "read",
  "filterTags": ["work", "urgent"]
}
```

Update tags (add/remove):

```json
{
  "action": "update",
  "id": "reminder-123",
  "addTags": ["completed"],
  "removeTags": ["urgent"]
}
```

## Development

1. Install dependencies with pnpm (the postinstall hook builds `bin/event` from the `vendor/event` submodule on macOS):

```bash
pnpm install
```

2. Build the project (TypeScript + the vendored `event` Swift CLI) before invoking the server:

```bash
pnpm build
```

3. Run the full test suite to validate TypeScript repositories, schemas, build script, and prompt templates:

```bash
pnpm test
```

4. Lint and format with Biome prior to committing:

```bash
pnpm exec biome check
```

### Launching from nested directories

The CLI entry point includes a project-root fallback, so you can start the server from nested paths (for example `dist/` or editor task runners) without losing access to the bundled `bin/event` binary. The bootstrapper walks up to ten directories to find `package.json`; if you customise the folder layout, keep the manifest reachable within that depth to retain the guarantee.

### Available Scripts

- `pnpm build` - Build TypeScript and the vendored `event` CLI (required before starting the server from source)
- `pnpm build:ts` - Build TypeScript only
- `pnpm build:event` - Build the vendored `event` CLI only (compiles `vendor/event` via `swift build -c release` and emits `bin/event`)
- `pnpm build:release` - Build plus notarization (for release packaging)
- `pnpm test` - Run the comprehensive Jest test suite
- `pnpm test:ci` - Run the Jest test suite with coverage
- `pnpm lint` - Biome format/fix plus TypeScript type check
- `pnpm check` - Lint plus test with coverage

### Dependencies

**Runtime Dependencies:**

- `@modelcontextprotocol/sdk ^1.29.0` - MCP protocol implementation
- `exit-on-epipe ^1.0.1` - Graceful process termination handling
- `zod ^4.4.3` - Runtime type validation

**Development Dependencies:**

- `typescript ^6.0.3` - TypeScript compiler
- `@types/node ^25.8.0` - Node.js type definitions
- `@types/jest ^30.0.0` - Jest type definitions
- `jest ^30.4.2` - Testing framework
- `@swc/core ^1.15.33` - SWC compiler
- `@swc/jest ^0.2.39` - SWC Jest transformer
- `@biomejs/biome 2.4.15` - Code formatting and linting

## License

MIT

## Contributing

Contributions welcome! Please read the contributing guidelines first.
