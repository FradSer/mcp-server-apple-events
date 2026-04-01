/**
 * constants.ts
 * Centralized constants and configuration values to eliminate magic numbers
 */

/**
 * File system and path constants
 */
export const FILE_SYSTEM = {
  /** Maximum directory traversal depth when searching for project root */
  MAX_DIRECTORY_SEARCH_DEPTH: 10,

  /** Package.json filename for project root detection */
  PACKAGE_JSON_FILENAME: 'package.json',

  /** Swift binary filename */
  SWIFT_BINARY_NAME: 'EventKitCLI',
} as const;

/**
 * Validation and security constants
 */
export const VALIDATION = {
  /** Maximum lengths for different text fields */
  MAX_TITLE_LENGTH: 200,
  MAX_NOTE_LENGTH: 20000,
  MAX_LIST_NAME_LENGTH: 100,
  MAX_SEARCH_LENGTH: 100,
  MAX_URL_LENGTH: 500,
  MAX_LOCATION_LENGTH: 200,
} as const;

/**
 * Tool names for MCP server operations
 */
export const TOOLS = {
  /** Reminder tasks management tool */
  REMINDERS_TASKS: 'reminders_tasks',
  /** Reminder lists management tool */
  REMINDERS_LISTS: 'reminders_lists',
  /** Reminder subtasks management tool */
  REMINDERS_SUBTASKS: 'reminders_subtasks',
  /** Calendar events management tool */
  CALENDAR_EVENTS: 'calendar_events',
  /** Calendar collections management tool */
  CALENDAR_CALENDARS: 'calendar_calendars',
} as const;

/**
 * Time and date constants for consistent time-based logic
 */
export const TIME = {
  /** Working hours boundaries */
  WORKING_HOURS_START: 9,
  WORKING_HOURS_END: 18,

  /** Time of day boundaries for categorization */
  MORNING_START: 5,
  NOON: 12,
  AFTERNOON_END: 17,
  EVENING_START: 17,
  NIGHT_START: 21,

  /** Default time suggestions */
  LATER_TODAY_HOURS: 4,
  END_OF_WEEK_HOUR: 17,
  DEFAULT_MORNING_HOUR: 9,

  /** Day of week constants (0 = Sunday, 6 = Saturday) */
  SUNDAY: 0,
  FRIDAY: 5,
  SATURDAY: 6,
} as const;

/**
 * Error message templates
 */
export const MESSAGES = {
  /** Error messages */
  ERROR: {
    INPUT_VALIDATION_FAILED: (details: string) =>
      `Input validation failed: ${details}`,

    UNKNOWN_TOOL: (name: string) => `Unknown tool: ${name}`,

    UNKNOWN_ACTION: (tool: string, action: string) =>
      `Unknown ${tool} action: ${action}`,

    SYSTEM_ERROR: (operation: string) =>
      `Failed to ${operation}: System error occurred`,
  },
} as const;
