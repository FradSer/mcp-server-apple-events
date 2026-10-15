/**
 * helpers.ts
 * General utility functions for common operations
 */

/**
 * CLI argument building utilities
 */

/**
 * Appends one option and its value to an argv array.
 *
 * The attached form (`--title=value`) keeps ArgumentParser from reading a
 * value that starts with `-` as the next option. `--title "- buy milk"` fails
 * with "Missing value for '--title'", while `--title=- buy milk` delivers the
 * text, so dictated titles and notes that start with a Markdown rule or list
 * survive. An empty value keeps the separated form: ArgumentParser reads
 * `--title=` as a missing value but accepts `--title ""`.
 */
export function addArg(args: string[], flag: string, value: string): void {
  if (value === '') {
    args.push(flag, value);
    return;
  }
  args.push(`${flag}=${value}`);
}

/**
 * Adds an optional string argument to the args array if the value is defined
 */
export function addOptionalArg(
  args: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    addArg(args, flag, value);
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
    addArg(args, flag, String(value));
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
