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

  it('ships the fallback Swift build inputs used by postinstall', () => {
    expect(packageJson.files).toContain('scripts/postinstall.mjs');
    expect(packageJson.files).toContain('scripts/build-swift.mjs');
    // build-swift.mjs reads these three files at install time when no
    // pre-built binary is present.
    expect(packageJson.files).toContain('src/swift/EventKitCLI.swift');
    expect(packageJson.files).toContain('src/swift/Info.plist');
    expect(packageJson.files).toContain('src/swift/EventKitCLI.entitlements');
  });

  it('does not ship the full src/ tree (no tests, no compiled output)', () => {
    // Wildcards in `files` would re-add `*.test.ts` and Swift bridge tests
    // to consumers' node_modules for no benefit.
    expect(packageJson.files).not.toContain('src/');
    expect(packageJson.files).not.toContain('src/**');
  });

  it('verifies the exact pre-built binary path before publishing', () => {
    expect(releaseWorkflow).toMatch(/npm pack --json --dry-run/);
    expect(releaseWorkflow).toMatch(/bin\/EventKitCLI/);
    expect(releaseWorkflow).not.toMatch(/grep -qE .*EventKitCLI\(\[\^\.]/);
  });

  it('pins the CI runner image and fails on non-Developer-ID signatures', () => {
    expect(releaseWorkflow).toMatch(/runs-on: macos-14/);
    expect(releaseWorkflow).toMatch(/Authority=Developer ID Application:/);
    expect(releaseWorkflow).toMatch(/codesign --verify --strict/);
  });
});
