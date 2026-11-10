#!/usr/bin/env node

/**
 * index.ts
 * Entry point for the Apple Reminders MCP server
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLI_HELP, parseServerOptions } from './server/options.js';
import { startServer } from './server/server.js';
import { findProjectRoot } from './utils/projectUtils.js';
import { configureReminderRepository } from './utils/reminderRepository.js';

// Find project root and load package.json
const projectRoot = findProjectRoot();
let packageJson: { name: string; version: string };
try {
  packageJson = JSON.parse(
    readFileSync(join(projectRoot, 'package.json'), 'utf-8'),
  );
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  throw new Error(`Failed to parse package.json: ${detail}`);
}

// Parse before opening the MCP transport. Diagnostics belong on stderr so
// stdout remains reserved for JSON-RPC during normal server operation.
try {
  const options = parseServerOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(CLI_HELP);
  } else {
    configureReminderRepository({ urlViaShortcut: options.urlViaShortcut });
    startServer({
      name: packageJson.name,
      version: packageJson.version,
      requireWriteConfirmation: options.requireWriteConfirmation,
    }).catch(() => {
      process.exit(1);
    });
  }
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `Invalid server options: ${detail}\nRun with --help for usage.\n`,
  );
  process.exit(1);
}
