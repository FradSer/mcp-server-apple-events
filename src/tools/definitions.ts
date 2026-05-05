/**
 * tools/definitions.ts
 * MCP tool definitions for Apple Reminders server, adhering to standard JSON Schema.
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
      'Manages reminder tasks. Supports reading, creating, updating, and deleting reminders.',
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
        startDate: {
          type: 'string',
          description:
            "Start date. RECOMMENDED format: 'YYYY-MM-DD HH:mm:ss' (local time without timezone). Also supports 'YYYY-MM-DD' and ISO 8601 with timezone.",
        },
        dueDate: {
          type: 'string',
          description:
            "Due date. RECOMMENDED format: 'YYYY-MM-DD HH:mm:ss' (local time without timezone, e.g., '2025-11-04 18:00:00'). Also supports: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss', or ISO 8601 with timezone (e.g., '2025-10-30T04:00:00Z'). When no timezone is specified, the time is interpreted as local time.",
        },
        completionDate: {
          type: 'string',
          description:
            'Completion date/time (for update). When provided, sets the completion date of the reminder.',
        },
        note: {
          type: 'string',
          description: 'Additional notes for the reminder.',
        },
        location: {
          type: 'string',
          description:
            'Location text for the reminder (EKCalendarItem.location). Not the same as a location-based trigger.',
        },
        url: {
          type: 'string',
          description: 'A URL to associate with the reminder.',
          format: 'uri',
        },
        completed: {
          type: 'boolean',
          description: 'The completion status of the reminder (for update).',
        },
        priority: {
          type: 'integer',
          enum: [0, 1, 5, 9],
          description:
            'Priority level: 0=none, 1=high, 5=medium, 9=low (for create/update).',
        },
        alarms: {
          type: 'array',
          description:
            'Alarms for the reminder (EKCalendarItem.alarms). Each alarm must specify exactly one of relativeOffset (seconds), absoluteDate, or locationTrigger.',
          items: {
            type: 'object',
            properties: {
              relativeOffset: {
                type: 'number',
                description:
                  'Seconds offset for a relative alarm (negative = before due/start). Example: -900 for 15 minutes before.',
              },
              absoluteDate: {
                type: 'string',
                description:
                  'Absolute trigger date/time for the alarm. Supports the same formats as dueDate.',
              },
              locationTrigger: {
                type: 'object',
                description:
                  'Location-based (geofence) alarm. Equivalent to setting EKAlarm.structuredLocation + proximity.',
                properties: {
                  title: {
                    type: 'string',
                    description:
                      'Location name/title (e.g., "Home", "Office").',
                  },
                  latitude: {
                    type: 'number',
                    description: 'Latitude coordinate of the location.',
                  },
                  longitude: {
                    type: 'number',
                    description: 'Longitude coordinate of the location.',
                  },
                  radius: {
                    type: 'number',
                    description: 'Geofence radius in meters (default 100).',
                    default: 100,
                  },
                  proximity: {
                    type: 'string',
                    enum: ['enter', 'leave'],
                    description:
                      'When to trigger: "enter" fires when arriving, "leave" fires when departing.',
                  },
                },
                required: ['title', 'latitude', 'longitude', 'proximity'],
              },
              alarmType: {
                type: 'string',
                enum: ['display', 'audio', 'procedure', 'email'],
                description:
                  'READ-ONLY: Alarm presentation type (EKAlarm.type). Determined automatically by EventKit: "display" shows notification, "audio" plays sound, "procedure" opens URL, "email" sends email. Cannot be set manually.',
              },
            },
          },
        },
        clearAlarms: {
          type: 'boolean',
          description: 'Set to true to remove all alarms from the reminder.',
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
          description: 'A search term to filter reminders by title or notes.',
        },
        dueWithin: {
          type: 'string',
          enum: DUE_WITHIN_OPTIONS,
          description: 'Filter reminders by a due date range.',
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
        // Recurrence properties for create/update
        recurrence: {
          type: 'object',
          description:
            'Recurrence rule for repeating reminders. Set to create/update recurring reminders.',
          properties: {
            frequency: {
              type: 'string',
              enum: [
                'minutely',
                'hourly',
                'daily',
                'weekly',
                'monthly',
                'yearly',
              ],
              description: 'How often the reminder repeats.',
            },
            interval: {
              type: 'integer',
              description:
                'Interval between occurrences (e.g., 2 for every 2 weeks). Defaults to 1.',
              default: 1,
            },
            endDate: {
              type: 'string',
              description:
                'When the recurrence ends (YYYY-MM-DD format). Optional.',
            },
            occurrenceCount: {
              type: 'integer',
              description:
                'Number of times to repeat (e.g., 10 for repeat 10 times). Optional.',
            },
            daysOfWeek: {
              type: 'array',
              items: { type: 'integer' },
              description:
                'Days of week for weekly recurrence (1=Sunday, 7=Saturday). Optional.',
            },
            daysOfMonth: {
              type: 'array',
              items: { type: 'integer' },
              description:
                'Days of month for monthly recurrence (1-31). Optional.',
            },
            monthsOfYear: {
              type: 'array',
              items: { type: 'integer' },
              description: 'Months for yearly recurrence (1-12). Optional.',
            },
          },
          required: ['frequency'],
        },
        recurrenceRules: {
          type: 'array',
          description:
            'Recurrence rules for repeating reminders (EKCalendarItem.recurrenceRules).',
          items: {
            type: 'object',
            properties: {
              frequency: {
                type: 'string',
                enum: [
                  'minutely',
                  'hourly',
                  'daily',
                  'weekly',
                  'monthly',
                  'yearly',
                ],
                description: 'How often the reminder repeats.',
              },
              interval: {
                type: 'integer',
                description:
                  'Interval between occurrences (e.g., 2 for every 2 weeks). Defaults to 1.',
                default: 1,
              },
              endDate: {
                type: 'string',
                description:
                  'When the recurrence ends (YYYY-MM-DD format). Optional.',
              },
              occurrenceCount: {
                type: 'integer',
                description:
                  'Number of times to repeat (e.g., 10 for repeat 10 times). Optional.',
              },
              daysOfWeek: {
                type: 'array',
                items: { type: 'integer' },
                description:
                  'Days of week for weekly recurrence (1=Sunday, 7=Saturday). Optional.',
              },
              daysOfMonth: {
                type: 'array',
                items: { type: 'integer' },
                description:
                  'Days of month for monthly recurrence (1-31). Optional.',
              },
              monthsOfYear: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Months for yearly recurrence (1-12). Optional.',
              },
            },
            required: ['frequency'],
          },
        },
        clearRecurrence: {
          type: 'boolean',
          description:
            'Set to true to remove recurrence from an existing reminder (for update).',
        },
        filterLocationBased: {
          type: 'boolean',
          description:
            'Filter to only show location-based reminders when true.',
        },
        // Location trigger properties for create/update
        locationTrigger: {
          type: 'object',
          description:
            'Location trigger for geofence-based reminders. Reminder will fire when entering or leaving the specified location.',
          properties: {
            title: {
              type: 'string',
              description:
                'Location name/title (e.g., "Home", "Office", "Grocery Store").',
            },
            latitude: {
              type: 'number',
              description: 'Latitude coordinate of the location.',
            },
            longitude: {
              type: 'number',
              description: 'Longitude coordinate of the location.',
            },
            radius: {
              type: 'number',
              description:
                'Geofence radius in meters (default 100). Determines how close you need to be to trigger.',
              default: 100,
            },
            proximity: {
              type: 'string',
              enum: ['enter', 'leave'],
              description:
                'When to trigger: "enter" fires when arriving, "leave" fires when departing.',
            },
          },
          required: ['title', 'latitude', 'longitude', 'proximity'],
        },
        clearLocationTrigger: {
          type: 'boolean',
          description:
            'Set to true to remove location trigger from an existing reminder (for update).',
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
        color: {
          type: 'string',
          description:
            'The hex color code for the list (for create/update). Example: "#FF5733".',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'calendar_events',
    description:
      'Manages calendar events (time blocks). Supports reading, creating, updating, and deleting calendar events.',
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
            "Start date and time. RECOMMENDED format: 'YYYY-MM-DD HH:mm:ss' (local time without timezone, e.g., '2025-11-04 09:00:00'). Also supports: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss', or ISO 8601 with timezone. When no timezone is specified, the time is interpreted as local time. For action='read': if omitted and endDate is omitted, defaults to today; if only endDate is provided, startDate defaults to endDate - 14 days.",
        },
        endDate: {
          type: 'string',
          description:
            "End date and time. RECOMMENDED format: 'YYYY-MM-DD HH:mm:ss' (local time without timezone, e.g., '2025-11-04 10:00:00'). Also supports: 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss', or ISO 8601 with timezone. When no timezone is specified, the time is interpreted as local time. For action='read': if omitted and startDate is omitted, defaults to today + 14 days; if only startDate is provided, endDate defaults to startDate + 14 days.",
        },
        note: {
          type: 'string',
          description: 'Additional notes for the event.',
        },
        location: {
          type: 'string',
          description: 'Location for the event.',
        },
        structuredLocation: {
          type: 'object',
          description:
            'Structured location for the event (EKEvent.structuredLocation). If provided, title is required.',
          properties: {
            title: {
              type: 'string',
              description: 'Location name/title.',
            },
            latitude: {
              type: 'number',
              description: 'Latitude coordinate of the location.',
            },
            longitude: {
              type: 'number',
              description: 'Longitude coordinate of the location.',
            },
            radius: {
              type: 'number',
              description: 'Optional radius in meters.',
            },
          },
          required: ['title'],
        },
        url: {
          type: 'string',
          description: 'A URL to associate with the event.',
          format: 'uri',
        },
        availability: {
          type: 'string',
          enum: ['not-supported', 'busy', 'free', 'tentative', 'unavailable'],
          description: 'Event availability (EKEvent.availability).',
        },
        isAllDay: {
          type: 'boolean',
          description: 'Whether the event is an all-day event.',
        },
        alarms: {
          type: 'array',
          description:
            'Alarms for the event (EKCalendarItem.alarms). Each alarm must specify exactly one of relativeOffset (seconds), absoluteDate, or locationTrigger.',
          items: {
            type: 'object',
            properties: {
              relativeOffset: {
                type: 'number',
                description:
                  'Seconds offset for a relative alarm (negative = before start). Example: -1800 for 30 minutes before.',
              },
              absoluteDate: {
                type: 'string',
                description:
                  'Absolute trigger date/time for the alarm. Supports the same formats as startDate.',
              },
              locationTrigger: {
                type: 'object',
                description:
                  'Location-based (geofence) alarm. Equivalent to setting EKAlarm.structuredLocation + proximity.',
                properties: {
                  title: {
                    type: 'string',
                    description:
                      'Location name/title (e.g., "Home", "Office").',
                  },
                  latitude: {
                    type: 'number',
                    description: 'Latitude coordinate of the location.',
                  },
                  longitude: {
                    type: 'number',
                    description: 'Longitude coordinate of the location.',
                  },
                  radius: {
                    type: 'number',
                    description: 'Geofence radius in meters (default 100).',
                    default: 100,
                  },
                  proximity: {
                    type: 'string',
                    enum: ['enter', 'leave'],
                    description:
                      'When to trigger: "enter" fires when arriving, "leave" fires when departing.',
                  },
                },
                required: ['title', 'latitude', 'longitude', 'proximity'],
              },
              alarmType: {
                type: 'string',
                enum: ['display', 'audio', 'procedure', 'email'],
                description:
                  'READ-ONLY: Alarm presentation type (EKAlarm.type). Determined automatically by EventKit: "display" shows notification, "audio" plays sound, "procedure" opens URL, "email" sends email. Cannot be set manually.',
              },
            },
          },
        },
        clearAlarms: {
          type: 'boolean',
          description: 'Set to true to remove all alarms from the event.',
        },
        recurrenceRules: {
          type: 'array',
          description:
            'Recurrence rules for repeating events (EKCalendarItem.recurrenceRules).',
          items: {
            type: 'object',
            properties: {
              frequency: {
                type: 'string',
                enum: [
                  'minutely',
                  'hourly',
                  'daily',
                  'weekly',
                  'monthly',
                  'yearly',
                ],
                description: 'How often the event repeats.',
              },
              interval: {
                type: 'integer',
                description:
                  'Interval between occurrences (e.g., 2 for every 2 weeks). Defaults to 1.',
                default: 1,
              },
              endDate: {
                type: 'string',
                description:
                  'When the recurrence ends (YYYY-MM-DD format). Optional.',
              },
              occurrenceCount: {
                type: 'integer',
                description:
                  'Number of times to repeat (e.g., 10 for repeat 10 times). Optional.',
              },
              daysOfWeek: {
                type: 'array',
                items: { type: 'integer' },
                description:
                  'Days of week for weekly recurrence (1=Sunday, 7=Saturday). Optional.',
              },
              daysOfMonth: {
                type: 'array',
                items: { type: 'integer' },
                description:
                  'Days of month for monthly recurrence (1-31). Optional.',
              },
              monthsOfYear: {
                type: 'array',
                items: { type: 'integer' },
                description: 'Months for yearly recurrence (1-12). Optional.',
              },
            },
            required: ['frequency'],
          },
        },
        clearRecurrence: {
          type: 'boolean',
          description: 'Set to true to remove recurrence rules from the event.',
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
            'The name of the calendar for create or update operations.',
        },
        // Read filters
        filterCalendar: {
          type: 'string',
          description: 'Filter events by a specific calendar name.',
        },
        filterAccount: {
          type: 'string',
          description:
            'Filter events by account name (e.g., "Google", "Exchange"). Use calendar_calendars to see available accounts.',
        },
        search: {
          type: 'string',
          description:
            'A search term to filter events by title, notes, or location.',
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
            "Optional range start for scoped calendar discovery. Format: 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', or ISO 8601.",
        },
        endDate: {
          type: 'string',
          description:
            'Optional range end for scoped calendar discovery. When used with startDate, only calendars with events in the range are returned.',
        },
        filterAccount: {
          type: 'string',
          description:
            'Filter calendars by account name (e.g., "Google", "Exchange").',
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
