/**
 * @fileoverview Comprehensive input validation schemas using Zod for security
 * @module validation/schemas
 * @description Security-focused validation with safe text patterns, URL validation,
 * and length limits to prevent injection attacks and malformed data
 */

import { z } from 'zod/v3';
import { VALIDATION } from '../utils/constants.js';

// Security patterns – allow printable Unicode text while blocking dangerous control and delimiter chars.
// Allows standard printable ASCII, extended Latin, CJK, plus newlines/tabs for notes.
// Blocks: control chars (0x00-0x1F except \n\r\t), DEL, dangerous delimiters, Unicode line separators
// This keeps Chinese/Unicode names working while remaining safe with AppleScript quoting.
const SAFE_TEXT_PATTERN = /^[\u0020-\u007E\u00A0-\uFFFF\n\r\t]*$/u;
// Support multiple date formats: YYYY-MM-DD, YYYY-MM-DD HH:mm:ss, or ISO 8601
// Basic validation - detailed parsing handled by Swift
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}.*$/;
// URL validation that blocks internal/private network addresses and localhost
// Prevents SSRF attacks while allowing legitimate external URLs
const URL_PATTERN =
  /^https?:\/\/(?!(?:127\.|192\.168\.|10\.|localhost|0\.0\.0\.0))[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*(?:\/[^\s<>"{}|\\^`[\]]*)?$/i;

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
      `${fieldName} contains invalid characters. Only alphanumeric, spaces, and basic punctuation allowed`,
    );

  if (minLength > 0) {
    schema = schema.min(minLength, `${fieldName} cannot be empty`);
  }

  return optional ? schema.optional() : schema;
}

/**
 * Base validation schemas using factory functions
 */
export const SafeTextSchema = createSafeTextSchema(
  1,
  VALIDATION.MAX_TITLE_LENGTH,
);
export const SafeNoteSchema = createSafeTextSchema(
  0,
  VALIDATION.MAX_NOTE_LENGTH,
  'Note',
  true,
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
  .optional();

/**
 * Creates a required date schema with validation
 */
const createRequiredDateSchema = (fieldName: string) =>
  z
    .string()
    .regex(
      DATE_PATTERN,
      `${fieldName} must be in format 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', or ISO 8601`,
    )
    .min(1, `${fieldName} is required`);

export const SafeUrlSchema = z
  .string()
  .regex(URL_PATTERN, 'URL must be a valid HTTP or HTTPS URL')
  .max(
    VALIDATION.MAX_URL_LENGTH,
    `URL cannot exceed ${VALIDATION.MAX_URL_LENGTH} characters`,
  )
  .optional();

// Reusable schemas for common fields
const DueWithinEnum = z
  .enum(['today', 'tomorrow', 'this-week', 'overdue', 'no-date'])
  .optional();

const PriorityFilterEnum = z.enum(['high', 'medium', 'low', 'none']).optional();

const PriorityValueSchema = z
  .number()
  .int()
  .refine((val) => [0, 1, 2, 3].includes(val), {
    message: 'Priority must be 0 (none), 1 (high), 2 (medium), or 3 (low)',
  })
  .optional();

/**
 * Recurrence rule schema for repeating reminders
 */
const RecurrenceRuleObjectSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().positive().default(1),
  endDate: SafeDateSchema,
  occurrenceCount: z.number().int().positive().optional(),
  daysOfWeek: z
    .array(z.number().int().min(1).max(7))
    .optional()
    .refine((arr: number[] | undefined) => !arr || arr.length <= 7, {
      message: 'daysOfWeek cannot have more than 7 entries',
    }),
  daysOfMonth: z
    .array(z.number().int().min(1).max(31))
    .optional()
    .refine((arr: number[] | undefined) => !arr || arr.length <= 31, {
      message: 'daysOfMonth cannot have more than 31 entries',
    }),
  monthsOfYear: z
    .array(z.number().int().min(1).max(12))
    .optional()
    .refine((arr: number[] | undefined) => !arr || arr.length <= 12, {
      message: 'monthsOfYear cannot have more than 12 entries',
    }),
});

const RecurrenceRuleSchema = RecurrenceRuleObjectSchema.optional();

const RecurrenceRulesSchema = z.array(RecurrenceRuleObjectSchema).optional();

/**
 * Location trigger schema for geofence-based reminders
 */
const LocationTriggerObjectSchema = z.object({
  title: createSafeTextSchema(1, VALIDATION.MAX_TITLE_LENGTH, 'Location title'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius: z.number().positive().default(100),
  proximity: z.enum(['enter', 'leave']),
});

const LocationTriggerSchema = LocationTriggerObjectSchema.optional();

const StructuredLocationSchema = z
  .object({
    title: createSafeTextSchema(
      1,
      VALIDATION.MAX_TITLE_LENGTH,
      'Location title',
    ),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radius: z.number().positive().optional(),
  })
  .optional();

const AlarmTypeSchema = z
  .enum(['display', 'audio', 'procedure', 'email'])
  .optional();

const AlarmSchema = z
  .object({
    relativeOffset: z.number().finite().optional(),
    absoluteDate: SafeDateSchema,
    locationTrigger: LocationTriggerObjectSchema.optional(),
    alarmType: AlarmTypeSchema,
  })
  .refine(
    (alarm) =>
      [alarm.relativeOffset, alarm.absoluteDate, alarm.locationTrigger].filter(
        (value) => value !== undefined,
      ).length === 1,
    {
      message:
        'Alarm must specify exactly one of relativeOffset, absoluteDate, or locationTrigger',
    },
  );

const AlarmArraySchema = z.array(AlarmSchema).optional();

const AvailabilitySchema = z
  .enum(['not-supported', 'busy', 'free', 'tentative', 'unavailable'])
  .optional();

const SpanSchema = z.enum(['this-event', 'future-events']).optional();

/**
 * Tag schema for reminder tags
 */
const TagSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^#?[a-zA-Z0-9_-]+$/, {
    message: 'Tags can only contain letters, numbers, underscores, and hyphens',
  });

const TagArraySchema = z.array(TagSchema).optional();

/**
 * Subtask validation schemas
 */
const SubtaskTitleSchema = createSafeTextSchema(
  1,
  VALIDATION.MAX_TITLE_LENGTH,
  'Subtask title',
);

const SubtaskTitleArraySchema = z.array(SubtaskTitleSchema).optional();

/**
 * Common field combinations for reusability
 */
const BaseReminderFields = {
  title: SafeTextSchema,
  startDate: SafeDateSchema,
  dueDate: SafeDateSchema,
  note: SafeNoteSchema,
  url: SafeUrlSchema,
  location: createSafeTextSchema(
    0,
    VALIDATION.MAX_LOCATION_LENGTH,
    'Location',
    true,
  ),
  targetList: SafeListNameSchema,
  priority: PriorityValueSchema,
  completed: z.boolean().optional(),
  alarms: AlarmArraySchema,
  clearAlarms: z.boolean().optional(),
  recurrenceRules: RecurrenceRulesSchema,
  recurrence: RecurrenceRuleSchema,
  locationTrigger: LocationTriggerSchema,
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

export const UpdateReminderSchema = z.object({
  id: SafeIdSchema,
  title: SafeTextSchema.optional(),
  startDate: SafeDateSchema,
  dueDate: SafeDateSchema,
  note: SafeNoteSchema,
  url: SafeUrlSchema,
  location: createSafeTextSchema(
    0,
    VALIDATION.MAX_LOCATION_LENGTH,
    'Location',
    true,
  ),
  completed: z.boolean().optional(),
  completionDate: SafeDateSchema,
  targetList: SafeListNameSchema,
  priority: PriorityValueSchema,
  alarms: AlarmArraySchema,
  clearAlarms: z.boolean().optional(),
  recurrenceRules: RecurrenceRulesSchema,
  recurrence: RecurrenceRuleSchema,
  clearRecurrence: z.boolean().optional(),
  locationTrigger: LocationTriggerSchema,
  clearLocationTrigger: z.boolean().optional(),
  tags: TagArraySchema,
  addTags: TagArraySchema,
  removeTags: TagArraySchema,
});

export const DeleteReminderSchema = z.object({
  id: SafeIdSchema,
});

// Calendar event schemas
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
  structuredLocation: StructuredLocationSchema,
  url: SafeUrlSchema,
  isAllDay: z.boolean().optional(),
  availability: AvailabilitySchema,
  alarms: AlarmArraySchema,
  recurrenceRules: RecurrenceRulesSchema,
  targetCalendar: SafeListNameSchema,
});

export const ReadCalendarEventsSchema = z.object({
  id: SafeIdSchema.optional(),
  filterCalendar: SafeListNameSchema,
  filterAccount: SafeListNameSchema,
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
  structuredLocation: StructuredLocationSchema.nullable(),
  url: SafeUrlSchema,
  isAllDay: z.boolean().optional(),
  availability: AvailabilitySchema,
  alarms: AlarmArraySchema,
  clearAlarms: z.boolean().optional(),
  recurrenceRules: RecurrenceRulesSchema,
  clearRecurrence: z.boolean().optional(),
  span: SpanSchema,
  targetCalendar: SafeListNameSchema,
});

export const DeleteCalendarEventSchema = z.object({
  id: SafeIdSchema,
  span: SpanSchema,
});

export const ReadCalendarsSchema = z.object({});

export const CreateReminderListSchema = z.object({
  name: RequiredListNameSchema,
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, {
      message: 'Color must be a valid hex code (e.g., "#FF5733")',
    })
    .optional(),
});

export const UpdateReminderListSchema = z
  .object({
    name: RequiredListNameSchema,
    newName: SafeListNameSchema,
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, {
        message: 'Color must be a valid hex code (e.g., "#FF5733")',
      })
      .optional(),
  })
  .refine((data) => data.newName || data.color, {
    message: 'At least one of newName or color must be provided',
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
