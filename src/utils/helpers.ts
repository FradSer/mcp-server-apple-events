/**
 * helpers.ts
 * General utility functions for common operations
 */

/**
 * CLI argument building utilities
 */

/**
 * Adds an optional string argument to the args array if the value is defined
 */
export function addOptionalArg(
  args: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    args.push(flag, value);
  }
}

/**
 * Adds an optional boolean argument to the args array if the value is defined
 */
export function addOptionalBooleanArg(
  args: string[],
  flag: string,
  value: boolean | undefined,
): void {
  if (value !== undefined) {
    args.push(flag, String(value));
  }
}

/**
 * Adds an optional number argument to the args array if the value is defined
 */
export function addOptionalNumberArg(
  args: string[],
  flag: string,
  value: number | undefined,
): void {
  if (value !== undefined) {
    args.push(flag, String(value));
  }
}

/**
 * Adds an optional JSON argument to the args array if the value is defined
 */
export function addOptionalJsonArg(
  args: string[],
  flag: string,
  value: object | undefined,
): void {
  if (value) {
    args.push(flag, JSON.stringify(value));
  }
}

/**
 * Type conversion utilities
 */

/**
 * Converts null values to undefined for optional fields
 * This is useful when converting from JSON (which uses null) to TypeScript types (which use undefined)
 */
export function nullToUndefined<T>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj } as Record<string, unknown>;
  for (const field of fields) {
    const fieldKey = String(field);
    if (result[fieldKey] === null) {
      result[fieldKey] = undefined;
    }
  }
  return result as T;
}

/**
 * String manipulation utilities
 */

/**
 * Converts Buffer or string data to string, handling null/undefined values
 * @param data - Input data that may be string, Buffer, null, or undefined
 * @returns String representation or null
 */
export function bufferToString(data?: string | Buffer | null): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  return data ?? null;
}

/**
 * Formats multiline notes for markdown display by indenting continuation lines
 * Replaces newlines with newline + indentation to maintain proper formatting
 */
export function formatMultilineNotes(notes: string): string {
  return notes.replace(/\n/g, '\n    ');
}
