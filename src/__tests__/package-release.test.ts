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

  it('checks out submodules and builds via build:event', () => {
    expect(releaseWorkflow).toMatch(/submodules:\s*recursive/);
    expect(releaseWorkflow).toMatch(/build:event/);
  });

  it('pins the CI runner image and fails on non-Developer-ID signatures', () => {
    expect(releaseWorkflow).toMatch(/runs-on: macos-14/);
    expect(releaseWorkflow).toMatch(/Authority=Developer ID Application:/);
    expect(releaseWorkflow).toMatch(/codesign --verify --strict/);
  });

  it('uses the package manager version declared by package.json', () => {
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/);
    const pnpmSetup = releaseWorkflow.match(
      /- name: Setup pnpm[\s\S]*?(?=\n\s+- name:)/,
    )?.[0];
    expect(pnpmSetup).toMatch(/uses: pnpm\/action-setup@v4/);
    expect(pnpmSetup).not.toMatch(/version:/);
  });
});
