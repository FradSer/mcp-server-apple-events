---
name: npm-trusted-publishing
description: Release packages through GitHub OIDC Trusted Publishing with exact repository metadata, tag-triggered workflows, and upstream event binaries
type: project
---

This project publishes npm releases through GitHub Actions and npm Trusted Publishing (OIDC). The canonical release path is a version tag push, not manual npm publication or workflow dispatch.

**Why:** npm Trusted Publishing binds permission to the exact repository and workflow identity. Tag-triggered releases keep the source revision and published artifact explicit and reproducible.

**How to apply:**
- Keep `package.json.repository.url` exactly `git+https://github.com/FradSer/mcp-server-apple-events.git` with the canonical `FradSer` casing.
- The npm Trusted Publisher is configured with repository `FradSer/mcp-server-apple-events`, workflow filename `release.yml`, and `npm publish` permission. npm CLI equivalent: `npm trust github mcp-server-apple-events --file release.yml --repo FradSer/mcp-server-apple-events --allow-publish`.
- The release workflow uses GitHub OIDC (`id-token: write`), Node 24, npm 11.5.1+, and no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or long-lived publish secret.
- Release by pushing a matching tag, for example `git tag v1.6.0 && git push origin v1.6.0`. The `v1.5.0` tag was recovered by force-updating it to the corrected `main` commit before the successful tag-triggered release; do not repeat that for normal versions.
- The package consumes `FradSer/event` rather than compiling it locally in release CI. The workflow downloads and SHA-256 verifies the upstream `event` v0.6.0 Darwin amd64/arm64 archives, merges them with `lipo` into `bin/event`, compiles only the local `event-disclaim` TCC shim, and does not require Apple certificate, signing, or notarization secrets.
- CI installs dependencies with `pnpm install --frozen-lockfile --ignore-scripts`, builds TypeScript, validates the package tarball, and runs Jest directly while excluding `src/e2e.test.ts` because GitHub-hosted runners lack the user's GUI/EventKit permissions: `pnpm exec jest --runInBand --testPathIgnorePatterns=src/e2e.test.ts`.
- npm Trusted Publisher configuration requires the package to already exist. If configuring a new package, bootstrap publication may be required before `npm trust github` can create the relationship. For this package, Trusted Publishing is now configured and `mcp-server-apple-events@1.5.0` is published with `latest` set to `1.5.0`.
- The release workflow's manual dispatch is intentionally restricted to the existing `v1.5.0` recovery tag; normal releases should use tag push.

**Verification evidence:**
- Successful tag-triggered workflow: `https://github.com/FradSer/mcp-server-apple-events/actions/runs/32266032228`
- Published package: `https://www.npmjs.com/package/mcp-server-apple-events`, version `1.5.0`, `latest` `1.5.0`

**Related:**
- [[project_npm-trusted-publishing]]
