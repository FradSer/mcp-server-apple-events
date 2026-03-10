# Code Review Fixes Design

## Context

This design addresses Critical and High priority issues identified in the hierarchical code review of the mcp-server-apple-events project. The MCP server provides native macOS integration with Apple Reminders and Calendar via EventKit.

## Requirements

### Critical Issues (1)

1. **Double Date Filtering** - Remove redundant JS-side filtering, trust Swift CLI for all date/list/search/completion filtering

### High Issues (6)

2. **showCompleted Default Mismatch** - Change code default from `true` to `false` to match schema/README
3. **Week Start Locale** - Change from hardcoded Sunday to locale-aware using Intl API
4. **SSRF URL Validation** - Enhance regex to block IPv6 loopback, link-local, cloud metadata endpoints
5. **Missing Subtask Tests** - Add test coverage for `reminders_subtasks` routing
6. **Error Message Disclosure** - Add explicit development mode check with production-safe defaults
7. **Argument Injection Documentation** - Document current safety approach in JSDoc

## Rationale

### User Decisions

| Issue | Decision | Rationale |
|-------|----------|-----------|
| Double Filtering | Swift-Only Filtering | Single source of truth, simpler code, matches Swift's comprehensive filtering |
| showCompleted Default | `false` | Matches documented API schema and README |
| Week Start | Locale-Aware | Matches Swift CLI behavior using `Calendar.current.dateInterval(of: .weekOfYear)` |
| SSRF Protection | Enhanced Regex | No additional dependencies, covers all bypass vectors |

### Constraints

- No external dependencies for core fixes
- Maintain backward compatibility for existing API consumers
- Keep code coverage above 96% statements, 90% branches
- Follow existing code patterns and conventions

## Detailed Design

### 1. Swift-Only Filtering Architecture

```
Before:
TypeScript -> Swift CLI (with filters) -> JS Filtering (redundant) -> Return

After:
TypeScript -> Swift CLI (with filters) -> JS Filtering (priority, tags, etc.) -> Return
```

**Files Modified:**
- `src/utils/reminderRepository.ts` - Remove redundant filter pass-through to JS layer

### 2. Default Value Alignment

```typescript
// Before
filters.showCompleted ?? true

// After
filters.showCompleted ?? false
```

### 3. Locale-Aware Week Start

```typescript
// Before: Hardcoded Sunday
const dayOfWeek = today.getDay(); // 0=Sunday

// After: Intl.Locale weekInfo
const locale = new Intl.Locale(undefined);
const firstDay = locale.weekInfo?.firstDay ?? 7; // 1=Monday, 7=Sunday
```

### 4. Enhanced SSRF Protection

```typescript
// Blocks: IPv6 loopback, link-local, cloud metadata
const URL_PATTERN = new RegExp(
  '^https?://' +
  '(?!' +
    '(?:127\\.|192\\.168\\.|10\\.|172\\.(?:1[6-9]|2[0-9]|3[01])\\.|169\\.254\\.|0\\.0\\.0\\.0)' +
    '|(?:\\[?::1\\]?|\\[?::\\]?|\\[?fe[89ab][0-9a-f]:)' +
    '|(?:169\\.254\\.169\\.254|100\\.100\\.100\\.200|metadata\\.google\\.internal)' +
  ')' +
  '[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*' +
  '(?:\\/[^\\s<>"{}|\\\\^`\\[\\]]*)?' +
  '$',
  'i'
);
```

### 5. Subtask Test Coverage

Add comprehensive tests for all 6 subtask actions in `reminders_subtasks.test.ts`.

### 6. Production-Safe Error Handling

```typescript
function isDevelopmentMode(): boolean {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  const debugMode = process.env.DEBUG?.toLowerCase();

  return nodeEnv === 'development' ||
         nodeEnv === 'dev' ||
         debugMode === 'true' ||
         debugMode === '1';
}
```

## Design Documents

- [BDD Specifications](./bdd-specs.md) - Behavior scenarios and testing strategy
- [Architecture](./architecture.md) - System architecture and component details
- [Best Practices](./best-practices.md) - Security, performance, and code quality guidelines

## Success Criteria

1. All Critical + High issues resolved
2. Test coverage maintained above thresholds (96% statements, 90% branches)
3. No breaking API changes for external consumers
4. All existing tests pass
5. `pnpm check` passes (lint + typecheck)
