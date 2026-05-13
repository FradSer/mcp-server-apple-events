#!/usr/bin/env node

/**
 * Postinstall script for mcp-server-apple-events
 *
 * This script attempts to build the Swift binary on macOS during installation.
 * It gracefully skips on non-macOS platforms or if Swift is not available.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const isMacOS = process.platform === 'darwin';

if (!isMacOS) {
  console.log('Skipping Swift binary build on non-macOS platform');
  process.exit(0);
}

const buildSwift = async () => {
  return new Promise((resolve, reject) => {
    const buildScript = path.join(projectRoot, 'scripts', 'build-swift.mjs');

    // `execFile` (not `exec`) so the install path is passed as a discrete argv
    // entry instead of being interpolated into a shell command. This keeps the
    // build deterministic even when the project lives under a directory that
    // contains spaces, `$`, backticks, or other shell-significant characters.
    execFile(
      process.execPath,
      [buildScript],
      { cwd: projectRoot },
      (error, stdout, stderr) => {
        if (error) {
          console.error('Swift binary build failed:', error.message);
          if (stderr) {
            console.error('Build error:', stderr);
          }
          reject(error);
          return;
        }
        if (stdout) {
          console.log(stdout);
        }
        resolve(stdout);
      },
    );
  });
};

buildSwift()
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
    console.error('\nTo build manually:');
    console.error('  1. Navigate to the package directory');
    console.error('  2. Run: pnpm install && pnpm run build');
    console.error('\nOr use a local clone instead of npx:');
    console.error(
      '  git clone https://github.com/fradser/mcp-server-apple-events.git',
    );
    console.error('  cd mcp-server-apple-events && pnpm install && pnpm build');
    console.error(`${'='.repeat(70)}\n`);
    process.exit(0); // Exit gracefully to not block installation
  });
