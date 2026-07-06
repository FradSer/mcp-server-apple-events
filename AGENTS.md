# Repository Guidelines

## Project Structure & Module Organization

Source lives in `src/`, segmented into clean architecture rings so dependencies flow inward. Transport adapters sit in `src/server/`, the vendored Swift CLI binary (`bin/event`) is built from the `vendor/event` git submodule, and automation workflows stay under `src/tools/`. Shared helpers live in `src/utils/` (including `eventCli.ts` — the wrapper around `bin/event`), while `src/validation/` enforces Zod contracts on every reminder payload. Tests co-locate as `*.test.ts` beside subjects to keep TDD feedback immediate, and generated binaries rebuild instead of touching `dist/`.

## Build, Test, and Development Commands

Run `pnpm install` to sync the locked dependency graph (and to build the vendored `event` CLI via the postinstall hook). Use `pnpm dev` for watch-mode TypeScript development without recompiling the Swift binary. Execute `pnpm test` to run the Jest suite through `ts-jest` and the `__mocks__/eventCli.ts` mock. Run `pnpm exec biome check` before commits to enforce formatting, linting, and import ordering, and rebuild the native helper with `pnpm build:event` whenever the `vendor/event` submodule pin moves.

## Coding Style & Naming Conventions

Biome enforces two-space indentation, single quotes, and sorted imports across `.ts` files. Choose camelCase for variables and functions, PascalCase for classes, and reuse screaming snake constants from `src/utils/constants.ts` when system identifiers need emphasis. Prefer composition, dependency injection, and repository abstractions to keep outer layers independent of inner logic, and comment only to justify architectural trade-offs or business rules.

## Testing Guidelines

Follow strict RED-GREEN-REFACTOR cycles by writing a failing Jest spec beside each new unit. Use the fixtures under `src/__mocks__/` to stabilize reminder schema behavior and initialize shared state through `src/test-setup.ts`. Narrow prompt template changes by targeting `pnpm test -- src/server/prompts.test.ts`. Name specs `<module>.test.ts` for discoverability and prioritize schema and error-path coverage before happy paths.

## Commit & Pull Request Guidelines

Craft conventional commits such as `feat: add transport validator`, keeping titles lowercase and under 50 characters. Ensure every commit leaves `pnpm test` and `pnpm exec biome check` green to maintain CI parity. PRs require actionable descriptions, verification command logs, and linked issues for traceability, and provide screenshots or logs when modifying transport flows or reminder outputs. Merge via merge commits only after CI and security checks pass.

## Security & Configuration Tips

Store secrets exclusively in `.env.local` and load them through typed contracts to avoid leaking reminder data. Grant macOS Reminders and Calendar permissions locally; the Swift bridge aborts before integration tests without them. Run `pnpm audit --prod` ahead of release branches to surface Swift toolchain CVEs, and stub external services via dependency injection instead of hardcoding tokens or calendar IDs.

## Permission Handling

macOS permissions for Reminders and Calendar are requested by the vendored [`event`](https://github.com/FradSer/event) CLI when needed. It checks permission status before each operation:

- If authorized: proceeds directly
- If notDetermined: requests permission automatically via `requestFullAccessToReminders` / `requestFullAccessToEvents`
- If denied / restricted / write-only: emits `Error: Permission denied: …` on stderr with a non-zero exit code

`src/utils/eventCli.ts` maps that stderr message into a domain-typed `CliPermissionError`. TypeScript handlers do not duplicate permission checks. `eventCli.ts` spawns `bin/event` through the `bin/event-disclaim` TCC shim (falling back to a direct, host-attributed spawn when the shim is absent), so permission prompts are attributed to `event` itself (it embeds an Info.plist with the EventKit usage strings) rather than to the host MCP client (issue #93).
