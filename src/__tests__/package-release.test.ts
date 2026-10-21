import { readFileSync } from 'node:fs';
import path from 'node:path';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const releaseWorkflowPath = path.resolve(
  process.cwd(),
  '.github/workflows/release.yml',
);

describe('release package contents', () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf8');

  it('ships the pre-built event binary and its source-build fallback', () => {
    expect(packageJson.files).toContain('bin/event');
    expect(packageJson.files).toContain('scripts/postinstall.mjs');
    expect(packageJson.files).toContain('scripts/build-event.mjs');
  });

  it('does not distribute the responsibility-disclaim helper or its source', () => {
    expect(packageJson.files).not.toContain('bin/event-disclaim');
    expect(packageJson.files).not.toContain('scripts/disclaim.c');
  });

  it('does not ship stale EventKitCLI paths', () => {
    for (const stale of [
      'bin/EventKitCLI',
      'scripts/build-swift.mjs',
      'src/swift/EventKitCLI.swift',
      'src/swift/Info.plist',
      'src/swift/EventKitCLI.entitlements',
    ]) {
      expect(packageJson.files).not.toContain(stale);
    }
  });

  it('does not ship the full src/ tree (no tests, no compiled output)', () => {
    // Wildcards in `files` would re-add `*.test.ts` and the vendored Swift
    // package to consumers' node_modules for no benefit.
    expect(packageJson.files).not.toContain('src/');
    expect(packageJson.files).not.toContain('src/**');
  });

  it('verifies the exact pre-built binary path before publishing', () => {
    expect(releaseWorkflow).toMatch(/npm pack --json --dry-run/);
    expect(releaseWorkflow).toMatch(/bin\/event/);
    expect(releaseWorkflow).not.toMatch(/bin\/EventKitCLI/);
  });

  it('builds the pinned event source and verifies calendar write support', () => {
    expect(releaseWorkflow).toMatch(/submodules:\s*recursive/);
    expect(releaseWorkflow).toMatch(/pnpm run build:event/);
    expect(releaseWorkflow).not.toMatch(/FradSer\/event\/releases\/download/);
    expect(releaseWorkflow).not.toMatch(
      /event-darwin-(?:amd64|arm64)\.tar\.gz/,
    );
    expect(releaseWorkflow).toMatch(/lipo -info bin\/event/);
    expect(releaseWorkflow).toMatch(/bin\/event reminders list --help/);
    expect(releaseWorkflow).toMatch(/grep -q -- '--start'/);
    expect(releaseWorkflow).toMatch(/grep -q -- '--end'/);
    expect(releaseWorkflow).toMatch(/bin\/event calendar get --help/);
    expect(releaseWorkflow).toMatch(/bin\/event calendar calendars --help/);
    expect(releaseWorkflow).toMatch(/bin\/event calendar create --help/);
    expect(releaseWorkflow).toMatch(/bin\/event calendar update --help/);
    expect(releaseWorkflow).toMatch(/grep -q -- '--url'/);
    expect(releaseWorkflow).toMatch(/grep -q -- '--clear-url'/);
    expect(releaseWorkflow).toMatch(/grep -q -- '--availability'/);
    expect(releaseWorkflow).not.toMatch(/disclaim/i);
    expect(releaseWorkflow).not.toMatch(/notarize/);
    expect(releaseWorkflow).toMatch(/xcrun swiftc --version/);
    expect(releaseWorkflow).not.toMatch(
      /APPLE_CERTIFICATE|APPLE_ID|APPLE_TEAM_ID/,
    );
    expect(releaseWorkflow).toMatch(
      /pnpm install --frozen-lockfile --ignore-scripts/,
    );
    expect(releaseWorkflow).toMatch(
      /pnpm exec jest --runInBand --testPathIgnorePatterns=src\/e2e\.test\.ts/,
    );
  });

  it('pins the CI runner image and verifies the ad-hoc signed universal binary', () => {
    expect(releaseWorkflow).toMatch(/runs-on: macos-26/);
    expect(releaseWorkflow).toMatch(/APPLE_SIGNING_IDENTITY:\s*'-'/);
    expect(releaseWorkflow).toMatch(/codesign --verify --strict/);
    expect(releaseWorkflow).not.toMatch(/Authority=Developer ID Application:/);
  });

  it('uses the package manager version declared by package.json', () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/);
    const pnpmSetup = releaseWorkflow.match(
      /- name: Setup pnpm[\s\S]*?(?=\n\s+- name:)/,
    )?.[0];
    expect(pnpmSetup).toMatch(/uses: pnpm\/action-setup@[a-f0-9]{40}\b/);
    expect(pnpmSetup).not.toMatch(/version:/);
  });

  it('pins every executable release action to a full commit SHA', () => {
    const actionReferences = [
      ...releaseWorkflow.matchAll(/^\s*(?:-\s*)?uses:\s*["']?([^\s"'#]+)/gm),
    ].map((match) => match[1]);
    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^[\w./-]+@[a-f0-9]{40}$/);
    }
  });

  it('uses npm trusted publishing requirements', () => {
    expect(packageJson.repository.url).toBe(
      'git+https://github.com/FradSer/mcp-server-apple-events.git',
    );
    expect(releaseWorkflow).toMatch(/id-token:\s*write/);
    expect(releaseWorkflow).toMatch(/node-version:\s*['"]24['"]/);
    expect(releaseWorkflow).toMatch(
      /npm publish --access public(?![^\n]*--provenance)/,
    );
    expect(releaseWorkflow).not.toMatch(
      /NPM_TOKEN|NODE_AUTH_TOKEN|provenance-token/,
    );
    expect(releaseWorkflow).toMatch(/npm --version/);
    expect(releaseWorkflow).toMatch(/11\.5\.1/);
  });

  it('skips post-migration calendar flag checks for the v1.5.0 recovery dispatch', () => {
    const writeFlagCheck = releaseWorkflow.match(
      /- name: Verify calendar write URL and availability options[\s\S]*?(?=\n\s+- name:)/,
    )?.[0];

    expect(writeFlagCheck).toMatch(
      /if: \$\{\{ github\.event_name == 'push' \|\| inputs\.tag != 'v1\.5\.0' \}\}/,
    );
    expect(writeFlagCheck).toMatch(/grep -q -- '--url'/);
    expect(writeFlagCheck).toMatch(/grep -q -- '--clear-url'/);
    expect(writeFlagCheck).toMatch(/grep -q -- '--availability'/);
  });

  it('limits manual recovery publishing to v1.5.0', () => {
    expect(releaseWorkflow).toMatch(/workflow_dispatch:/);
    expect(releaseWorkflow).toMatch(/description:.*v1\.5\.0/);
    expect(releaseWorkflow).toMatch(/type:\s*choice/);
    expect(releaseWorkflow).toMatch(/options:\s*\n\s+- v1\.5\.0/);
    expect(releaseWorkflow).toMatch(/ref:.*inputs\.tag \|\| github\.ref/);
  });
});
