/**
 * @fileoverview Swift CLI execution and JSON response parsing
 * @module utils/cliExecutor
 * @description Executes the EventKitCLI binary for native macOS EventKit operations
 */

import type { ExecFileException } from 'node:child_process';
import { execFile } from 'node:child_process';
import path from 'node:path';
import {
  findSecureBinaryPath,
  getEnvironmentBinaryConfig,
} from './binaryValidator.js';
import { FILE_SYSTEM } from './constants.js';
import { CliUserError } from './errorHandling.js';
import { bufferToString } from './helpers.js';
import {
  hasBeenPrompted,
  type PermissionDomain,
  type PermissionPromptResult,
  triggerPermissionPrompt,
} from './permissionPrompt.js';
import { findProjectRoot } from './projectUtils.js';

const execFilePromise = (
  cliPath: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    execFile(cliPath, args, (error, stdout, stderr) => {
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
    });
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
 * Calendar-specific action names used in Swift CLI
 */
const CALENDAR_ACTIONS = new Set([
  'read-events',
  'read-calendars',
  'create-event',
  'update-event',
  'delete-event',
]);

const PERMISSION_FALLBACK_PREFIX =
  'If the permission prompt does not appear, run the following command from the same app that launches the server (for example Terminal or Claude Desktop) and approve the prompt:';

const APPLESCRIPT_COMMANDS: Record<PermissionDomain, string> = {
  reminders:
    'osascript -e \'tell application "Reminders" to get the name of every list\'',
  calendars:
    'osascript -e \'tell application "Calendar" to get the name of every calendar\'',
};

/**
 * Detects which permission domain an action requires
 * @param args - CLI arguments array
 * @returns The permission domain ('reminders' or 'calendars')
 */
function detectActionDomain(args: string[]): PermissionDomain {
  const actionIndex = args.indexOf('--action');
  if (actionIndex !== -1 && actionIndex + 1 < args.length) {
    const action = args[actionIndex + 1];
    return CALENDAR_ACTIONS.has(action) ? 'calendars' : 'reminders';
  }
  return 'reminders'; // Default to reminders if action not found
}

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

function buildPermissionFallbackInstruction(
  domain: PermissionDomain,
  promptResult?: PermissionPromptResult,
): string {
  const lines = [PERMISSION_FALLBACK_PREFIX, APPLESCRIPT_COMMANDS[domain]];
  if (promptResult?.errorMessage) {
    lines.push(`AppleScript prompt error: ${promptResult.errorMessage}`);
  }
  return lines.join('\n');
}

function appendPermissionFallbackInstruction(
  message: string,
  domain: PermissionDomain,
  promptResult?: PermissionPromptResult,
): string {
  if (message.includes(PERMISSION_FALLBACK_PREFIX)) {
    return message;
  }
  return `${message}\n\n${buildPermissionFallbackInstruction(domain, promptResult)}`;
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
 * Calendar action strings used in Swift CLI (different from MCP tool action names)
 */

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

const runCli = async <T>(cliPath: string, args: string[]): Promise<T> => {
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
 * - Proactively triggers permission prompts via AppleScript on first access
 * - Automatically retries with AppleScript fallback on permission errors
 * @example
 * const result = await executeCli<Reminder[]>(['--action', 'read', '--showCompleted', 'true']);
 */
export async function executeCli<T>(args: string[]): Promise<T> {
  const projectRoot = findProjectRoot();
  const binaryName = FILE_SYSTEM.SWIFT_BINARY_NAME;
  const possiblePaths = [path.join(projectRoot, 'bin', binaryName)];

  const config = {
    ...getEnvironmentBinaryConfig(),
    allowedPaths: [
      '/bin/EventKitCLI',
      '/dist/swift/bin/',
      '/src/swift/bin/',
      '/swift/bin/',
    ],
  };

  const { path: cliPath } = findSecureBinaryPath(possiblePaths, config);

  if (!cliPath) {
    throw new Error(
      `EventKitCLI binary not found. When installed via npx, the Swift binary must be built manually:

1. Find the npx cache location:
   pnpm store path

2. Navigate to the package and build:
   cd $(pnpm store path)/.pnpm/mcp-server-apple-events@*
   pnpm run build

Alternatively, clone the repository and build locally:
   git clone https://github.com/fradser/mcp-server-apple-events.git
   cd mcp-server-apple-events
   pnpm install
   pnpm build

Then use the local path in your Claude Desktop config:
   "command": "node",
   "args": ["/absolute/path/to/mcp-server-apple-events/bin/run.cjs"]`,
    );
  }

  // Detect which permission domain this action requires
  const domain = detectActionDomain(args);
  const promptResults = new Map<PermissionDomain, PermissionPromptResult>();

  const recordPromptResult = async (
    promptDomain: PermissionDomain,
    force = false,
  ): Promise<PermissionPromptResult> => {
    const result = await triggerPermissionPrompt(promptDomain, force);
    promptResults.set(promptDomain, result);
    return result;
  };

  // Proactively trigger AppleScript permission prompt on first access
  if (!hasBeenPrompted(domain)) {
    await recordPromptResult(domain);
  }

  try {
    return await runCli<T>(cliPath, args);
  } catch (error) {
    if (error instanceof CliPermissionError) {
      const retryPromptResult = await recordPromptResult(error.domain, true);
      try {
        return await runCli<T>(cliPath, args);
      } catch (retryError) {
        if (retryError instanceof CliPermissionError) {
          throw new CliPermissionError(
            appendPermissionFallbackInstruction(
              retryError.message,
              retryError.domain,
              retryPromptResult,
            ),
            retryError.domain,
          );
        }
        throw retryError;
      }
    }
    throw error;
  }
}

/**
 * Escapes a string for safe AppleScript string interpolation
 * @param value - The string to escape
 * @returns The escaped string
 */
export function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Executes an AppleScript command and returns the output
 * @param script - The AppleScript to execute
 * @returns Promise<string> The output from the AppleScript
 */
export async function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (error, stdout, stderr) => {
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
      const output = bufferToString(stdout);
      resolve(output ?? '');
    });
  });
}
