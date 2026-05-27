#!/usr/bin/env node

/**
 * Postinstall script for mcp-server-apple-events
 *
 * When the package is installed via npm, the pre-built EventKitCLI binary is
 * included in the package and this script exits immediately. No Xcode required.
 *
 * When the repository is cloned locally (no pre-built binary), this script
 * attempts to build the Swift binary from source. It gracefully skips on
 * non-macOS platforms or if Swift is not available.
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
    console.log('Skipping Swift binary build on non-macOS platform');
    process.exit(0);
  }

  // If the pre-built binary is already present (npm install from published package),
  // skip the source build entirely.
  const binPath = path.join(projectRoot, 'bin', 'EventKitCLI');
  try {
    await fs.access(binPath, fs.constants.X_OK);
    console.log('Pre-built EventKitCLI binary found, skipping source build.');
    process.exit(0);
  } catch {
    // Binary not present or not executable — proceed to build from source
  }

  await buildSwift();
}

// `execFile` (not `exec`) so the install path is passed as a discrete argv
// entry instead of being interpolated into a shell command. This keeps the
// build deterministic even when the project lives under a directory that
// contains spaces, `$`, backticks, or other shell-significant characters.
async function buildSwift() {
  const buildScript = path.join(projectRoot, 'scripts', 'build-swift.mjs');
  const { stdout } = await execFileAsync(process.execPath, [buildScript], {
    cwd: projectRoot,
  });
  if (stdout) {
    console.log(stdout);
  }
}

main()
  .then(() => {
    console.log('Swift binary built successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error(`\n${'='.repeat(70)}`);
    console.error('WARNING: Swift binary build failed');
    console.error('='.repeat(70));
    console.error('\nError details:', error.message);
    console.error(
      '\nThe MCP server requires the EventKitCLI binary to function.',
    );
    console.error('\nTo build manually, run from the package directory:');
    console.error('  pnpm install && pnpm run build');
    console.error(`${'='.repeat(70)}\n`);
    process.exit(0); // Exit gracefully to not block installation
  });
