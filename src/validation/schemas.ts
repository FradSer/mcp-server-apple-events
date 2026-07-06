import { z } from 'zod/v3';
import { VALIDATION } from '../utils/constants.js';

// Security patterns – allow printable Unicode text while blocking dangerous control and delimiter chars.
// Allows standard printable ASCII, extended Latin, CJK, plus newlines/tabs for notes.
// Blocks: control chars (0x00-0x1F except \n\r\t), DEL, dangerous delimiters, Unicode line separators
// Blocks: bidirectional control characters (U+202A-U+202E, U+2066-U+2069) to prevent visual spoofing
// This keeps Chinese/Unicode names working while remaining safe with AppleScript quoting.
const SAFE_TEXT_PATTERN =
  /^[\u0020-\u007E\u00A0-\u2027\u202F-\u2065\u206A-\uD7FF\uE000-\u{10FFFF}\n\r\t]*$/u;
// Support multiple date formats: YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, or ISO 8601.
// Keep this strict enough that a malformed date cannot pass the TS layer and
// later collapse to an unbounded EventKit query in the Swift CLI.
const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
// URL validation: accept any valid URI (any scheme) so reminders can link to
// custom-scheme deep links like obsidian://, shortcuts://, tel:, mailto: —
// EventKit's EKReminder.url accepts any NSURL, so the MCP layer should not be
// stricter than the underlying API (see issue #101).
//
// For http(s) URLs we still apply SSRF protection (private/internal addresses,
// localhost, cloud metadata) because those map to real network hostnames the
// model might be tricked into emitting. Custom schemes are app-handled by
// macOS and don't reach the network through us, so scheme-validation alone is
// sufficient there.
//
// We still reject a small set of schemes that are dangerous regardless of
// hostname: file (local filesystem), javascript / vbscript (script execution
// in any client that renders the link), jar / dict / gopher (historical SSRF
// vectors via URL handlers), and data (can carry executable content).
//
// SSRF blocklist for http(s) hostnames:
// - IPv4 private/reserved (127.x, 192.168.x, 10.x, 172.16-31.x, 169.254.x, 0.0.0.0, 224-239.x multicast)
// - IPv6 loopback (::1), unspecified (::), link-local (fe80::), private (fc/fd), multicast (ff)
// - Cloud metadata (169.254.169.254, 100.100.100.200, metadata.google.internal)
// - Internal hostnames (localhost, localhost.localdomain, local, internal)
// Note: For production use, consider using a dedicated SSRF protection library

// Schemes that are dangerous regardless of host — block unconditionally.
// Compared case-insensitively against URL.protocol which includes the colon.
const BLOCKED_URL_SCHEMES = new Set([
  'file:',
  'javascript:',
  'vbscript:',
  'data:',
  'jar:',
  'dict:',
  'gopher:',
]);

// Schemes that resolve to a network hostname and therefore need SSRF checks.
// Other schemes (mailto:, tel:, obsidian://, shortcuts://, ...) are app-routed
// by macOS and never reach the network through this process.
const HOST_BASED_URL_SCHEMES = new Set(['http:', 'https:']);

// Reject control characters and whitespace anywhere in the URL — the URL
// parser is lenient about some of these and we want a strict input.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — must catch raw control chars and DEL injected into URLs
const URL_FORBIDDEN_CHARS = /[\s\x00-\x1f\x7f]/;

/**
 * Checks if a hostname is blocked for SSRF protection
 */
function isBlockedHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  // Blocked hostnames
  const blockedHostnames = [
    'localhost',
    'localhost.localdomain',
    'local',
    'internal',
    'metadata.google.internal',
  ];
  if (blockedHostnames.includes(lowerHostname)) {
    return true;
  }

  // Check for decimal IP notation (e.g., 2130706433 for 127.0.0.1)
  if (/^\d+$/.test(lowerHostname)) {
    const decimal = parseInt(lowerHostname, 10);
    if (!Number.isNaN(decimal) && decimal > 0 && decimal <= 4294967295) {
      const a = (decimal >>> 24) & 255;
      const b = (decimal >>> 16) & 255;
      const c = (decimal >>> 8) & 255;
      const d = decimal & 255;
      if (isBlockedIPv4(a, b, c, d)) return true;
    }
  }

  // Check for hexadecimal IP notation (e.g., 0x7f000001 for 127.0.0.1)
  if (/^0x[0-9a-f]+$/i.test(lowerHostname)) {
    const hex = parseInt(lowerHostname, 16);
    if (!Number.isNaN(hex) && hex > 0 && hex <= 4294967295) {
      const a = (hex >>> 24) & 255;
      const b = (hex >>> 16) & 255;
      const c = (hex >>> 8) & 255;
      const d = hex & 255;
      if (isBlockedIPv4(a, b, c, d)) return true;
    }
  }

  // Check for octal IP notation (e.g., 0177.0.0.1 for 127.0.0.1)
  const octalPattern = /^0[0-7]*(?:\.[0-7]+){0,3}$/;
  if (octalPattern.test(lowerHostname)) {
    const parts = lowerHostname.split('.').map((p) => parseInt(p, 8));
    if (
      parts.length === 4 &&
      parts.every((p) => !Number.isNaN(p) && p >= 0 && p <= 255)
    ) {
      if (isBlockedIPv4(parts[0]!, parts[1]!, parts[2]!, parts[3]!))
        return true;
    }
  }

  // IPv4 pattern checks (standard dotted decimal) — groups 1-4 are mandatory.
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d+)?$/;
  const ipv4Match = lowerHostname.match(ipv4Pattern);
  if (ipv4Match) {
    if (
      isBlockedIPv4(
        Number(ipv4Match[1]),
        Number(ipv4Match[2]),
        Number(ipv4Match[3]),
        Number(ipv4Match[4]),
      )
    )
      return true;
  }

  // IPv6 pattern checks (remove brackets first)
  const ipv6Hostname = lowerHostname.replace(/^\[|\]$/g, '');
  // ::1 (loopback)
  if (ipv6Hostname === '::1' || ipv6Hostname === '0:0:0:0:0:0:0:1') return true;
  // :: (unspecified)
  if (ipv6Hostname === '::' || ipv6Hostname === '0:0:0:0:0:0:0:0') return true;
  // fe80::/10 (link-local)
  if (/^fe[89ab][0-9a-f]:/i.test(ipv6Hostname)) return true;
  // fc00::/7 (ULA - unique local address)
  if (
    /^fc[0-9a-f][0-9a-f]:/i.test(ipv6Hostname) ||
    /^fd[0-9a-f][0-9a-f]:/i.test(ipv6Hostname)
  )
    return true;
  // ff00::/8 (multicast)
  if (/^ff[0-9a-f][0-9a-f]:/i.test(ipv6Hostname)) return true;
  // 2001:db8::/32 (documentation)
  if (/^2001:db8:/i.test(ipv6Hostname)) return true;

  // ::ffff:0:0/96 (IPv4-mapped IPv6) and 64:ff9b::/96 (NAT64, RFC 6052).
  // WHATWG URL normalises `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]` and the
  // fully expanded form back to the same shorthand, so by the time we look at
  // the hostname only the shorthand reaches here. Decode the trailing two
  // hextets and run them through the IPv4 blocklist so a mapped or NAT64
  // form of any blocked v4 address (loopback, private, link-local, cloud
  // metadata) is rejected too — on NAT64-active hosts `[64:ff9b::7f00:1]`
  // is routed straight to 127.0.0.1 by the gateway.
  const v4EmbeddedMatch = ipv6Hostname.match(
    /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
  );
  if (v4EmbeddedMatch) {
    const high = parseInt(v4EmbeddedMatch[1]!, 16);
    const low = parseInt(v4EmbeddedMatch[2]!, 16);
    if (
      isBlockedIPv4(
        (high >>> 8) & 255,
        high & 255,
        (low >>> 8) & 255,
        low & 255,
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if IPv4 octets represent a blocked address
 */
function isBlockedIPv4(a: number, b: number, c: number, d: number): boolean {
  // Validate octet ranges
  if (
    a < 0 ||
    a > 255 ||
    b < 0 ||
    b > 255 ||
    c < 0 ||
    c > 255 ||
    d < 0 ||
    d > 255
  ) {
    return false;
  }
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 192.168.0.0/16 (private)
  if (a === 192 && b === 168) return true;
  // 10.0.0.0/8 (private)
  if (a === 10) return true;
  // 172.16.0.0/12 (private)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 169.254.0.0/16 (link-local + cloud metadata)
  if (a === 169 && b === 254) return true;
  // 100.100.100.200 (Alibaba Cloud metadata)
  if (a === 100 && b === 100 && c === 100 && d === 200) return true;
  // 0.0.0.0/8 (unspecified/current network)
  if (a === 0) return true;
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (reserved for future use)
  if (a >= 240) return true;
  return false;
}

// Maximum lengths for security (imported from constants.ts)

/**
 * Schema factory for safe text validation
 * @param {number} minLength - Minimum character length (0 for optional)
 * @param {number} maxLength - Maximum character length
 * @param {string} [fieldName='Text'] - Field name for error messages
 * @param {boolean} [optional=false] - Whether the field is optional
 * @returns {ZodString | ZodOptional<ZodString>} Validated string schema
 * @description
 * - Blocks control characters and dangerous Unicode
 * - Allows printable ASCII, extended Latin, CJK characters
 * - Enforces length limits for security
 */
function createSafeTextSchema(
  minLength: number,
  maxLength: number,
  fieldName?: string,
  optional?: false,
): z.ZodString;
function createSafeTextSchema(
  minLength: number,
  maxLength: number,
  fieldName: string,
  optional: true,
): z.ZodOptional<z.ZodString>;
function createSafeTextSchema(
  minLength: number,
  maxLength: number,
  fieldName = 'Text',
  optional = false,
): z.ZodString | z.ZodOptional<z.ZodString> {
  let schema = z
    .string()
    .max(maxLength, `${fieldName} cannot exceed ${maxLength} characters`)
    .regex(
      SAFE_TEXT_PATTERN,
      `${fieldName} contains invalid or unsafe characters (control characters, line separators, bidirectional overrides, and unpaired surrogates are blocked)`,
    );

  if (minLength > 0) {
    schema = schema.min(minLength, `${fieldName} cannot be empty`);
  }

  return optional ? schema.optional() : schema;
}

// Days per month (1-indexed via month - 1). February is treated as 28; leap
// years are accounted for explicitly below so we don't have to round-trip
// through `Date`, which has surprising behavior for years 0-99 (mapped to
// 1900-1999) and for Feb 29 seeded from a non-leap year.
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

function isValidDateInput(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] === undefined ? 0 : Number(match[4]);
  const minute = match[5] === undefined ? 0 : Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (month < 1 || month > 12) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const monthDays = DAYS_IN_MONTH[month - 1];
  if (monthDays === undefined) return false; // unreachable: month is 1-12
  const maxDay = month === 2 && isLeapYear(year) ? 29 : monthDays;
  if (day < 1 || day > maxDay) return false;

  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  return !Number.isNaN(new Date(normalized).getTime());
}

/**
 * Base validation schemas using factory functions
 */
export const SafeTextSchema = createSafeTextSchema(
  1,
  VALIDATION.MAX_TITLE_LENGTH,
);
// Subtask section markers must not appear as standalone lines in user-supplied
// notes — they would let an attacker forge or truncate the structured subtask
// section that lives in the same field.
const SUBTASK_MARKER_LINE_REGEX = /^---(?:END )?SUBTASKS---$/m;

export const SafeNoteSchema = createSafeTextSchema(
  0,
  VALIDATION.MAX_NOTE_LENGTH,
  'Note',
  true,
).refine(
  (value) => value === undefined || !SUBTASK_MARKER_LINE_REGEX.test(value),
  {
    message:
      'Note cannot contain a line that exactly matches the reserved subtask section markers (---SUBTASKS--- or ---END SUBTASKS---)',
  },
);
export const SafeListNameSchema = createSafeTextSchema(
  0,
  VALIDATION.MAX_LIST_NAME_LENGTH,
  'List name',
  true,
);
export const RequiredListNameSchema = createSafeTextSchema(
  1,
  VALIDATION.MAX_LIST_NAME_LENGTH,
  'List name',
);
export const SafeSearchSchema = createSafeTextSchema(
  0,
  VALIDATION.MAX_SEARCH_LENGTH,
  'Search term',
  true,
);

export const SafeDateSchema = z
  .string()
  .regex(
    DATE_PATTERN,
    "Date must be in format 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', or ISO 8601 (e.g., '2025-10-30T04:00:00Z')",
  )
  .refine(isValidDateInput, 'Date must be a real, parseable date/time')
  .optional();

/**
 * Creates a required date schema with validation
 */
const createRequiredDateSchema = (fieldName: string) =>
  z
    .string()
    .min(1, `${fieldName} is required`)
    .regex(
      DATE_PATTERN,
      `${fieldName} must be in format 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', or ISO 8601`,
    )
    .refine(
      isValidDateInput,
      `${fieldName} must be a real, parseable date/time`,
    );

/**
 * Validates a URL string against the project's URI policy.
 *
 * Accepts any valid URI so reminders can hold app-deep-link schemes such as
 * `obsidian://`, `shortcuts://`, `tel:`, and `mailto:` — EventKit itself
 * accepts any NSURL (issue #101). Schemes in {@link BLOCKED_URL_SCHEMES}
 * (file, javascript, data, …) are rejected unconditionally, and for the
 * host-based schemes in {@link HOST_BASED_URL_SCHEMES} (http/https) the
 * SSRF hostname blocklist still applies.
 *
 * @returns `true` if accepted, otherwise an error message describing why.
 */
function validateUrl(url: string): true | string {
  if (URL_FORBIDDEN_CHARS.test(url)) {
    return 'URL cannot contain whitespace or control characters';
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'URL must be a valid URI (RFC 3986)';
  }
  const scheme = parsed.protocol.toLowerCase();
  if (BLOCKED_URL_SCHEMES.has(scheme)) {
    return `URL scheme '${scheme}' is not allowed`;
  }
  if (
    HOST_BASED_URL_SCHEMES.has(scheme) &&
    isBlockedHostname(parsed.hostname)
  ) {
    return 'URL must not point to internal, private, or blocked addresses';
  }
  return true;
}

export const SafeUrlSchema = z
  .string()
  .max(
    VALIDATION.MAX_URL_LENGTH,
    `URL cannot exceed ${VALIDATION.MAX_URL_LENGTH} characters`,
  )
  .superRefine((url, ctx) => {
    const result = validateUrl(url);
    if (result !== true) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: result });
    }
  })
  .optional();

// Reusable schemas for common fields
const DueWithinEnum = z
  .enum(['today', 'tomorrow', 'this-week', 'overdue', 'no-date'])
  .optional();

const PriorityFilterEnum = z.enum(['high', 'medium', 'low', 'none']).optional();

const PriorityValueSchema = z
  .number()
  .int()
  .refine((val) => [0, 1, 5, 9].includes(val), {
    message: 'Priority must be 0 (none), 1 (high), 5 (medium), or 9 (low)',
  })
  .optional();

const AvailabilitySchema = z
  .enum(['not-supported', 'busy', 'free', 'tentative', 'unavailable'])
  .optional();

const SpanSchema = z.enum(['this-event', 'future-events']).optional();

/**
 * Tag schema for reminder tags.
 * Allows Unicode letters and numbers so non-Latin scripts (CJK, Cyrillic,
 * Arabic, etc.) work as tag names — Apple Reminders natively supports them.
 */
const TagSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^#?[\p{L}\p{N}_-]+$/u, {
    message: 'Tags can only contain letters, numbers, underscores, and hyphens',
  });

const TagArraySchema = z.array(TagSchema).optional();

/**
 * Subtask validation schemas
 * Subtask titles are stored as a single line inside a structured notes section,
 * so they must not contain newlines, tabs, or brace characters that would
 * collide with the `[ ] {id} title` line format.
 */
const SubtaskTitleSchema = createSafeTextSchema(
  1,
  VALIDATION.MAX_TITLE_LENGTH,
  'Subtask title',
).regex(
  /^[^\n\r\t{}]+$/,
  'Subtask title cannot contain newlines, tabs, or braces',
);

const SubtaskTitleArraySchema = z.array(SubtaskTitleSchema).optional();

/** Fields accepted by `event reminders create`. */
const BaseReminderFields = {
  title: SafeTextSchema,
  dueDate: SafeDateSchema,
  note: SafeNoteSchema,
  url: SafeUrlSchema,
  targetList: SafeListNameSchema,
  priority: PriorityValueSchema,
  tags: TagArraySchema,
  subtasks: SubtaskTitleArraySchema,
};

export const SafeIdSchema = z.string().min(1, 'ID cannot be empty');

/**
 * Tool-specific validation schemas
 */
export const CreateReminderSchema = z.object(BaseReminderFields);

export const ReadRemindersSchema = z.object({
  id: SafeIdSchema.optional(),
  filterList: SafeListNameSchema,
  showCompleted: z.boolean().optional().default(false),
  search: SafeSearchSchema,
  dueWithin: DueWithinEnum,
  filterPriority: PriorityFilterEnum,
  filterRecurring: z.boolean().optional(),
  filterLocationBased: z.boolean().optional(),
  filterTags: TagArraySchema,
});

/** Fields accepted by `event reminders update`. */
export const UpdateReminderSchema = z.object({
  id: SafeIdSchema,
  title: SafeTextSchema.optional(),
  startDate: SafeDateSchema,
  dueDate: SafeDateSchema,
  note: SafeNoteSchema,
  url: SafeUrlSchema,
  completed: z.boolean().optional(),
  targetList: SafeListNameSchema,
  priority: PriorityValueSchema,
  tags: TagArraySchema,
  addTags: TagArraySchema,
  removeTags: TagArraySchema,
});

export const DeleteReminderSchema = z.object({
  id: SafeIdSchema,
});

// Calendar event schemas. All-day events are inferred from the date format
// (bare `yyyy-MM-dd` without a time component).
export const CreateCalendarEventSchema = z.object({
  title: SafeTextSchema,
  startDate: createRequiredDateSchema('Start date'),
  endDate: createRequiredDateSchema('End date'),
  note: SafeNoteSchema,
  location: createSafeTextSchema(
    0,
    VALIDATION.MAX_LOCATION_LENGTH,
    'Location',
    true,
  ),
  targetCalendar: SafeListNameSchema,
});

export const ReadCalendarEventsSchema = z.object({
  id: SafeIdSchema.optional(),
  filterCalendar: SafeListNameSchema,
  search: SafeSearchSchema,
  availability: AvailabilitySchema,
  startDate: SafeDateSchema,
  endDate: SafeDateSchema,
});

export const UpdateCalendarEventSchema = z.object({
  id: SafeIdSchema,
  title: SafeTextSchema.optional(),
  startDate: SafeDateSchema,
  endDate: SafeDateSchema,
  note: SafeNoteSchema,
  location: createSafeTextSchema(
    0,
    VALIDATION.MAX_LOCATION_LENGTH,
    'Location',
    true,
  ),
});

export const DeleteCalendarEventSchema = z.object({
  id: SafeIdSchema,
  span: SpanSchema,
});

export const ReadCalendarsSchema = z
  .object({
    startDate: SafeDateSchema,
    endDate: SafeDateSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.startDate || !value.endDate) return;
    const start = Date.parse(
      value.startDate.includes(' ')
        ? value.startDate.replace(' ', 'T')
        : value.startDate,
    );
    const end = Date.parse(
      value.endDate.includes(' ')
        ? value.endDate.replace(' ', 'T')
        : value.endDate,
    );
    if (Number.isNaN(start) || Number.isNaN(end)) return; // shape errors surface elsewhere
    if (end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'endDate must be on or after startDate',
      });
    }
  });

export const CreateReminderListSchema = z.object({
  name: RequiredListNameSchema,
});

export const UpdateReminderListSchema = z.object({
  name: RequiredListNameSchema,
  newName: RequiredListNameSchema,
});

export const DeleteReminderListSchema = z.object({
  name: RequiredListNameSchema,
});

/**
 * Validation error wrapper for consistent error handling across the application
 * @extends Error
 * @class
 * @description Provides structured error information with field-level details for validation failures
 * @param {string} message - Human-readable error message
 * @param {Record<string, string[]>} [details] - Optional field-specific error details
 * @example
 * throw new ValidationError('Invalid input', {
 * title: ['Title is required', 'Title too long'],
 * dueDate: ['Invalid date format']
 * });
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Generic validation function with security error handling and detailed logging
 * @template T - Expected type after validation
 * @param {z.ZodSchema<T>} schema - Zod schema to validate against
 * @param {unknown} input - Input data to validate
 * @returns {T} Validated and parsed data
 * @throws {ValidationError} Detailed validation error with field-specific messages
 * @description
 * - Provides detailed field-level error messages
 * - Aggregates multiple validation errors into single error
 * - Includes path information for nested field validation
 * - Throws ValidationError for consistent error handling
 * @example
 * try {
 * const data = validateInput(CreateReminderSchema, input);
 * // data is now typed as CreateReminderData
 * } catch (error) {
 * if (error instanceof ValidationError) {
 * console.log(error.details); // Field-specific error messages
 * }
 * }
 */
export const validateInput = <T>(schema: z.ZodSchema<T>, input: unknown): T => {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');

      const errorDetails = error.errors.reduce<Record<string, string[]>>(
        (acc, err) => {
          const path = err.path.join('.');
          acc[path] = acc[path] ?? [];
          acc[path].push(err.message);
          return acc;
        },
        {},
      );

      throw new ValidationError(
        `Input validation failed: ${errorMessages}`,
        errorDetails,
      );
    }

    throw new ValidationError('Input validation failed: Unknown error');
  }
};

/**
 * Subtask-related schemas
 */
const SubtaskIdSchema = z
  .string()
  .min(1, 'Subtask ID is required')
  .regex(/^[a-f0-9]+$/, 'Subtask ID must be a valid hex string');

const SubtaskOrderSchema = z
  .array(SubtaskIdSchema)
  .min(1, 'Order array cannot be empty');

export const ReadSubtasksSchema = z.object({
  reminderId: SafeIdSchema,
});

export const CreateSubtaskSchema = z.object({
  reminderId: SafeIdSchema,
  title: SubtaskTitleSchema,
});

export const UpdateSubtaskSchema = z.object({
  reminderId: SafeIdSchema,
  subtaskId: SubtaskIdSchema,
  title: SubtaskTitleSchema.optional(),
  completed: z.boolean().optional(),
});

export const DeleteSubtaskSchema = z.object({
  reminderId: SafeIdSchema,
  subtaskId: SubtaskIdSchema,
});

export const ToggleSubtaskSchema = z.object({
  reminderId: SafeIdSchema,
  subtaskId: SubtaskIdSchema,
});

export const ReorderSubtasksSchema = z.object({
  reminderId: SafeIdSchema,
  order: SubtaskOrderSchema,
});

/**
 * Prompt argument validation schemas
 * These schemas validate user inputs for MCP prompt templates
 */

/**
 * Schema for daily-task-organizer prompt arguments
 */
export const DailyTaskOrganizerArgsSchema = z.object({
  "Today's focus": createSafeTextSchema(
    0,
    VALIDATION.MAX_TITLE_LENGTH,
    "Today's focus",
    true,
  ),
});

/**
 * Schema for smart-reminder-creator prompt arguments
 */
export const SmartReminderCreatorArgsSchema = z.object({
  'Task idea': createSafeTextSchema(
    0,
    VALIDATION.MAX_NOTE_LENGTH,
    'Task idea',
    true,
  ),
});

/**
 * Schema for reminder-review-assistant prompt arguments
 */
export const ReminderReviewAssistantArgsSchema = z.object({
  'Review focus': createSafeTextSchema(
    0,
    VALIDATION.MAX_TITLE_LENGTH,
    'Review focus',
    true,
  ),
});

/**
 * Schema for weekly-planning-workflow prompt arguments
 */
export const WeeklyPlanningWorkflowArgsSchema = z.object({
  'User ideas': createSafeTextSchema(
    0,
    VALIDATION.MAX_NOTE_LENGTH,
    'User ideas',
    true,
  ),
});
