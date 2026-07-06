/**
 * @fileoverview `event` CLI execution wrapper
 * @module utils/eventCli
 * @description Spawns the vendored `event` Swift binary (FradSer/event) and
 * translates its stdout / stderr / exit code into JSON results, plain-text
 * results, or domain-specific errors. `event` outputs raw JSON to stdout and
 * writes `Error: <message>` to stderr with a non-zero exit code on failure.
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
 * Validated binary path plus a fingerprint of the file at validation time.
 * Re-validate when the on-disk binary changes (closes the TOCTOU window
 * between calls); short-circuit otherwise.
 */
interface BinaryFingerprint {
  ino: number;
  mtimeMs: number;
  size: number;
}
let cachedBinary: { path: string; fingerprint: BinaryFingerprint } | null =
  null;

/** Clears the cached binary path (for testing). */
export function clearEventBinaryPathCache(): void {
  cachedBinary = null;
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

interface ExecResult {
  stdout: string | Buffer;
  stderr: string | Buffer;
}

const execFilePromise = (
  cliPath: string,
  args: string[],
): Promise<{ result: ExecResult; error: ExecFileException | null }> =>
  new Promise((resolve) => {
    execFile(
      cliPath,
      args,
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        // Hand both branches to the caller so it can decide based on stderr
        // content rather than the exit code alone — `event` emits structured
        // EventCLIError messages on stderr regardless of which exit code path
        // ArgumentParser chose (1 for app errors, 64 for usage errors).
        resolve({ result: { stdout, stderr }, error: error ?? null });
      },
    );
  });

export type PermissionDomain = 'reminders' | 'calendars';

/**
 * Detects an `event` permission error and which EventKit domain it belongs to.
 *
 * `event`'s error format is `Error: Permission denied: <domain-specific text>`
 * where the domain word ("Reminders" / "Reminder" or "Calendar"/"Calendars")
 * always appears in the second half of the message. We match anchored on the
 * "Permission denied" prefix so we never misclassify the unrelated phrase
 * "permission" used in normal output.
 */
// An ordered array (not a `Record`) because iteration order matters: a
// defensive message that names both domains is attributed to whichever
// pattern appears first here, and `Record`/`Object.entries` iteration order
// isn't guaranteed by the type system even though it happens to match
// insertion order at runtime.
const PERMISSION_DOMAIN_PATTERNS: [PermissionDomain, RegExp][] = [
  ['reminders', /Permission denied:[\s\S]*?reminders?/i],
  ['calendars', /Permission denied:[\s\S]*?calendars?/i],
];

function detectPermissionDomain(message: string): PermissionDomain | null {
  for (const [domain, pattern] of PERMISSION_DOMAIN_PATTERNS) {
    if (pattern.test(message)) {
      return domain;
    }
  }
  return null;
}

/** Custom error class for permission-related failures from the `event` CLI. */
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
 * Pulls the meaningful message out of `event`'s stderr. ArgumentParser prepends
 * `Error: ` to every EventCLIError and to its own usage errors, so we strip
 * that and trim trailing whitespace. The boolean signals whether the stderr
 * looked like a structured event-emitted error or some other failure mode.
 */
function extractStderrMessage(stderr: string): {
  message: string;
  hadErrorPrefix: boolean;
} {
  const trimmed = stderr.replace(/\r?\n/g, '\n').trim();
  if (!trimmed) return { message: '', hadErrorPrefix: false };
  if (trimmed.startsWith('Error: ')) {
    return {
      message: trimmed.slice('Error: '.length),
      hadErrorPrefix: true,
    };
  }
  return { message: trimmed, hadErrorPrefix: false };
}

function throwForStderr(stderr: string): never {
  const { message, hadErrorPrefix } = extractStderrMessage(stderr);
  if (!message) {
    throw new Error('event execution failed: unknown error');
  }
  // Only structured "Error: ..." stderr is treated as a user-actionable
  // CliUserError or permission error. Anything else (panics, OS-level
  // failures, etc.) is wrapped so the host surface mentions the `event`
  // binary instead of attributing the message to our own code.
  if (!hadErrorPrefix) {
    throw new Error(`event execution failed: ${message}`);
  }
  const domain = detectPermissionDomain(message);
  if (domain) {
    throw new CliPermissionError(message, domain);
  }
  throw new CliUserError(message);
}

async function runEventCli(
  cliPath: string,
  args: string[],
): Promise<ExecResult> {
  const { result, error } = await execFilePromise(cliPath, args);
  const stderr = bufferToString(result.stderr) ?? '';

  if (error) {
    if (stderr) {
      throwForStderr(stderr);
    }
    const msg = error.message || String(error);
    throw new Error(`event execution failed: ${msg}`);
  }

  return result;
}

function resolveBinaryPathOrThrow(): string {
  if (
    cachedBinary &&
    fingerprintMatches(
      cachedBinary.fingerprint,
      fingerprintFor(cachedBinary.path),
    )
  ) {
    return cachedBinary.path;
  }
  cachedBinary = null;

  const projectRoot = findProjectRoot();
  const binaryName = FILE_SYSTEM.SWIFT_BINARY_NAME;
  const canonicalPath = path.join(projectRoot, 'bin', binaryName);

  // Restrict the validator's suffix matcher to this one absolute path so a
  // misconfigured allowlist can't accept `/usr/local/bin/event` or any other
  // `bin/event` on disk by accident.
  const config = {
    ...getEnvironmentBinaryConfig(),
    allowedPaths: [canonicalPath],
  };

  const { path: cliPath } = findSecureBinaryPath([canonicalPath], config);
  if (!cliPath) {
    throw new CliUserError(
      `event CLI binary not found at ${canonicalPath}.

The vendored \`event\` Swift binary is normally built automatically by the
postinstall script, but that step may have been skipped or failed (for example
when the package was installed without devDependencies, on a non-macOS host,
or before Xcode Command Line Tools were available).

To build it manually, clone the repository and run a local build:
   git clone --recurse-submodules https://github.com/fradser/mcp-server-apple-events.git
   cd mcp-server-apple-events
   pnpm install
   pnpm build

Then use the local path in your Claude Desktop config:
   "command": "node",
   "args": ["/absolute/path/to/mcp-server-apple-events/bin/run.cjs"]`,
    );
  }

  const fingerprint = fingerprintFor(cliPath);
  if (fingerprint) {
    cachedBinary = { path: cliPath, fingerprint };
  }
  return cliPath;
}

/**
 * Executes the `event` binary and parses its stdout as raw JSON.
 *
 * @template T - Expected JSON type emitted by `event`
 * @param args - Full argv (including subcommand and `--json` where supported)
 * @returns Parsed JSON value
 * @throws {CliPermissionError} on EventKit permission failure (domain-typed)
 * @throws {CliUserError} on application errors surfaced by `event` (Not found,
 *   Invalid input, ArgumentParser usage errors)
 * @throws {Error} when stdout is empty or unparseable
 *
 * @security
 * - Uses `execFile` (not `exec`) so shell metacharacters in argv are inert.
 * - Argv is passed as an array; each token is delivered to the binary verbatim
 *   via `execve()`, preventing argument-boundary injection.
 * - Binary path is validated against an allowlist tied to the project root.
 */
export async function executeEventCliJson<T>(args: string[]): Promise<T> {
  const cliPath = resolveBinaryPathOrThrow();
  const { stdout } = await runEventCli(cliPath, args);
  const normalized = bufferToString(stdout);
  if (!normalized) {
    throw new Error('event execution failed: Empty CLI output');
  }
  try {
    return JSON.parse(normalized) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`event execution failed: Invalid CLI output - ${detail}`);
  }
}

/**
 * Executes the `event` binary and returns its trimmed stdout as plain text.
 * Used for commands that emit a success message instead of JSON (e.g.
 * `event reminders delete` returns "Reminder deleted successfully").
 */
export async function executeEventCliPlain(args: string[]): Promise<string> {
  const cliPath = resolveBinaryPathOrThrow();
  const { stdout } = await runEventCli(cliPath, args);
  const normalized = bufferToString(stdout) ?? '';
  return normalized.trim();
}
