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

/**
 * How to launch `event`. When the disclaim shim (`bin/event-disclaim`) is
 * present, `event` is spawned through it so it becomes its own
 * TCC-responsible process — the EventKit permission prompt then appears
 * regardless of whether the host MCP client (Codex Desktop, Claude Desktop,
 * …) declares EventKit usage strings (issue #93). When the shim is absent
 * (e.g. an older prebuilt install), fall back to spawning `event` directly,
 * which preserves the pre-shim host-attribution behavior.
 */
interface ResolvedLaunch {
  cliPath: string;
  disclaimPath: string | null;
}

// A no-shim launch is cached too (`disclaimFingerprint: null`) and stays
// valid only while the shim's canonical path remains absent — so a shim that
// appears after a rebuild is picked up on the next call, and the no-shim
// path doesn't re-run full validation (which hashes the ~50 MB binary when
// SWIFT_BINARY_HASH is pinned) on every tool call.
let cachedLaunch: {
  launch: ResolvedLaunch;
  disclaimCanonicalPath: string;
  cliFingerprint: BinaryFingerprint;
  disclaimFingerprint: BinaryFingerprint | null;
} | null = null;

// Emitted once per process so a missing/invalid shim (which silently reverts
// EventKit prompts to host-app attribution — the issue #93 failure mode) is
// diagnosable from the host's MCP server logs.
let warnedShimUnavailable = false;

/** Clears the cached binary path (for testing). */
export function clearEventBinaryPathCache(): void {
  cachedLaunch = null;
  warnedShimUnavailable = false;
  warnedInvalidTimeout = false;
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

/**
 * Maximum wall-clock time the `event` CLI may run before the child is killed
 * (default 30 s, overridable via `EVENTKIT_CLI_TIMEOUT_MS`). `execFile`'s
 * default timeout is 0 — "wait forever" — which hangs the MCP request and
 * leaks a child when `event` blocks on an EventKit permission prompt that can
 * never be displayed (headless/launchd context, issue #113). Killed with
 * SIGKILL because the disclaim shim exec-replaces itself into `event`
 * (same PID), so the kill always reaches the real process.
 */
const DEFAULT_CLI_TIMEOUT_MS = 30_000;

// Node's internal timer clamps at 2^31 - 1 ms (emitting a
// TimeoutOverflowWarning and killing ~immediately); clamp here so absurd
// values mean "effectively no timeout" instead of an instant SIGKILL.
const MAX_CLI_TIMEOUT_MS = 2_147_483_647;

// Emitted once per process so a silently-ignored (invalid/zero) timeout
// config is diagnosable from the host's MCP server logs.
let warnedInvalidTimeout = false;

function warnInvalidTimeout(raw: string): void {
  if (!warnedInvalidTimeout && process.env.NODE_ENV !== 'test') {
    warnedInvalidTimeout = true;
    console.error(
      `Invalid EVENTKIT_CLI_TIMEOUT_MS value "${raw}" — expected a positive integer ` +
        `number of milliseconds (e.g. 30000 or 120_000); falling back to ` +
        `${DEFAULT_CLI_TIMEOUT_MS}. Zero cannot disable the timeout.`,
    );
  }
}

function resolveCliTimeoutMs(): number {
  const raw = process.env.EVENTKIT_CLI_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === '') return DEFAULT_CLI_TIMEOUT_MS;
  // Accept numeric-separator syntax ("120_000", matching this file's own
  // `30_000` literals) but nothing else: exponent/hex forms ("1e3", "0x10")
  // would silently change meaning, commas are locale-dependent.
  const digits = raw.trim().replace(/_/g, '');
  if (!/^\d+$/.test(digits)) {
    warnInvalidTimeout(raw);
    return DEFAULT_CLI_TIMEOUT_MS;
  }
  const parsed = Number(digits);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    warnInvalidTimeout(raw);
    return DEFAULT_CLI_TIMEOUT_MS;
  }
  return Math.min(parsed, MAX_CLI_TIMEOUT_MS);
}

interface ExecResult {
  stdout: string | Buffer;
  stderr: string | Buffer;
  /** The enforced timeout for this spawn (captured once at spawn time). */
  timeoutMs: number;
}

const execFilePromise = (
  cliPath: string,
  args: string[],
): Promise<{ result: ExecResult; error: ExecFileException | null }> =>
  new Promise((resolve) => {
    const timeoutMs = resolveCliTimeoutMs();
    execFile(
      cliPath,
      args,
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        // Hand both branches to the caller so it can decide based on stderr
        // content rather than the exit code alone — `event` emits structured
        // EventCLIError messages on stderr regardless of which exit code path
        // ArgumentParser chose (1 for app errors, 64 for usage errors).
        resolve({
          result: { stdout, stderr, timeoutMs },
          error: error ?? null,
        });
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
  // The disclaim shim reports its own spawn failures as
  // `event-disclaim: <detail>` (no "Error: " prefix). Surface them verbatim
  // as user-actionable errors — otherwise production error formatting
  // collapses them into a generic "System error occurred".
  if (message.startsWith('event-disclaim:')) {
    throw new CliUserError(message);
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
  launch: ResolvedLaunch,
  args: string[],
): Promise<ExecResult> {
  // Route through the disclaim shim when it exists: `event-disclaim <event>
  // <args…>` re-execs `event` with TCC responsibility disclaimed.
  const file = launch.disclaimPath ?? launch.cliPath;
  const argv = launch.disclaimPath ? [launch.cliPath, ...args] : args;
  const { result, error } = await execFilePromise(file, argv);
  const stderr = bufferToString(result.stderr) ?? '';

  if (error) {
    // Check the timeout first: `killed: true` is set only when *we* killed
    // the child (verified: external signal deaths leave it false), so it is
    // timeout-specific. stderr flushed before the kill is appended rather
    // than allowed to mask the timeout diagnosis.
    if (error.killed) {
      const stderrDetail = stderr
        ? ` (stderr before kill: ${stderr.trim()})`
        : '';
      throw new CliUserError(
        `event execution failed: timed out after ${result.timeoutMs} ms (killed)${stderrDetail}. ` +
          'The CLI was stuck — possible causes: an EventKit permission prompt that cannot ' +
          'be displayed (headless/launchd context), a slow operation exceeding the timeout, ' +
          'or a stalled system. Grant access in System Settings > Privacy & Security if a ' +
          'prompt was expected; otherwise raise EVENTKIT_CLI_TIMEOUT_MS. A write operation ' +
          'may have completed despite this error — verify before retrying.',
      );
    }
    if (stderr) {
      throwForStderr(stderr);
    }
    const msg = error.message || String(error);
    throw new Error(`event execution failed: ${msg}`);
  }

  return result;
}

function resolveLaunchOrThrow(): ResolvedLaunch {
  if (cachedLaunch) {
    const { launch } = cachedLaunch;
    const cliOk = fingerprintMatches(
      cachedLaunch.cliFingerprint,
      fingerprintFor(launch.cliPath),
    );
    const disclaimOk = launch.disclaimPath
      ? fingerprintMatches(
          cachedLaunch.disclaimFingerprint,
          fingerprintFor(launch.disclaimPath),
        )
      : fingerprintFor(cachedLaunch.disclaimCanonicalPath) === null;
    if (cliOk && disclaimOk) {
      return launch;
    }
  }
  cachedLaunch = null;

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

  const disclaimCanonicalPath = path.join(
    projectRoot,
    'bin',
    FILE_SYSTEM.DISCLAIM_BINARY_NAME,
  );
  const { path: disclaimPath } = findSecureBinaryPath([disclaimCanonicalPath], {
    ...getEnvironmentBinaryConfig(),
    // SWIFT_BINARY_HASH pins bin/event, not the shim — carrying it over here
    // would reject the shim on every strict-mode install and silently revert
    // to host-attributed prompts. The shim gets its own optional pin.
    expectedHash: process.env.SWIFT_DISCLAIM_BINARY_HASH,
    allowedPaths: [disclaimCanonicalPath],
  });

  if (
    !disclaimPath &&
    !warnedShimUnavailable &&
    process.env.NODE_ENV !== 'test'
  ) {
    warnedShimUnavailable = true;
    console.error(
      `event-disclaim shim not found or failed validation at ${disclaimCanonicalPath}; ` +
        'spawning event directly. EventKit permission prompts will be attributed ' +
        'to the host app instead of event (issue #93). Rebuild with `pnpm build` ' +
        'to restore the shim.',
    );
  }

  const launch: ResolvedLaunch = { cliPath, disclaimPath };
  const cliFingerprint = fingerprintFor(cliPath);
  const disclaimFingerprint = disclaimPath
    ? fingerprintFor(disclaimPath)
    : null;
  // A shim that resolved but vanished before fingerprinting (race) leaves
  // disclaimFingerprint null with disclaimPath set — don't cache that; the
  // next call re-resolves.
  if (cliFingerprint && (disclaimPath === null || disclaimFingerprint)) {
    cachedLaunch = {
      launch,
      disclaimCanonicalPath,
      cliFingerprint,
      disclaimFingerprint,
    };
  }
  return launch;
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
  const launch = resolveLaunchOrThrow();
  const { stdout } = await runEventCli(launch, args);
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
  const launch = resolveLaunchOrThrow();
  const { stdout } = await runEventCli(launch, args);
  const normalized = bufferToString(stdout) ?? '';
  return normalized.trim();
}
