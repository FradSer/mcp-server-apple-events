/**
 * permissionPrompt.ts
 * Triggers macOS permission prompts via AppleScript fallbacks.
 */

import type { ExecFileException } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bufferToString } from './helpers.js';

const execFileAsync = promisify(execFile);

export type PermissionDomain = 'reminders' | 'calendars';
export type PermissionPromptResult = {
  ok: boolean;
  domain: PermissionDomain;
  command: string;
  errorMessage?: string;
};

const TIMEOUT_SECONDS = 120;

export const PERMISSION_FALLBACK_PREFIX = `macOS permission is required to access your data.
If the permission prompt does not appear, run the following command from the same app that launches the server:`;

const APPLESCRIPT_SNIPPETS: Record<PermissionDomain, string> = {
  reminders: `with timeout of ${TIMEOUT_SECONDS} seconds\ntell application "Reminders" to get the name of every list\nend timeout`,
  calendars: `with timeout of ${TIMEOUT_SECONDS} seconds\ntell application "Calendar" to get the name of every calendar\nend timeout`,
};

export const APPLESCRIPT_COMMANDS: Record<PermissionDomain, string> = {
  reminders:
    'osascript -e \'tell application "Reminders" to get the name of every list\'',
  calendars:
    'osascript -e \'tell application "Calendar" to get the name of every calendar\'',
};

const promptPromises = new Map<
  PermissionDomain,
  Promise<PermissionPromptResult>
>();

const normalizeAppleScriptError = (error: unknown): string => {
  if (!error) return 'Unknown AppleScript error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const execError = error as ExecFileException & {
      stderr?: string | Buffer;
    };
    const stderr = bufferToString(execError.stderr);
    if (stderr?.trim()) {
      return stderr.trim();
    }
    return error.message;
  }
  return String(error);
};

/**
 * Triggers AppleScript to surface macOS permission dialogs with promise-based memoization
 */
export async function triggerPermissionPrompt(
  domain: PermissionDomain,
  force = false,
): Promise<PermissionPromptResult> {
  if (!force) {
    const existing = promptPromises.get(domain);
    if (existing) {
      return existing;
    }
  }

  const promise = (async () => {
    const script = APPLESCRIPT_SNIPPETS[domain];
    try {
      await execFileAsync('osascript', ['-e', script]);
      return {
        ok: true,
        domain,
        command: APPLESCRIPT_COMMANDS[domain],
      };
    } catch (error) {
      return {
        ok: false,
        domain,
        command: APPLESCRIPT_COMMANDS[domain],
        errorMessage: normalizeAppleScriptError(error),
      };
    }
  })();

  if (!force) {
    promptPromises.set(domain, promise);
  }

  return promise;
}

export function hasBeenPrompted(domain: PermissionDomain): boolean {
  return promptPromises.has(domain);
}

export function resetPromptedDomains(): void {
  promptPromises.clear();
}

export function buildPermissionFallbackInstruction(
  domain: PermissionDomain,
  promptResult?: PermissionPromptResult,
): string {
  const lines = [PERMISSION_FALLBACK_PREFIX, APPLESCRIPT_COMMANDS[domain]];
  if (promptResult?.errorMessage) {
    lines.push(`AppleScript prompt error: ${promptResult.errorMessage}`);
  }
  return lines.join('\n');
}

export function appendPermissionFallbackInstruction(
  message: string,
  domain: PermissionDomain,
  promptResult?: PermissionPromptResult,
): string {
  if (message.includes(PERMISSION_FALLBACK_PREFIX)) {
    return message;
  }
  return `${message}\n\n${buildPermissionFallbackInstruction(domain, promptResult)}`;
}
