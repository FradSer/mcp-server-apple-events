# Code Review Fixes Implementation Plan

## Goal

Implement fixes for Critical + High priority issues identified in the hierarchical code review.

## Constraints

- No external dependencies for core fixes
- Maintain backward compatibility for existing API consumers
- Keep code coverage above 96% statements, 90% branches
- Follow existing code patterns and conventions
- Test-First (Red-Green) workflow

## Architecture

```
Filter Responsibility:
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ TypeScript      │───▶│ Swift CLI       │───▶│ JS Filtering    │
│ (build args)    │    │ (filter data)   │    │ (tags/priority  │
│                 │    │                 │    │  only)          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Execution Plan

### Phase 1: Swift-Only Filtering

- [Task 001: Swift-Only Filtering Test](./task-001-swift-filtering-test.md)
- [Task 001: Swift-Only Filtering Impl](./task-001-swift-filtering-impl.md)

### Phase 2: Locale-Aware Week Start

- [Task 002: Locale-Aware Week Start Test](./task-002-locale-week-start-test.md)
- [Task 002: Locale-Aware Week Start Impl](./task-002-locale-week-start-impl.md)

### Phase 3: SSRF URL Protection

- [Task 003: SSRF URL Validation Test](./task-003-ssrf-url-validation-test.md)
- [Task 003: SSRF URL Validation Impl](./task-003-ssrf-url-validation-impl.md)

### Phase 4: Subtask Tool Routing Tests

- [Task 004: Subtask Tool Routing Test](./task-004-subtask-routing-test.md)

### Phase 5: Production Error Handling

- [Task 005: Production Error Handling Test](./task-005-error-handling-test.md)
- [Task 005: Production Error Handling Impl](./task-005-error-handling-impl.md)

### Phase 6: Documentation

- [Task 006: CLI Executor Documentation](./task-006-cli-executor-documentation.md)

### Phase 7: Final Verification

- [Task 007: Final Verification](./task-007-final-verification.md)

## Task Summary

| Task | Type | Files | Dependencies |
|------|------|-------|--------------|
| 001-Test | Test | `reminderRepository.test.ts` | None |
| 001-Impl | Code | `reminderRepository.ts` | 001-Test |
| 002-Test | Test | `dateUtils.test.ts` | None |
| 002-Impl | Code | `dateUtils.ts` | 002-Test |
| 003-Test | Test | `schemas.test.ts` | None |
| 003-Impl | Code | `schemas.ts` | 003-Test |
| 004-Test | Test | `reminders_subtasks.test.ts` | None |
| 005-Test | Test | `errorHandling.test.ts` | None |
| 005-Impl | Code | `errorHandling.ts` | 005-Test |
| 006 | Docs | `cliExecutor.ts` | None |
| 007 | Verify | All | All |

## Parallelization

The following tasks can be executed in parallel (no dependencies):

- **Batch 1**: 001-Test, 002-Test, 003-Test, 004-Test, 005-Test, 006
- **Batch 2**: 001-Impl, 002-Impl, 003-Impl, 005-Impl (after their test tasks)
- **Batch 3**: 007 (after all implementation tasks)

## Success Criteria

1. All Critical + High issues resolved
2. Test coverage maintained above thresholds (96% statements, 90% branches)
3. No breaking API changes for external consumers
4. All existing tests pass
5. `pnpm check` passes (lint + typecheck)

## Design Reference

- [Design Documents](../2026-02-27-code-review-fixes-design/_index.md)
