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

  it('ships the fallback Swift build script used by postinstall', () => {
    expect(packageJson.files).toContain('scripts/postinstall.mjs');
    expect(packageJson.files).toContain('scripts/build-swift.mjs');
    expect(packageJson.files).toContain('src/');
  });

  it('verifies the exact pre-built binary path before publishing', () => {
    expect(releaseWorkflow).toMatch(/npm pack --json --dry-run/);
    expect(releaseWorkflow).toMatch(/bin\/EventKitCLI/);
    expect(releaseWorkflow).not.toMatch(/grep -qE .*EventKitCLI\(\[\^\.]/);
  });
});
