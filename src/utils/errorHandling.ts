/**
 * errorHandling.ts
 * Centralized error handling utilities for consistent error responses
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ValidationError } from '../validation/schemas.js';

const USER_ACTIONABLE_PERMISSION_PATTERNS = [
  /permission denied/i,
  /permission is write-only/i,
  /access denied/i,
  /not authorized.*(calendar|reminders)/i,
  /System Settings > Privacy & Security/i,
  /full calendar access/i,
  /full reminder access/i,
  /subprocess/i,
  /responsible process/i,
] as const;

function isUserActionablePermissionError(message: string): boolean {
  return USER_ACTIONABLE_PERMISSION_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

/**
 * Custom error class for user-facing CLI failures (e.g., not found, invalid
 * input). Lives in this leaf module so it's importable from both repository
 * and handler layers without circular imports.
 */
export class CliUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUserError';
  }
}

/**
 * Determines if the application is running in development mode.
 * Development mode is enabled when:
 * - NODE_ENV is set to 'development', OR
 * - DEBUG environment variable is set to any truthy value
 *
 * This allows detailed error messages to be shown in development
 * while keeping production error messages generic for security.
 */
export function isDevelopmentMode(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    (!!process.env.DEBUG && process.env.DEBUG !== '')
  );
}

/**
 * Creates a descriptive error message, showing validation details in dev mode.
 */
function createErrorMessage(operation: string, error: unknown): string {
  const message =
    error instanceof Error ? error.message : 'System error occurred';
  const isDev = isDevelopmentMode();

  // For validation and CLI user errors, always return the detailed message.
  if (error instanceof ValidationError || error instanceof CliUserError) {
    return message;
  }

  // Permission failures are user-actionable and should stay visible in production.
  if (isUserActionablePermissionError(message)) {
    return `Failed to ${operation}: ${message}`;
  }

  // For other errors, be generic in production.
  return isDev
    ? `Failed to ${operation}: ${message}`
    : `Failed to ${operation}: System error occurred`;
}

/**
 * Utility for handling async operations with consistent error handling
 */
export async function handleAsyncOperation(
  operation: () => Promise<string>,
  operationName: string,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    return {
      content: [{ type: 'text', text: result }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: createErrorMessage(operationName, error),
        },
      ],
      isError: true,
    };
  }
}
