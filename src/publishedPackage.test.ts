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
    // The postinstall script invokes another node script which reads three
    // Swift source files. If any of those drop out of `files`, the package
    // fails to build on every consumer install (#95-class regression).
    const required = [
      'scripts/postinstall.mjs',
      'scripts/build-swift.mjs',
      'src/swift/EventKitCLI.swift',
      'src/swift/Info.plist',
      'src/swift/EventKitCLI.entitlements',
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
    it('keeps the unpacked tarball under 2MB', () => {
      // The pre-allowlist tarball was 4.1MB unpacked. 2MB is a comfortable
      // ceiling that still leaves room for the dist/ output to grow, while
      // catching accidental re-inclusion of the vendor/ tree (~1.7MB).
      const unpacked = pack.files.reduce((sum, f) => sum + f.size, 0);
      expect(unpacked).toBeLessThan(2 * 1024 * 1024);
    });
  });
});
