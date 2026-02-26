# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript and Swift binary (required before running)
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
│   ├── cliExecutor.ts    # Executes Swift binary, parses JSON responses
│   ├── reminderRepository.ts  # Repository pattern for reminders
│   ├── calendarRepository.ts  # Repository pattern for calendar events
│   ├── binaryValidator.ts     # Secure binary path validation
│   ├── errorHandling.ts       # Centralized async error wrapper
│   ├── helpers.ts             # CLI argument builders (addOptionalArg, nullToUndefined)
│   └── subtaskUtils.ts        # Subtask parsing and notes field manipulation
├── validation/
│   └── schemas.ts        # Zod schemas for input validation
└── types/
    └── index.ts          # TypeScript interfaces and type constants
```

### Data Flow

1. MCP client sends tool call via stdio
2. `handlers.ts` routes to `handleToolCall()` in `tools/index.ts`
3. Tool router dispatches to specific handler (e.g., `handleCreateReminder`)
4. Handler validates input via Zod schema, calls repository
5. Repository calls `executeCli()` which runs Swift binary for EventKit operations
6. Swift binary performs EventKit operations, returns JSON
7. Response flows back through layers as `CallToolResult`

### Permission Handling

The Swift binary handles all permission requests through EventKit's native API. If the app lacks permissions, the Swift CLI will return an error message indicating the permission issue, which is then surfaced to the user.

### Swift Bridge

The `bin/EventKitCLI` binary handles all native macOS EventKit operations. TypeScript communicates via JSON:

```typescript
// CLI returns: { "status": "success", "result": {...} } or { "status": "error", "message": "..." }
const result = await executeCli<Reminder[]>([
  "--action",
  "read",
  "--showCompleted",
  "true",
]);
```

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
- Mock the CLI executor in `src/utils/__mocks__/cliExecutor.ts`
- Coverage thresholds: 96% statements, 90% branches, 98% functions, 96% lines
- Swift binary tests in `src/swift/Info.plist.test.ts` validate permission keys
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
