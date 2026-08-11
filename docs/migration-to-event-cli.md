# Migrating to the `event` CLI backend (v1.5.0)

`mcp-server-apple-events` v1.5.0 swaps its embedded Swift binary for the
standalone [`event`](https://github.com/FradSer/event) CLI. The two projects
now share one EventKit codebase, but the swap forced us to drop MCP tool
fields that `event` does not yet expose on its write surface. Read paths are
preserved verbatim: alarms, recurrence rules, location triggers, structured
locations, URLs, availability, and similar fields configured in Reminders.app
or Calendar.app still round-trip through this server unchanged.

This page enumerates every removed field, the rationale, and the workaround.

## How `event` ships now

`event` is vendored as a git submodule at `vendor/event`, pinned to the
[`v0.5.0`](https://github.com/FradSer/event/releases/tag/v0.5.0) release tag.
The resulting binary lands at `bin/event` inside this package, exactly
mirroring the prior `bin/EventKitCLI` UX. You do **not** need to
`brew install event` separately.

**npx / Claude Desktop (recommended, zero build step)**

```bash
npx mcp-server-apple-events
```

The published npm package ships a pre-built, universal (arm64 + x86_64),
code-signed `bin/event` binary. `postinstall` detects it and skips the
source build entirely — no Xcode, no submodule, no Swift toolchain required.

**Building from a git clone**

```bash
git clone --recurse-submodules https://github.com/fradser/mcp-server-apple-events.git
cd mcp-server-apple-events
pnpm install   # postinstall builds bin/event from vendor/event on macOS
```

If the submodule was not initialized (e.g. plain `git clone` without
`--recurse-submodules`):

```bash
git submodule update --init --recursive
pnpm build
```

Building from source (`scripts/build-event.mjs`) compiles `vendor/event`
once per architecture (`arm64-apple-macosx14.0` and `x86_64-apple-macosx14.0`,
matching `event`'s own `platforms: [.macOS(.v14)]`) and merges the two with
`lipo` into a single universal `bin/event`, then code-signs it — preferring a
`Developer ID Application` certificate from the login keychain (falls back to
ad-hoc signing with a warning) — with hardened runtime, exactly like the
retired `EventKitCLI` build did. `event`'s `Package.swift` declares one
dependency over SSH (`apple-sync-kit`); the build script rewrites that to
HTTPS for the `swift build` child process only (via scoped `GIT_CONFIG_*` env
vars), so a registered SSH key is never required.

## Dropped fields

The table groups dropped fields by MCP tool and explains the workaround for
each. All read-side data continues to round-trip through the JSON response,
so values set inside Reminders.app or Calendar.app remain visible.

### `reminders_tasks`

| Field | Action | Workaround |
| --- | --- | --- |
| `alarms`, `clearAlarms` | create / update | Configure alarms in Reminders.app. |
| `recurrence`, `recurrenceRules`, `clearRecurrence` | create / update | Configure recurrence in Reminders.app. |
| `locationTrigger`, `clearLocationTrigger` | create / update | Configure location-based reminders in Reminders.app. |
| `location` (reminder text) | create / update | Set the reminder's location text from Reminders.app. |
| `completionDate` | update | Use `completed: true` to mark complete (timestamp is set by EventKit automatically). |
| `startDate` | create | Set it via `update` after creation; `update` still accepts `startDate`. |
| `completed` | create | Create the reminder first, then call `update` with `completed: true`. |
| `isCompleted: false` | update | Supported — `--completed false` un-completes (requires `event` CLI >= 0.5.0, commit 564bd4b). |
| Moving a reminder between lists | update | `event` cannot move reminders between lists. Delete and recreate in the target list, or move from Reminders.app. |

### `reminders_lists`

| Field | Action | Workaround |
| --- | --- | --- |
| `color` | create / update | Set the list color from Reminders.app. |

### `calendar_events`

| Field | Action | Workaround |
| --- | --- | --- |
| `alarms`, `clearAlarms` | create / update | Configure alarms in Calendar.app. |
| `recurrenceRules`, `clearRecurrence` | create / update | Configure recurrence in Calendar.app. |
| `structuredLocation` | create / update | Use the plain `location` text field instead. |
| `url` | create / update | Add the URL to `note` or set it in Calendar.app. |
| `isAllDay` | create / update | Pass dates as bare `YYYY-MM-DD` (no time) to create an all-day event; `event` infers it from the format. |
| `availability` (write) | create / update | Read-side filtering on `availability` still works. To change availability, edit the event in Calendar.app. |
| `targetCalendar` | update | `event` cannot move an event between calendars. Delete and recreate in the target calendar. |
| `filterAccount` | read | `event` does not surface EventKit account info. Filter by `filterCalendar` instead. |
| `span` (on update) | update | Update always saves with `EKSpan.thisEvent`. `delete` still respects `span: 'this-event' | 'future-events'`. |

### `calendar_calendars`

`event` has no first-class "list calendars" command. The server now derives
the calendar listing from distinct `calendar` field values inside a wide
±4-year `calendar list` read window (or a caller-supplied `startDate`/
`endDate` window, annotated with an in-range event count). This has a few
implications:

- Calendars that are completely empty within the read window won't appear.
- The synthetic listing surfaces `id` and `title` only; EventKit `account`
  and `accountType` are no longer reported, so `filterAccount` is dropped.
  Event counts (when a date range is supplied) are grouped by calendar
  title rather than a stable EventKit identifier.

A dedicated `event calendar list-calendars` command would let us drop this
shim; track upstream at <https://github.com/FradSer/event/issues>.

### Single-item lookup by ID

`event` has no dedicated "get by id" command for reminders or calendar
events — the prior embedded binary's `read-by-id` action has no equivalent.
`findReminderById` (`src/utils/reminderRepository.ts`) fetches the full
reminder set (including completed) and does an in-memory `.find`;
`findEventById` (`src/utils/calendarRepository.ts`) does the same over a wide
±4-year `calendar list` window. This means every single-reminder or
single-event read transfers the whole result set over the CLI pipe. For
accounts with very large reminder lists or event histories this is slower
than a direct by-id fetch would be, but there is no narrower `event` query to
fall back to. A dedicated by-id command in `event` would let both methods
drop the full scan; track upstream at
<https://github.com/FradSer/event/issues>.

## Notes-field conventions are unchanged

Tags (`[#tag]`) and subtasks (`---SUBTASKS---…---END SUBTASKS---`) continue to
live in the reminder notes field and are parsed/written by TypeScript code
(`src/utils/tagUtils.ts`, `src/utils/subtaskUtils.ts`). The server deliberately
does **not** call `event reminders create --tags <…>` or `--parentTitle <…>`,
so the optional AdvancedReminderEdit Shortcut is not required and existing
user reminders with the current notes format keep round-tripping unchanged.

## Restoring a dropped feature

If a missing field is blocking you, the most direct path is to file an issue
against `event` (<https://github.com/FradSer/event/issues>) — once a flag
lands there, restoring it in this server is an additive change: drop the
deletion from `src/validation/schemas.ts` and pass the new flag through
`src/utils/reminderRepository.ts` or `src/utils/calendarRepository.ts`.
