# Calendar Attendees and Occurrence Exception Implementation Plan

## Goal

Add `attendees` to `calendar_events` update and `occurrenceDate` to `calendar_events` delete, routing both around the `event` CLI because EventKit cannot express either.

## Constraints

- No new runtime dependencies
- No changes to the `event` CLI or the `vendor/event` submodule pin
- Existing `calendar_events` behavior unchanged when neither parameter is supplied
- Unknown iCalendar properties must round-trip byte-identical
- Keep code coverage above 93% statements, 78% branches
- Follow existing code patterns and conventions
- Test-First (Red-Green) workflow

## Architecture

```
                       ┌──────────────────────────┐
                       │  calendarRepository.ts   │
                       └──────────────────────────┘
                          │         │          │
        default writes    │         │          │  occurrenceDate
                          ▼         │          ▼
                   ┌────────────┐   │   ┌──────────────────┐
                   │ bin/event  │   │   │ caldavOccurrence │
                   │ (EventKit) │   │   │  PROPFIND/GET/PUT│
                   └────────────┘   │   └──────────────────┘
                                    │            │
                        attendees   ▼            ▼
                     ┌──────────────────┐  ┌──────────────┐
                     │ osascript        │  │ iCloud CalDAV│
                     │ Calendar.app     │─▶│  RFC 6638    │
                     └──────────────────┘  └──────────────┘
```

## Execution Plan

### Phase 1: iCalendar Line Primitives

- [Task 001: iCalendar Primitives Test](./task-001-icalendar-primitives-test.md)
- [Task 001: iCalendar Primitives Impl](./task-001-icalendar-primitives-impl.md)

### Phase 2: CalDAV Transport

- [Task 002: CalDAV Transport Test](./task-002-caldav-transport-test.md)
- [Task 002: CalDAV Transport Impl](./task-002-caldav-transport-impl.md)

### Phase 3: Credential Resolution

- [Task 003: CalDAV Credentials Test](./task-003-caldav-credentials-test.md)
- [Task 003: CalDAV Credentials Impl](./task-003-caldav-credentials-impl.md)

### Phase 4: AppleScript Attendee Write

- [Task 004: AppleScript Attendees Test](./task-004-applescript-attendees-test.md)
- [Task 004: AppleScript Attendees Impl](./task-004-applescript-attendees-impl.md)

### Phase 5: Occurrence Exception

- [Task 005: Occurrence Exception Test](./task-005-occurrence-exception-test.md)
- [Task 005: Occurrence Exception Impl](./task-005-occurrence-exception-impl.md)

### Phase 6: Tool Surface Wiring

- [Task 006: Tool Surface Wiring Test](./task-006-tool-surface-wiring-test.md)
- [Task 006: Tool Surface Wiring Impl](./task-006-tool-surface-wiring-impl.md)

### Phase 7: Documentation

- [Task 007: Documentation](./task-007-documentation.md)

### Phase 8: Final Verification

- [Task 008: Final Verification](./task-008-final-verification.md)

## Task Summary

| Task | Type | Files | Dependencies |
|------|------|-------|--------------|
| 001-Test | Test | `icalendar.test.ts`, `icalendar.corpus.test.ts` | None |
| 001-Impl | Code | `icalendar.ts` | 001-Test |
| 002-Test | Test | `caldavClient.test.ts`, `__mocks__/caldavClient.ts` | None |
| 002-Impl | Code | `caldavClient.ts` | 002-Test |
| 003-Test | Test | `caldavCredentials.test.ts` | None |
| 003-Impl | Code | `caldavCredentials.ts` | 003-Test |
| 004-Test | Test | `appleScriptAttendees.test.ts`, `.integration.test.ts`, `__mocks__/appleScriptAttendees.ts` | None |
| 004-Impl | Code | `appleScriptAttendees.ts` | 004-Test |
| 005-Test | Test | `icalendarExdate.test.ts`, `caldavOccurrence.test.ts` | 001-Impl, 002-Impl |
| 005-Impl | Code | `icalendar.ts`, `caldavOccurrence.ts` | 005-Test |
| 006-Test | Test | `calendarRepositoryAttendees.test.ts` | 004-Impl, 005-Impl |
| 006-Impl | Code | `schemas.ts`, `types/index.ts`, `types/repository.ts`, `definitions.ts`, `calendarHandlers.ts`, `calendarRepository.ts`, `constants.ts` | 006-Test, 003-Impl |
| 007 | Docs | `README.md`, `README.zh-CN.md`, `docs/migration-to-event-cli.md`, `CHANGELOG.md` | 006-Impl |
| 008 | Verify | All | All |

## Parallelization

The following tasks can be executed in parallel (no dependencies):

- **Batch 1**: 001-Test, 002-Test, 003-Test, 004-Test
- **Batch 2**: 001-Impl, 002-Impl, 003-Impl, 004-Impl (after their test tasks)
- **Batch 3**: 005-Test, then 005-Impl
- **Batch 4**: 006-Test, then 006-Impl
- **Batch 5**: 007, then 008

Phases 1-4 are genuinely independent modules. Phase 5 consumes the line primitives and the transport, phase 6 consumes everything, so neither parallelizes with what precedes it.

## Success Criteria

1. Both capabilities work against live iCloud, verified end to end
2. Existing `calendar_events` behavior unchanged when neither parameter is supplied
3. Test coverage maintained above thresholds (93% statements, 78% branches, 97% functions, 94% lines)
4. No new runtime dependencies
5. All existing tests pass
6. `pnpm check` passes (lint + typecheck)

## Design Reference

- [Design Documents](../2026-08-23-calendar-attendees-design/_index.md)
