/**
 * types/index.ts
 * Type definitions for the Apple Reminders MCP server
 */

/**
 * Priority levels for reminders, matching `EKReminderPriority` raw values:
 * 0 = none, 1 = high, 5 = medium, 9 = low. Other integers in 1–9 fall in
 * between those buckets but are not produced by Apple's UI; the read path
 * still tolerates them via `PRIORITY_LABELS[priority] ?? 'unknown'`.
 */
export type ReminderPriority = 0 | 1 | 5 | 9;

/**
 * Priority label mapping for display
 */
export const PRIORITY_LABELS: Record<number, string> = {
  0: 'none',
  1: 'high',
  5: 'medium',
  9: 'low',
};

/**
 * Recurrence frequency types
 */
export type RecurrenceFrequency =
  | 'minutely'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly';

/**
 * Recurrence rule interface for repeating reminders
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number; // e.g., every 2 weeks
  endDate?: string;
  occurrenceCount?: number; // e.g., repeat 10 times
  daysOfWeek?: number[]; // 1 = Sunday, 7 = Saturday
  daysOfMonth?: number[]; // 1-31
  monthsOfYear?: number[]; // 1-12
}

/**
 * Location trigger proximity types
 */
export type LocationProximity = 'enter' | 'leave';

/**
 * Location trigger interface for geofence-based reminders
 */
export interface LocationTrigger {
  title: string; // Location name/title
  latitude: number;
  longitude: number;
  radius?: number; // Geofence radius in meters (default 100)
  proximity: LocationProximity; // Trigger on arrival or departure
}

/**
 * Structured location interface (EventKit EKStructuredLocation)
 */
export interface StructuredLocation {
  title: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
}

/**
 * Alarm interface (EventKit EKAlarm)
 * - Relative alarms use seconds offset from start/due dates (negative = before).
 * - Absolute alarms fire at a specific date/time.
 * - Location alarms use a structured location + proximity (geofence).
 * - alarmType is READ-ONLY: determined automatically by EventKit based on alarm properties.
 */
export interface Alarm {
  relativeOffset?: number;
  absoluteDate?: string;
  locationTrigger?: LocationTrigger;
  alarmType?: 'display' | 'audio' | 'procedure' | 'email';
}

/**
 * Subtask interface for checklist items within reminders
 */
export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

/**
 * Subtask progress info
 */
export interface SubtaskProgress {
  completed: number;
  total: number;
  percentage: number;
}

/**
 * Reminder item interface
 */
export interface Reminder {
  id: string;
  title: string;
  startDate?: string;
  dueDate?: string;
  completionDate?: string;
  notes?: string;
  url?: string; // Native URL field (currently limited by EventKit API)
  location?: string;
  timeZone?: string;
  creationDate?: string;
  lastModifiedDate?: string;
  externalId?: string;
  list: string;
  isCompleted: boolean;
  priority: number; // 0=none, 1=high, 5=medium, 9=low
  alarms?: Alarm[];
  recurrenceRules?: RecurrenceRule[];
  locationTrigger?: LocationTrigger;
  tags?: string[]; // Extracted from notes using [#tag] format
  subtasks?: Subtask[]; // Extracted from notes using ---SUBTASKS--- format
  subtaskProgress?: SubtaskProgress; // Computed progress info
}

/**
 * Reminder list interface
 */
export interface ReminderList {
  id: string;
  title: string;
  color?: string;
}

/**
 * Calendar event interface
 */
export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  calendar: string;
  notes?: string;
  location?: string;
  structuredLocation?: StructuredLocation;
  url?: string;
  isAllDay: boolean;
  timeZone?: string;
  availability?:
    | 'not-supported'
    | 'busy'
    | 'free'
    | 'tentative'
    | 'unavailable'
    | 'unknown';
  alarms?: Alarm[];
  recurrenceRules?: RecurrenceRule[];
  organizer?: { name?: string; url: string };
  attendees?: Array<{
    name?: string;
    url: string;
    status: string;
    role: string;
    type: string;
    isCurrentUser: boolean;
  }>;
  status?: string;
  isDetached?: boolean;
  occurrenceDate?: string;
  creationDate?: string;
  lastModifiedDate?: string;
  externalId?: string;
}

/**
 * Calendar interface
 */
export interface Calendar {
  id: string;
  title: string;
  // The vendored `event` CLI has no concept of EventKit accounts, so
  // `account` / `accountType` are dropped rather than kept as always-empty
  // fields. `eventCount` is set only when the caller scoped the listing to a
  // date range (see `findCalendars` in calendarRepository.ts).
  eventCount?: number;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  name: string;
  version: string;
}

/**
 * Shared type constants for better type safety and consistency
 */
export type ReminderAction = 'read' | 'create' | 'update' | 'delete';
export type ListAction = 'read' | 'create' | 'update' | 'delete';
export type CalendarAction = 'read' | 'create' | 'update' | 'delete';
export type CalendarsAction = 'read';
export type DueWithinOption =
  | 'today'
  | 'tomorrow'
  | 'this-week'
  | 'overdue'
  | 'no-date';

/**
 * Action constant arrays for enum validation
 */
export const REMINDER_ACTIONS: readonly ReminderAction[] = [
  'read',
  'create',
  'update',
  'delete',
] as const;

export const LIST_ACTIONS: readonly ListAction[] = [
  'read',
  'create',
  'update',
  'delete',
] as const;

export const CALENDAR_ACTIONS: readonly CalendarAction[] = [
  'read',
  'create',
  'update',
  'delete',
] as const;

export const DUE_WITHIN_OPTIONS: readonly DueWithinOption[] = [
  'today',
  'tomorrow',
  'this-week',
  'overdue',
  'no-date',
] as const;

/**
 * Base tool arguments interface
 */
interface BaseToolArgs {
  action: string;
}

/**
 * Tool argument types - keeping flexible for handler routing while maintaining type safety
 */
export interface RemindersToolArgs extends BaseToolArgs {
  action: ReminderAction;
  id?: string;
  // Read filters
  filterList?: string;
  showCompleted?: boolean;
  search?: string;
  dueWithin?: DueWithinOption;
  filterPriority?: 'high' | 'medium' | 'low' | 'none';
  filterRecurring?: boolean;
  filterLocationBased?: boolean;
  filterTags?: string[];
  // Write fields
  title?: string;
  newTitle?: string;
  // Read-only: start of the due-date window (action='read'); update: set the
  // start date on an existing reminder (the CLI cannot set it at create time).
  startDate?: string;
  dueDate?: string;
  note?: string;
  url?: string;
  completed?: boolean; // update only
  priority?: number; // 0=none, 1=high, 5=medium, 9=low
  // Tag / subtask payload (TS-managed in the notes field)
  tags?: string[];
  addTags?: string[];
  removeTags?: string[];
  subtasks?: string[];
  targetList?: string;
  endDate?: string; // read only: due-date window end
}

/**
 * Subtask action type
 */
export type SubtaskAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'toggle'
  | 'reorder';

/**
 * Tool arguments for subtask operations
 */
export interface SubtasksToolArgs extends BaseToolArgs {
  action: SubtaskAction;
  reminderId: string; // Parent reminder ID (required)
  subtaskId?: string; // Subtask ID (for update, delete, toggle)
  title?: string; // Subtask title (for create, update)
  completed?: boolean; // Completion status (for update)
  order?: string[]; // Array of subtask IDs in desired order (for reorder)
}

export interface ListsToolArgs extends BaseToolArgs {
  action: ListAction;
  name?: string;
  newName?: string;
}

export interface CalendarToolArgs extends BaseToolArgs {
  action: CalendarAction;
  id?: string;
  // Read filters
  filterCalendar?: string;
  search?: string;
  availability?:
    | 'not-supported'
    | 'busy'
    | 'free'
    | 'tentative'
    | 'unavailable';
  startDate?: string;
  endDate?: string;
  // Write fields
  title?: string;
  note?: string;
  location?: string;
  timezone?: string;
  span?: 'this-event' | 'future-events'; // delete only
  targetCalendar?: string; // create only
}

export interface CalendarsToolArgs extends BaseToolArgs {
  action: CalendarsAction;
  startDate?: string;
  endDate?: string;
}

/**
 * Prompt-related type exports for consumers that need to interact with the
 * structured MCP prompt registry.
 */
export type {
  DailyTaskOrganizerArgs,
  PromptArgsByName,
  PromptArgumentDefinition,
  PromptMessage,
  PromptMessageContent,
  PromptMetadata,
  PromptName,
  PromptResponse,
  PromptTemplate,
  ReminderReviewAssistantArgs,
  SmartReminderCreatorArgs,
  WeeklyPlanningWorkflowArgs,
} from './prompts.js';
