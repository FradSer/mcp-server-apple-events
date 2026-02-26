#!/usr/bin/env node

/**
 * Postinstall script for mcp-server-apple-events
 *
 * This script attempts to build the Swift binary on macOS during installation.
 * It gracefully skips on non-macOS platforms or if Swift is not available.
 */

import { exec } from 'node:child_process';
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
    const buildCommand = `node ${buildScript}`;

    exec(buildCommand, { cwd: projectRoot }, (error, stdout, stderr) => {
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
    });
  });
};

buildSwift()
  .then(() => {
    console.log('Swift binary built successfully');
    process.exit(0);
  })
  .catch(() => {
    console.error(
      'Failed to build Swift binary. The MCP server requires the EventKitCLI binary to function on macOS. Please build it manually with: pnpm run build',
    );
    process.exit(0); // Exit gracefully to not block installation
  });
