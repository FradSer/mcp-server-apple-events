/**
 * repository.ts
 * Shared type definitions for repository layer JSON interfaces
 */

/**
 * Recurrence rule JSON interface matching EventKitCLI output
 */
export interface RecurrenceRuleJSON {
  frequency: 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number; // Defaults to 1 if not provided
  endDate?: string | null;
  occurrenceCount?: number | null;
  daysOfWeek?: number[] | null; // 1 = Sunday, 7 = Saturday
  daysOfMonth?: number[] | null; // 1-31
  monthsOfYear?: number[] | null; // 1-12
}

/**
 * Location trigger JSON interface matching EventKitCLI output
 */
export interface LocationTriggerJSON {
  title: string; // Location name/title
  latitude: number;
  longitude: number;
  radius?: number; // Geofence radius in meters, defaults to 100
  proximity: 'enter' | 'leave' | 'none';
}

export interface StructuredLocationJSON {
  title: string;
  latitude?: number | null;
  longitude?: number | null;
  radius?: number | null;
}

export interface AlarmJSON {
  relativeOffset?: number | null;
  absoluteDate?: string | null;
  locationTrigger?: LocationTriggerJSON | null;
  alarmType?: string | null;
}

export interface ParticipantJSON {
  name?: string | null;
  url: string;
  status?: string | null;
  role?: string | null;
  type?: string | null;
  isCurrentUser?: boolean | null;
}

/**
 * JSON interfaces matching the output from EventKitCLI
 */

export interface ReminderJSON {
  id: string;
  title: string;
  isCompleted: boolean;
  list: string;
  notes: string | null;
  url: string | null;
  location?: string | null;
  timeZone?: string | null;
  dueDate: string | null;
  startDate?: string | null;
  completionDate?: string | null;
  creationDate?: string | null;
  lastModifiedDate?: string | null;
  externalId?: string | null;
  priority: number;
  alarms?: AlarmJSON[] | null;
  recurrenceRules?: RecurrenceRuleJSON[] | null;
  locationTrigger: LocationTriggerJSON | null;
}

export interface ListJSON {
  id: string;
  title: string;
  color?: string | null;
}

export interface EventJSON {
  id: string;
  title: string;
  calendar: string;
  calendarId: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  location: string | null;
  structuredLocation?: StructuredLocationJSON | null;
  url: string | null;
  isAllDay: boolean;
  availability?: string | null;
  alarms?: AlarmJSON[] | null;
  recurrenceRules?: RecurrenceRuleJSON[] | null;
  organizer?: ParticipantJSON | null;
  attendees?: ParticipantJSON[] | null;
  status?: string | null;
  isDetached?: boolean | null;
  occurrenceDate?: string | null;
  creationDate?: string | null;
  lastModifiedDate?: string | null;
  externalId?: string | null;
}

export interface CalendarJSON {
  id: string;
  title: string;
  account: string;
  accountType: string;
}

/**
 * Read result interfaces
 */

export interface ReminderReadResult {
  lists: ListJSON[];
  reminders: ReminderJSON[];
}

export interface EventsReadResult {
  calendars: CalendarJSON[];
  events: EventJSON[];
}

/**
 * Data interfaces for repository methods
 */

export interface CreateReminderData {
  title: string;
  list?: string;
  notes?: string;
  url?: string;
  location?: string;
  startDate?: string;
  dueDate?: string;
  priority?: number;
  isCompleted?: boolean;
  completionDate?: string;
  alarms?: AlarmJSON[];
  recurrenceRules?: RecurrenceRuleJSON[];
  locationTrigger?: LocationTriggerJSON;
}

export interface UpdateReminderData {
  id: string;
  newTitle?: string;
  list?: string;
  notes?: string;
  url?: string;
  location?: string;
  isCompleted?: boolean;
  completionDate?: string;
  startDate?: string;
  dueDate?: string;
  priority?: number;
  alarms?: AlarmJSON[];
  clearAlarms?: boolean;
  recurrenceRules?: RecurrenceRuleJSON[];
  clearRecurrence?: boolean;
  locationTrigger?: LocationTriggerJSON;
  clearLocationTrigger?: boolean;
}

export interface CreateEventData {
  title: string;
  startDate: string;
  endDate: string;
  calendar?: string;
  notes?: string;
  location?: string;
  structuredLocation?: StructuredLocationJSON;
  url?: string;
  isAllDay?: boolean;
  availability?: string;
  alarms?: AlarmJSON[];
  recurrenceRules?: RecurrenceRuleJSON[];
}

export interface UpdateEventData {
  id: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  calendar?: string;
  notes?: string;
  location?: string;
  structuredLocation?: StructuredLocationJSON | null;
  url?: string;
  isAllDay?: boolean;
  availability?: string;
  alarms?: AlarmJSON[];
  clearAlarms?: boolean;
  recurrenceRules?: RecurrenceRuleJSON[];
  clearRecurrence?: boolean;
  span?: 'this-event' | 'future-events';
}
