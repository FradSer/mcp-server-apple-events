#!/usr/bin/env node

/**
 * Postinstall script for mcp-server-apple-events
 *
 * When the package is installed via npm, the pre-built `event` binary is
 * included in the package and this script exits immediately. No Xcode required.
 *
 * When the repository is cloned locally (no pre-built binary), this script
 * attempts to build the vendored `event` CLI from source. It gracefully skips
 * on non-macOS platforms or if Swift is not available.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  if (process.platform !== 'darwin') {
    console.log('Skipping `event` CLI build on non-macOS platform');
    process.exit(0);
  }

  // If the pre-built binary is already present (npm install from published
  // package), skip the source build entirely — the npm tarball does not
  // include the vendor/event submodule sources, so there is nothing to
  // build against anyway.
  const binPath = path.join(projectRoot, 'bin', 'event');
  try {
    await fs.access(binPath, fs.constants.X_OK);
    console.log('Pre-built `event` binary found, skipping source build.');
    process.exit(0);
  } catch {
    // Binary not present or not executable — proceed to build from source
  }

  await buildEvent();
}

// `execFile` (not `exec`) so the install path is passed as a discrete argv
// entry instead of being interpolated into a shell command. This keeps the
// build deterministic even when the project lives under a directory that
// contains spaces, `$`, backticks, or other shell-significant characters.
async function buildEvent() {
  const buildScript = path.join(projectRoot, 'scripts', 'build-event.mjs');
  const { stdout } = await execFileAsync(process.execPath, [buildScript], {
    cwd: projectRoot,
  });
  if (stdout) {
    console.log(stdout);
  }
}

main()
  .then(() => {
    console.log('`event` CLI built successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n${'='.repeat(70)}`);
    console.error('WARNING: `event` CLI build failed');
    console.error('='.repeat(70));
    console.error('\nError details:', error.message);
    console.error(
      '\nThe MCP server requires the bundled `event` binary to function.',
    );
    console.error('\nTo build manually:');
    console.error('  1. Navigate to the package directory');
    console.error(
      '  2. Initialize the submodule: git submodule update --init --recursive',
    );
    console.error('  3. Run: pnpm install && pnpm run build');
    console.error('\nOr use a local clone instead of npx:');
    console.error(
      '  git clone --recurse-submodules https://github.com/fradser/mcp-server-apple-events.git',
    );
    console.error('  cd mcp-server-apple-events && pnpm install && pnpm build');
    console.error(`${'='.repeat(70)}\n`);
    process.exit(0); // Exit gracefully to not block installation
  });
