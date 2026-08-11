/**
 * tools/definitions.ts
 * MCP tool definitions for the Apple Reminders / Calendar server.
 *
 * The schema is the cross-action property union for each tool; the per-action
 * validator (src/validation/schemas.ts) narrows the accepted fields.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  CALENDAR_ACTIONS,
  DUE_WITHIN_OPTIONS,
  LIST_ACTIONS,
  REMINDER_ACTIONS,
} from '../types/index.js';

export const TOOLS: Tool[] = [
  {
    name: 'reminders_tasks',
    description:
      'Manages reminder tasks. Supports reading, creating, updating, and deleting reminders. Alarms, recurrence rules, and location-based triggers are read-only via this tool; configure them in Reminders.app.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: REMINDER_ACTIONS,
          description: 'The operation to perform.',
        },
        // ID-based operations
        id: {
          type: 'string',
          description:
            'The unique identifier of the reminder (REQUIRED for update, delete; optional for read to get single reminder).',
        },
        // Creation/Update properties
        title: {
          type: 'string',
          description:
            'The title of the reminder (REQUIRED for create, optional for update).',
        },
        dueDate: {
          type: 'string',
          description:
            "Due date. RECOMMENDED format: 'YYYY-MM-DD HH:mm:ss' (local time without timezone, e.g., '2025-11-04 18:00:00'). Also supports: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss', or ISO 8601 with timezone (e.g., '2025-10-30T04:00:00Z'). When no timezone is specified, the time is interpreted as local time.",
        },
        note: {
          type: 'string',
          description: 'Additional notes for the reminder.',
        },
        url: {
          type: 'string',
          description: 'A URL to associate with the reminder.',
          format: 'uri',
        },
        completed: {
          type: 'boolean',
          description:
            'Mark the reminder as completed/uncompleted (update only).',
        },
        priority: {
          type: 'integer',
          enum: [0, 1, 5, 9],
          description:
            'Priority level: 0=none, 1=high, 5=medium, 9=low (for create/update).',
        },
        targetList: {
          type: 'string',
          description: 'The name of the list for create or update operations.',
        },
        // Read filters
        filterList: {
          type: 'string',
          description: 'Filter reminders by a specific list name.',
        },
        showCompleted: {
          type: 'boolean',
          description: 'Include completed reminders in the results.',
          default: false,
        },
        search: {
          type: 'string',
          description:
            'A search term to filter reminders by title or notes (applied in TS after fetch).',
        },
        dueWithin: {
          type: 'string',
          enum: DUE_WITHIN_OPTIONS,
          description:
            'Filter reminders by a due date range (applied in TS after fetch).',
        },
        startDate: {
          type: 'string',
          description:
            "Start date. When action='update': sets the reminder's start date (the CLI cannot set it at create time) — format 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', or ISO 8601. When action='read': start of the due-date window, passed to the CLI as `--start` (start day inclusive). For read, only the date part is used — any time/zone component is truncated to the date prefix, so a window is resolved at day granularity. If only one of startDate/endDate is supplied for read, the other is filled in as a 14-day window.",
        },
        endDate: {
          type: 'string',
          description:
            "End of the due-date window (READ-only, action='read'). Passed to the CLI as `--end`; the end day is exclusive. Only the date part is used — any time/zone component is truncated to the date prefix (day granularity). If only one of startDate/endDate is supplied, the other is filled in as a 14-day window.",
        },
        filterPriority: {
          type: 'string',
          enum: ['high', 'medium', 'low', 'none'],
          description: 'Filter reminders by priority level.',
        },
        filterRecurring: {
          type: 'boolean',
          description: 'Filter to only show recurring reminders when true.',
        },
        filterLocationBased: {
          type: 'boolean',
          description:
            'Filter to only show location-based reminders when true.',
        },
        // Tag filtering
        filterTags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter reminders by tags (must have ALL specified tags). Example: ["work", "urgent"]',
        },
        // Tag properties for create/update
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tags to set on the reminder (for create). Replaces any existing tags. Example: ["work", "urgent"]',
        },
        addTags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tags to add to the reminder (for update). Merges with existing tags. Example: ["followup"]',
        },
        removeTags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tags to remove from the reminder (for update). Example: ["urgent"]',
        },
        // Subtask properties for create
        subtasks: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Initial subtasks to create with the reminder (for create action). Provide an array of subtask titles. Example: ["Buy milk", "Get eggs", "Pick up bread"]',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'reminders_lists',
    description:
      'Manages reminder lists. Supports reading, creating, updating, and deleting reminder lists.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: LIST_ACTIONS,
          description: 'The operation to perform on a list.',
        },
        name: {
          type: 'string',
          description:
            'The current name of the list (for update, delete) or the name of the new list (for create).',
        },
        newName: {
          type: 'string',
          description: 'The new name for the list (for update).',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'calendar_events',
    description:
      'Manages calendar events (time blocks). Supports reading, creating, updating, and deleting events. URL, structured-location, all-day toggle, availability, alarms, and recurrence rules are read-only via this tool; configure them in Calendar.app. All-day events are inferred from the date format ("YYYY-MM-DD" without a time component).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: CALENDAR_ACTIONS,
          description: 'The operation to perform.',
        },
        // ID-based operations
        id: {
          type: 'string',
          description:
            'The unique identifier of the event (REQUIRED for update, delete; optional for read to get single event).',
        },
        // Creation/Update properties
        title: {
          type: 'string',
          description:
            'The title of the event (REQUIRED for create, optional for update).',
        },
        startDate: {
          type: 'string',
          description:
            "Start date and time. RECOMMENDED format: 'YYYY-MM-DD HH:mm:ss' (local time, e.g., '2025-11-04 09:00:00'). Use 'YYYY-MM-DD' (no time) for all-day events. Also supports 'YYYY-MM-DDTHH:mm:ss' or ISO 8601 with timezone. For action='read': if omitted and endDate is omitted, defaults to today; if only endDate is provided, startDate defaults to endDate - 14 days.",
        },
        endDate: {
          type: 'string',
          description:
            "End date and time. RECOMMENDED format: 'YYYY-MM-DD HH:mm:ss' (local time). Use 'YYYY-MM-DD' (no time) for all-day events. Also supports 'YYYY-MM-DDTHH:mm:ss' or ISO 8601 with timezone. For action='read': if omitted and startDate is omitted, defaults to today + 14 days; if only startDate is provided, endDate defaults to startDate + 14 days.",
        },
        note: {
          type: 'string',
          description: 'Additional notes for the event.',
        },
        location: {
          type: 'string',
          description: 'Location text for the event.',
        },
        timezone: {
          type: 'string',
          description:
            "IANA timezone identifier for a timed event (e.g., 'America/New_York', 'Asia/Shanghai'). Timed events' start and end times are interpreted in this timezone. All-day events ignore this option.",
        },
        availability: {
          type: 'string',
          enum: ['not-supported', 'busy', 'free', 'tentative', 'unavailable'],
          description:
            'READ-ONLY filter: narrow read results by event availability. Cannot be set via create/update; configure in Calendar.app.',
        },
        span: {
          type: 'string',
          enum: ['this-event', 'future-events'],
          description:
            'Scope for changes to recurring events: this-event or future-events.',
        },
        targetCalendar: {
          type: 'string',
          description:
            'The name of the calendar for the create action. Events cannot be moved across calendars via update — delete and recreate instead.',
        },
        // Read filters
        filterCalendar: {
          type: 'string',
          description: 'Filter events by a specific calendar name.',
        },
        search: {
          type: 'string',
          description:
            'A search term to filter events by title, notes, or location (applied in TS after fetch).',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'calendar_calendars',
    description:
      'Reads calendar collections. Use to inspect available calendars before creating or updating events. Optional date range filters return only calendars with events in that range.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read'],
          description: 'The operation to perform on calendars.',
        },
        startDate: {
          type: 'string',
          description:
            "Optional range start for scoped calendar discovery. Format: 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', or ISO 8601. If only one of startDate/endDate is supplied, the other is filled in as a 14-day window from the bound that was given.",
        },
        endDate: {
          type: 'string',
          description:
            'Optional range end for scoped calendar discovery. When used with startDate, only calendars with at least one event in the range are returned, each annotated with the in-range event count (recurring events count as one per instance). endDate must be on or after startDate.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'reminders_subtasks',
    description:
      'Manages subtasks/checklists within reminders. Subtasks are stored in the notes field and visible in the native Reminders app. Use this to create checklist items for a reminder.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'create', 'update', 'delete', 'toggle', 'reorder'],
          description:
            'The operation to perform: read (list subtasks), create (add new), update (modify), delete (remove), toggle (flip completion), reorder (change order).',
        },
        reminderId: {
          type: 'string',
          description:
            'The unique identifier of the parent reminder (REQUIRED for all operations).',
        },
        subtaskId: {
          type: 'string',
          description:
            'The unique identifier of the subtask (REQUIRED for update, delete, toggle).',
        },
        title: {
          type: 'string',
          description:
            'The title of the subtask (REQUIRED for create, optional for update).',
        },
        completed: {
          type: 'boolean',
          description: 'The completion status of the subtask (for update).',
        },
        order: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Array of subtask IDs in desired order (REQUIRED for reorder). Must include all subtask IDs.',
        },
      },
      required: ['action', 'reminderId'],
    },
  },
];
