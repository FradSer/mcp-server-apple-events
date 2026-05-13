/**
 * @fileoverview Swift CLI execution and JSON response parsing
 * @module utils/cliExecutor
 * @description Executes the EventKitCLI binary for native macOS EventKit operations
 */

import type { ExecFileException } from 'node:child_process';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  findSecureBinaryPath,
  getEnvironmentBinaryConfig,
} from './binaryValidator.js';
import { FILE_SYSTEM } from './constants.js';
import { CliUserError } from './errorHandling.js';
import { bufferToString } from './helpers.js';
import { findProjectRoot } from './projectUtils.js';

/**
 * Cached binary path plus a fingerprint of the file at validation time. The
 * fingerprint lets us short-circuit the (cheap but TOCTOU-prone) re-validation
 * on subsequent calls only when the on-disk binary is byte-identical to the
 * one we already vetted; if it changed (inode/mtime/size differ), we drop the
 * cache and re-run full validation. This keeps the original ~1-3 ms savings
 * for the common case while preventing a swapped binary between calls from
 * silently being executed.
 */
interface BinaryFingerprint {
  ino: number;
  mtimeMs: number;
  size: number;
}
let cachedBinaryPath: string | null = null;
let cachedBinaryFingerprint: BinaryFingerprint | null = null;

/**
 * Clears the cached binary path (for testing)
 */
export function clearBinaryPathCache(): void {
  cachedBinaryPath = null;
  cachedBinaryFingerprint = null;
}

const fingerprintFor = (filePath: string): BinaryFingerprint | null => {
  try {
    const stat = fs.statSync(filePath);
    return { ino: stat.ino, mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
};

const fingerprintMatches = (
  a: BinaryFingerprint | null,
  b: BinaryFingerprint | null,
): boolean =>
  a !== null &&
  b !== null &&
  a.ino === b.ino &&
  a.mtimeMs === b.mtimeMs &&
  a.size === b.size;

const execFilePromise = (
  cliPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    execFile(
      cliPath,
      args,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const execError = error as ExecFileException & {
            stdout?: string | Buffer;
            stderr?: string | Buffer;
          };
          execError.stdout = stdout;
          execError.stderr = stderr;
          reject(execError);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });

interface CliSuccessResponse<T> {
  status: 'success';
  result: T;
}

interface CliErrorResponse {
  status: 'error';
  message: string;
}

type CliResponse<T> = CliSuccessResponse<T> | CliErrorResponse;

export type PermissionDomain = 'reminders' | 'calendars';

/**
 * Permission error patterns from the Swift CLI
 */
const PERMISSION_ERROR_PATTERNS: Record<PermissionDomain, RegExp[]> = {
  reminders: [
    /reminder permission denied/i,
    /reminders access denied/i,
    /not authorized.*reminders/i,
    /reminder permission is write-only/i,
  ],
  calendars: [
    /calendar permission denied/i,
    /calendar access denied/i,
    /not authorized.*calendar/i,
    /calendar permission is write-only/i,
  ],
};

/**
 * Detects if an error message indicates a permission issue
 * @param message - Error message to check
 * @returns The permission domain if detected, null otherwise
 */
function detectPermissionError(message: string): PermissionDomain | null {
  for (const [domain, patterns] of Object.entries(PERMISSION_ERROR_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(message))) {
      return domain as PermissionDomain;
    }
  }
  return null;
}

/**
 * Custom error class for permission-related failures
 */
export class CliPermissionError extends Error {
  constructor(
    message: string,
    public readonly domain: PermissionDomain,
  ) {
    super(message);
    this.name = 'CliPermissionError';
  }
}

/**
 * Parses JSON output from CLI
 */
const parseCliOutput = <T>(output: string): T => {
  let parsed: CliResponse<T>;
  try {
    parsed = JSON.parse(output) as CliResponse<T>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `EventKitCLI execution failed: Invalid CLI output - ${detail}`,
    );
  }

  if (parsed.status === 'success') {
    return parsed.result;
  }

  const permissionDomain = detectPermissionError(parsed.message);
  if (permissionDomain) {
    throw new CliPermissionError(parsed.message, permissionDomain);
  }

  throw new CliUserError(parsed.message);
};

/**
 * Defense-in-depth: refuse to spawn the Swift binary if a value position
 * (the token following any `--flag`) itself starts with `--`. A malformed or
 * outdated Swift argument parser could otherwise mistake the user-supplied
 * value for a new flag and silently flip unrelated reminder/event state.
 *
 * Legitimate CLI values never start with `--`: dates, numbers, JSON payloads
 * (start with `{`/`[`), booleans (`true`/`false`), and free-form text after
 * Zod validation are all incompatible with a leading `--`.
 */
const assertNoFlagShapedValues = (args: string[]): void => {
  for (let i = 0; i < args.length - 1; i++) {
    const token = args[i];
    const next = args[i + 1];
    if (
      typeof token === 'string' &&
      token.startsWith('--') &&
      typeof next === 'string' &&
      next.startsWith('--')
    ) {
      throw new Error(
        `EventKitCLI execution refused: value for flag ${token} cannot start with '--' (got: ${JSON.stringify(next.slice(0, 32))})`,
      );
    }
  }
};

const runCli = async <T>(cliPath: string, args: string[]): Promise<T> => {
  assertNoFlagShapedValues(args);
  try {
    const { stdout } = await execFilePromise(cliPath, args);
    const normalized = bufferToString(stdout);
    if (!normalized) {
      throw new Error('EventKitCLI execution failed: Empty CLI output');
    }
    return parseCliOutput(normalized);
  } catch (error) {
    if (error instanceof CliPermissionError || error instanceof CliUserError) {
      throw error;
    }
    const execError = error as ExecFileException & {
      stdout?: string | Buffer;
    };
    const normalized = bufferToString(execError?.stdout);
    if (normalized) {
      return parseCliOutput(normalized);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`EventKitCLI execution failed: ${errorMessage}`);
  }
};

/**
 * Executes the EventKitCLI binary for native macOS EventKit operations
 * @template T - Expected return type from the Swift CLI
 * @param {string[]} args - Array of arguments to pass to the CLI
 * @returns {Promise<T>} Parsed JSON result from the CLI
 * @throws {Error} If binary not found, validation fails, or CLI execution fails
 * @description
 * - Locates binary using secure path validation
 * - Parses JSON response from Swift CLI
 *
 * @security
 * This function prevents shell injection through argument separation:
 *
 * 1. **Uses `execFile()` instead of `exec()`**: The Node.js `child_process.execFile()`
 *    function spawns the process directly without invoking a shell interpreter. This
 *    means shell metacharacters like `;`, `|`, `&`, `$`, `()`, and backticks are
 *    treated as literal text, not as command operators.
 *
 * 2. **Arguments passed as separate array**: Arguments are passed as an array of
 *    discrete strings to the binary, not concatenated into a command string. The
 *    operating system passes each argument directly to the spawned process via
 *    `execve()`, preventing injection through argument boundaries.
 *
 * 3. **Swift CLI ArgumentParser**: The Swift binary uses Swift's ArgumentParser
 *    library, which provides type-safe argument parsing and additional validation
 *    at the native layer.
 *
 * Example of safe handling with malicious input:
 * ```typescript
 * // Even with malicious title containing shell metacharacters
 * await executeCli(['--title', 'test; rm -rf /']);
 * // The semicolon is passed as a literal string to the binary,
 * // NOT interpreted as a command separator
 * ```
 *
 * @example
 * const result = await executeCli<Reminder[]>(['--action', 'read', '--showCompleted', 'true']);
 */
export async function executeCli<T>(args: string[]): Promise<T> {
  // Use cached binary path only if the on-disk file is byte-identical to the
  // one we previously validated. Any mismatch invalidates the cache and
  // forces a full re-resolve + re-validate, which closes the TOCTOU window
  // between calls.
  if (
    cachedBinaryPath &&
    fingerprintMatches(
      cachedBinaryFingerprint,
      fingerprintFor(cachedBinaryPath),
    )
  ) {
    return await runCli<T>(cachedBinaryPath, args);
  }
  cachedBinaryPath = null;
  cachedBinaryFingerprint = null;

  const projectRoot = findProjectRoot();
  const binaryName = FILE_SYSTEM.SWIFT_BINARY_NAME;
  const possiblePaths = [path.join(projectRoot, 'bin', binaryName)];

  // Allowed paths are interpreted as suffixes of either the binary's full
  // path or its parent directory. The Swift binary ships at
  // `<projectRoot>/bin/EventKitCLI`, so `bin/EventKitCLI` is the canonical
  // (filename-anchored) production entry — that is strict enough to reject
  // `/usr/local/bin/<anything-else>` while still matching the install
  // location regardless of where the package is unpacked. The remaining
  // entries cover source-tree dev builds. See `binaryValidator.ts` for
  // matching semantics.
  const config = {
    ...getEnvironmentBinaryConfig(),
    allowedPaths: [
      'bin/EventKitCLI',
      'dist/swift/bin/EventKitCLI',
      'src/swift/bin/EventKitCLI',
      'swift/bin/EventKitCLI',
    ],
  };

  const { path: cliPath } = findSecureBinaryPath(possiblePaths, config);

  if (!cliPath) {
    throw new CliUserError(
      `EventKitCLI binary not found at ${possiblePaths[0]}.

The Swift binary is normally built automatically by the postinstall script,
but that step may have been skipped or failed (for example when the package
was installed without devDependencies, on a non-macOS host, or before Xcode
Command Line Tools were available).

To build it manually, clone the repository and run a local build:
   git clone https://github.com/fradser/mcp-server-apple-events.git
   cd mcp-server-apple-events
   pnpm install
   pnpm build

Then use the local path in your Claude Desktop config:
   "command": "node",
   "args": ["/absolute/path/to/mcp-server-apple-events/bin/run.cjs"]`,
    );
  }

  // Cache the validated path AND a fingerprint of the file so subsequent
  // calls can confirm the binary has not been swapped on disk.
  cachedBinaryPath = cliPath;
  cachedBinaryFingerprint = fingerprintFor(cliPath);

  return await runCli<T>(cliPath, args);
}
