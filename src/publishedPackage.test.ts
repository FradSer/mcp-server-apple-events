/**
 * Contract test for the published npm tarball.
 *
 * Two regressions made it past review in quick succession — the v1.4.0 pack
 * shipped maintainer-only files like `CLAUDE.md` (#95), and the follow-up fix
 * (#96) accidentally dropped the bin entry's runtime path (Codex P0 on #97).
 * Both bugs were 100% visible in `npm pack --dry-run` and would have been
 * caught here.
 *
 * This test invokes `npm pack --dry-run --json` and asserts the shipped file
 * set against the package's own `bin`/`main`/`postinstall` declarations, plus
 * a denylist of files that must never be published.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..');

type PackEntry = { path: string; size: number; mode: number };
type PackResult = {
  files: PackEntry[];
  entryCount: number;
};

function npmPackDryRun(): PackResult {
  // `--ignore-scripts` prevents the postinstall from running during pack,
  // keeping the test deterministic regardless of host Swift toolchain state.
  const stdout = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const parsed = JSON.parse(stdout) as PackResult[];
  if (!parsed[0]) {
    throw new Error('npm pack --json returned an empty array');
  }
  return parsed[0];
}

function loadPackageJson(): {
  bin: Record<string, string> | string;
  main: string;
  files: string[];
  scripts: Record<string, string>;
} {
  return JSON.parse(
    readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
}

describe('published npm tarball', () => {
  let pack: PackResult;
  let shipped: Set<string>;
  let pkg: ReturnType<typeof loadPackageJson>;

  beforeAll(() => {
    pack = npmPackDryRun();
    shipped = new Set(pack.files.map((f) => f.path));
    pkg = loadPackageJson();
  }, 60_000); // npm pack can be slow on cold caches

  describe('bin entry consistency', () => {
    it('every bin target is included in the tarball', () => {
      const bins =
        typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin ?? {});
      expect(bins.length).toBeGreaterThan(0);
      for (const target of bins) {
        const normalized = target.replace(/^\.\//, '');
        expect(shipped.has(normalized)).toBe(true);
      }
    });

    it('does not ship the legacy bin/run.cjs wrapper', () => {
      // The wrapper used to do `require('../src/index.ts')` via tsx; it was
      // removed once `dist/index.js` became the direct bin target. If this
      // re-appears, someone has likely reintroduced the broken require path.
      expect(shipped.has('bin/run.cjs')).toBe(false);
    });
  });

  describe('main entry consistency', () => {
    it('the main field points at a file inside the tarball', () => {
      const normalized = pkg.main.replace(/^\.\//, '');
      expect(shipped.has(normalized)).toBe(true);
    });
  });

  describe('postinstall chain', () => {
    // The npm-installed path ships a pre-built, universal, code-signed
    // `bin/event` binary. `postinstall.mjs` detects it and skips the source
    // build entirely — the vendor/event submodule source is never part of
    // the tarball (git submodules aren't included in `npm pack`), so
    // `build-event.mjs` only matters for git-clone-from-source installs. If
    // any of these drop out of `files`, the package fails to build (or run)
    // on every consumer install (#95-class regression).
    const required = [
      'scripts/postinstall.mjs',
      'scripts/build-event.mjs',
      'scripts/event-Info.plist',
      'scripts/event.entitlements',
      'scripts/disclaim.c',
      'bin/event',
      'bin/event-disclaim',
    ];

    it.each(required)('ships %s', (file) => {
      expect(shipped.has(file)).toBe(true);
    });
  });

  describe('denylist', () => {
    // Files that previously leaked into the tarball or that have no business
    // being there. Keep this list in sync with anything maintainer-only that
    // ends up at the repo root or in vendor/.
    const forbidden = [
      'CLAUDE.md',
      'AGENTS.md',
      'GEMINI.md',
      '.claude/git.local.md',
      '.git-agent/config.yml',
      'biome.json',
      'check-permissions.sh',
      'jest.config.mjs',
      'jest-env.cjs',
      'tsconfig.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
    ];

    it.each(forbidden)('does not ship %s', (file) => {
      expect(shipped.has(file)).toBe(false);
    });

    it('does not ship any path under vendor/', () => {
      const leaks = [...shipped].filter((p) => p.startsWith('vendor/'));
      expect(leaks).toEqual([]);
    });

    it('does not ship any TypeScript source under src/ outside src/swift/', () => {
      // `dist/**/*.ts` (declaration files) is fine; raw `.ts` sources under
      // `src/` are not — they exist only for development.
      const leaks = [...shipped].filter(
        (p) => p.startsWith('src/') && p.endsWith('.ts'),
      );
      expect(leaks).toEqual([]);
    });
  });

  describe('size sanity', () => {
    it('keeps the unpacked tarball under 80MB', () => {
      // The universal `bin/event` binary is ~50MB on its own (arm64 + x86_64
      // slices statically linking SQLite.swift, swift-nio, and apple-sync-kit
      // — substantially larger than the old single-file `EventKitCLI`); the
      // rest of the tarball (compiled dist/, scripts, READMEs) sits in the
      // 600-800KB band. 80MB leaves headroom for the binary to grow while
      // still flagging a real regression, like accidentally shipping the
      // vendor/ source tree or dist/ test files.
      const unpacked = pack.files.reduce((sum, f) => sum + f.size, 0);
      expect(unpacked).toBeLessThan(80 * 1024 * 1024);
    });
  });
});
