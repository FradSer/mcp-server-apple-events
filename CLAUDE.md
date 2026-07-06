# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (initializes vendor/event submodule + builds bin/event)
pnpm install

# Build TypeScript and the vendored `event` CLI (required before running)
pnpm build

# Run all tests
pnpm test

# Run a single test file
pnpm test -- src/path/to/file.test.ts

# Run tests matching a pattern
pnpm test -- --testNamePattern="pattern"

# Lint and format with Biome
pnpm lint

# Combined lint + typecheck
pnpm check
```

## Architecture

This is an MCP (Model Context Protocol) server providing native macOS integration with Apple Reminders and Calendar via EventKit.

### Layer Structure

```text
src/
├── index.ts              # Entry point: loads config, starts server
├── server/
│   ├── server.ts         # MCP server setup with stdio transport
│   ├── handlers.ts       # Request handler registration (tools, prompts)
│   ├── prompts.ts        # Prompt template definitions and builders
│   └── promptAbstractions.ts
├── tools/
│   ├── definitions.ts    # MCP tool schemas
│   ├── index.ts          # Tool routing: dispatches to handlers
│   └── handlers/         # Domain-specific CRUD handlers
│       ├── reminderHandlers.ts
│       ├── subtaskHandlers.ts
│       ├── listHandlers.ts
│       ├── calendarHandlers.ts
│       └── shared.ts     # Common formatting utilities (extractAndValidateArgs, formatListMarkdown)
├── utils/
│   ├── eventCli.ts       # Executes the vendored `event` Swift CLI, parses raw JSON
│   ├── reminderRepository.ts  # Repository pattern for reminders
│   ├── calendarRepository.ts  # Repository pattern for calendar events
│   ├── binaryValidator.ts     # Secure binary path validation
│   ├── errorHandling.ts       # Centralized async error wrapper (CliUserError / CliPermissionError)
│   ├── helpers.ts             # CLI argument builders (addOptionalArg, nullToUndefined)
│   ├── tagUtils.ts            # TS-side tag parsing/writing in the reminder notes field
│   └── subtaskUtils.ts        # TS-side subtask parsing/writing in the reminder notes field
├── validation/
│   └── schemas.ts        # Zod schemas for input validation
└── types/
    └── index.ts          # TypeScript interfaces and type constants
```

The vendored `event` Swift CLI lives at `vendor/event/` (git submodule pinned to
a specific FradSer/event SHA). `scripts/build-event.mjs` compiles it via
`swift build -c release` with `scripts/event-Info.plist` linked into the
`__TEXT,__info_plist` section, copies the result to `bin/event`, compiles the
TCC disclaim shim `scripts/disclaim.c` to `bin/event-disclaim`, and signs both
with hardened runtime — `event` additionally with the
`com.apple.security.personal-information.{calendars,reminders}` entitlements
(`scripts/event.entitlements`) so it can request EventKit access as its own
TCC-responsible process.

### Data Flow

1. MCP client sends tool call via stdio
2. `handlers.ts` routes to `handleToolCall()` in `tools/index.ts`
3. Tool router dispatches to specific handler (e.g., `handleCreateReminder`)
4. Handler validates input via Zod schema, calls repository
5. Repository calls `executeEventCliJson()` / `executeEventCliPlain()`, which spawn `bin/event` for EventKit operations
6. The `event` CLI performs the EventKit operations and prints either raw JSON to stdout or a plain status line ("Reminder deleted successfully"). Errors land on stderr as `Error: <message>` with a non-zero exit code.
7. Response flows back through layers as `CallToolResult`

### Permission Handling

The `event` CLI requests EventKit permissions via the native async APIs (`requestFullAccessToReminders` / `requestFullAccessToEvents`). When access is denied, restricted, or write-only, it emits an `Error: Permission denied: …` line on stderr; `eventCli.ts` maps that into a domain-typed `CliPermissionError` (`'reminders'` or `'calendars'`) which the host surfaces verbatim.

`eventCli.ts` spawns `bin/event` through the `bin/event-disclaim` shim (falling back to a direct spawn when the shim is absent). The shim disclaims TCC responsibility at spawn time (the same private `responsibility_spawnattrs_setdisclaim` API Chromium and LLDB use), so `event` — which embeds its usage strings in an Info.plist section and carries the personal-information entitlements — is its own TCC-responsible process. Permission prompts are therefore attributed to `event` itself and work from any MCP client, including desktop apps that declare no EventKit usage strings (issue #93).

### Swift Bridge

The vendored `event` CLI (FradSer/event, pinned via the `vendor/event` submodule) is the only Swift code in this repository. TypeScript spawns it with raw flag args; no JSON envelope is used:

```typescript
// `event` prints raw JSON to stdout; errors land on stderr with non-zero exit.
const reminders = await executeEventCliJson<ReminderJSON[]>([
  'reminders',
  'list',
  '--completed',
  '--json',
]);
```

Non-JSON commands (e.g. `event reminders delete`) call `executeEventCliPlain` instead, which returns the trimmed stdout text.

## Key Patterns

### Zod Schema Validation

All handler inputs are validated through Zod schemas in `validation/schemas.ts`.

### Repository Pattern

Data access is abstracted through repositories (`reminderRepository.ts`, `calendarRepository.ts`) that handle CLI execution and response mapping.

### Error Handling

Use `handleAsyncOperation()` wrapper from `errorHandling.ts` for consistent error formatting:

```typescript
return handleAsyncOperation(async () => {
  // operation logic
}, "operation description");
```

## Testing

- Tests use Jest with ts-jest ESM preset
- Mock the CLI executor in `src/utils/__mocks__/eventCli.ts` (`jest.mock('./eventCli.js')`)
- Coverage thresholds live in `jest.config.mjs` (currently 93/78/96/94 statements/branches/functions/lines)
- `src/__tests__/build-event.test.ts` pins the contract of `scripts/build-event.mjs` (calls `swift build -c release` with the `__info_plist` sectcreate flags, copies to `bin/event`, compiles `bin/event-disclaim`, signs with `--options runtime`; `event` gets `--entitlements scripts/event.entitlements`, the shim gets none)
- `src/utils/projectUtils.ts` is excluded from coverage (import.meta.url incompatible with Jest)

### Notes Field Conventions

Subtasks and tags are stored in the reminder notes field using structured formats:

```text
User notes here...

[#tag1] [#tag2]

---SUBTASKS---
[ ] {a1b2c3d4} First subtask
[x] {e5f6g7h8} Completed subtask
---END SUBTASKS---
```

When modifying notes programmatically, preserve existing tags and subtasks unless explicitly updating them.

## Critical Constraints

- **macOS only**: Requires EventKit framework
- **Permission handling**: Swift layer manages `EKEventStore.authorizationStatus()`
- **Binary security**: Path validation in `binaryValidator.ts` restricts allowed binary locations
- **Date formats**: Prefer `YYYY-MM-DD HH:mm:ss` for local time, ISO 8601 with timezone for UTC

## Prompt System

### Confidence-Gating System

All prompts use a three-tier confidence system for action execution:

- **HIGH CONFIDENCE (>80%)**: Execute immediately with actual MCP tool calls
- **MEDIUM CONFIDENCE (60-80%)**: Provide recommendations in tool-ready format with rationale
- **LOW CONFIDENCE (<60%)**: Use AskUserQuestion tool to present options to the user

### Example: reminder-review-assistant Prompt Output

**HIGH Confidence Action (should execute immediately)**:

```
### Action queue

**HIGH CONFIDENCE (>80%) — Executed immediately**

✓ Marked "Complete project documentation" as complete
  - Tool: reminders_tasks, action: update, id: D15A5A2B-EEDB-42DB-A368-9748F1400326, completed: true
  - Rationale: Note contains complete research content, task appears finished
```

**LOW Confidence Action (should use AskUserQuestion)**:

Instead of text like:
```
**LOW CONFIDENCE (<60%) — Need confirmation**
- [LOW, 45%] Delete unclear tasks in Ideas list
```

Should trigger:
```
[AskUserQuestion tool call with:
  question: "Found 3 tasks with unclear titles in Ideas list. What should we do with them?"
  options: [
    { label: "Delete all", description: "Remove tasks: 'Task A', 'Task B', etc." },
    { label: "Keep for now", description: "Leave them in the list, review later" },
    { label: "Show me details", description: "I'll review each one individually" }
  ]
]
```

### Key Prompt Constraints

- HIGH confidence actions MUST result in actual tool calls, not just descriptions
- LOW confidence decisions MUST use AskUserQuestion tool, not text questions
- No text-based questions should appear in final output - all user decisions use AskUserQuestion
- Updates and deletions are allowed for existing reminders when confidence is high (>80%)
- New reminders should only be created when explicitly requested by the user

