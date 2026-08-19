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

  it('downloads and packages the upstream event release assets', () => {
    expect(releaseWorkflow).toMatch(
      /FradSer\/event\/releases\/download\/v0\.6\.0\/event-darwin-amd64\.tar\.gz/,
    );
    expect(releaseWorkflow).toMatch(
      /FradSer\/event\/releases\/download\/v0\.6\.0\/event-darwin-arm64\.tar\.gz/,
    );
    expect(releaseWorkflow).toMatch(/lipo -create/);
    expect(releaseWorkflow).toMatch(/scripts\/disclaim\.c/);
    expect(releaseWorkflow).toMatch(/scripts\/event-Info\.plist/);
    expect(releaseWorkflow).toMatch(/scripts\/event\.entitlements/);
    expect(releaseWorkflow).toMatch(/codesign .*--sign -/);
    expect(releaseWorkflow).not.toMatch(/build:event/);
    expect(releaseWorkflow).not.toMatch(/notarize/);
    expect(releaseWorkflow).not.toMatch(/\bswift\b/);
    expect(releaseWorkflow).not.toMatch(
      /APPLE_CERTIFICATE|APPLE_ID|APPLE_TEAM_ID/,
    );
    expect(releaseWorkflow).toMatch(
      /pnpm install --frozen-lockfile --ignore-scripts/,
    );
    expect(releaseWorkflow).toMatch(
      /pnpm test -- --runInBand --testPathIgnorePatterns=src\/e2e\.test\.ts/,
    );
  });

  it('pins the CI runner image and verifies the ad-hoc signed universal binary', () => {
    expect(releaseWorkflow).toMatch(/runs-on: macos-14/);
    expect(releaseWorkflow).toMatch(/codesign --verify --strict/);
    expect(releaseWorkflow).not.toMatch(/Authority=Developer ID Application:/);
  });

  it('uses the package manager version declared by package.json', () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/);
    const pnpmSetup = releaseWorkflow.match(
      /- name: Setup pnpm[\s\S]*?(?=\n\s+- name:)/,
    )?.[0];
    expect(pnpmSetup).toMatch(/uses: pnpm\/action-setup@v4/);
    expect(pnpmSetup).not.toMatch(/version:/);
  });

  it('uses npm trusted publishing requirements', () => {
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

  it('limits manual recovery publishing to v1.5.0', () => {
    expect(releaseWorkflow).toMatch(/workflow_dispatch:/);
    expect(releaseWorkflow).toMatch(/description:.*v1\.5\.0/);
    expect(releaseWorkflow).toMatch(/type:\s*choice/);
    expect(releaseWorkflow).toMatch(/options:\s*\n\s+- v1\.5\.0/);
    expect(releaseWorkflow).toMatch(/ref:.*inputs\.tag \|\| github\.ref/);
  });
});
