/**
 * handlers/shared.ts
 * Shared helper functions for all handlers
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ZodSchema } from 'zod/v3';
import type {
  CalendarsToolArgs,
  CalendarToolArgs,
  ListsToolArgs,
  RemindersToolArgs,
  SubtasksToolArgs,
} from '../../types/index.js';
import { validateInput } from '../../validation/schemas.js';

/**
 * Provenance attached to every result that contains Calendar or Reminders
 * values. The values in `records` may be copied from a user's local store and
 * must stay separate from the trusted operation summary.
 */
export const TOOL_RESULT_PROVENANCE = {
  source: 'apple-calendar-reminders',
  trust: 'untrusted',
} as const;

export type StructuredToolContent<T> = {
  provenance: typeof TOOL_RESULT_PROVENANCE;
  records: T[];
} & Record<string, unknown>;

/**
 * Returns a result with a static summary and a JSON mirror of the structured
 * records. Dynamic Calendar/Reminders values are emitted only in the
 * explicitly untrusted record envelope.
 */
export const createStructuredToolResult = <T>(
  operation: string,
  records: readonly T[],
): CallToolResult => {
  const structuredContent: StructuredToolContent<T> = {
    provenance: TOOL_RESULT_PROVENANCE,
    records: [...records],
  };

  return {
    content: [
      { type: 'text', text: operation },
      { type: 'text', text: JSON.stringify(structuredContent) },
    ],
    structuredContent,
    isError: false,
  };
};

/**
 * Extracts and validates arguments by removing action and validating the rest
 */
export const extractAndValidateArgs = <T>(
  args:
    | RemindersToolArgs
    | ListsToolArgs
    | SubtasksToolArgs
    | CalendarToolArgs
    | CalendarsToolArgs
    | undefined,
  schema: ZodSchema<T>,
): T => {
  const { action: _, ...rest } = args ?? {};
  return validateInput(schema, rest);
};
