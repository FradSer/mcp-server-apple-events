/**
 * repository.ts
 * Shared type definitions for repository layer JSON interfaces and the
 * abstract contracts the application layer is allowed to depend on.
 *
 * Domain layer rule (CLAUDE.md): interfaces are defined in the *consuming*
 * layer, not the implementation layer. The handlers / orchestration code in
 * `src/tools/handlers/` are the consumers — these interfaces live here in
 * `src/types/` so the concrete repositories in `src/utils/` formally
 * implement them rather than the handlers being coupled to the
 * implementation.
 */

import type {
  Calendar,
  CalendarEvent,
  Reminder,
  ReminderList,
} from './index.js';

/**
 * Recurrence rule JSON interface as emitted by the `event` CLI
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
 * Location trigger JSON interface as emitted by the `event` CLI
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
 * JSON interfaces emitted by the `event` CLI
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

/**
 * Data interfaces for repository methods
 */

/** Fields accepted by `event reminders create`. */
export interface CreateReminderData {
  title: string;
  list?: string;
  notes?: string;
  url?: string;
  dueDate?: string;
  priority?: number;
}

/** Fields accepted by `event reminders update`. */
export interface UpdateReminderData {
  id: string;
  newTitle?: string;
  notes?: string;
  url?: string;
  isCompleted?: boolean;
  startDate?: string;
  dueDate?: string;
  priority?: number;
}

/**
 * Fields accepted by `event calendar create`. All-day events are inferred
 * from the date format (bare `YYYY-MM-DD` without a time component).
 */
export interface CreateEventData {
  title: string;
  startDate: string;
  endDate: string;
  calendar?: string;
  notes?: string;
  location?: string;
  alarmMinutesBefore?: number;
}

/** Fields accepted by `event calendar update`. */
export interface UpdateEventData {
  id: string;
  title?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
  location?: string;
  alarmMinutesBefore?: number;
}

/**
 * Reminder repository contract. Implementations are responsible for talking
 * to the underlying EventKit data store (today: via the Swift CLI). The
 * application layer depends only on this interface.
 */
export interface IReminderRepository {
  findReminderById(id: string): Promise<Reminder>;
  findReminders(filters?: {
    list?: string;
    showCompleted?: boolean;
    search?: string;
    dueWithin?: string;
    priority?: 'high' | 'medium' | 'low' | 'none';
    recurring?: boolean;
    locationBased?: boolean;
    tags?: string[];
  }): Promise<Reminder[]>;
  findAllLists(): Promise<ReminderList[]>;
  createReminder(data: CreateReminderData): Promise<ReminderJSON>;
  updateReminder(data: UpdateReminderData): Promise<ReminderJSON>;
  deleteReminder(id: string): Promise<void>;
  createReminderList(name: string): Promise<ReminderList>;
  updateReminderList(
    currentName: string,
    newName: string,
  ): Promise<ReminderList>;
  deleteReminderList(name: string): Promise<void>;
}

/**
 * Calendar repository contract. Mirrors `IReminderRepository` for EventKit
 * calendar/event operations.
 */
export interface ICalendarRepository {
  findEventById(id: string): Promise<CalendarEvent>;
  findEvents(filters?: {
    startDate?: string;
    endDate?: string;
    calendarName?: string;
    search?: string;
    availability?: string;
  }): Promise<CalendarEvent[]>;
  findAllCalendars(): Promise<Calendar[]>;
  findCalendars(filters?: {
    startDate?: string;
    endDate?: string;
  }): Promise<Calendar[]>;
  createEvent(data: CreateEventData): Promise<EventJSON>;
  updateEvent(data: UpdateEventData): Promise<EventJSON>;
  deleteEvent(id: string, span?: 'this-event' | 'future-events'): Promise<void>;
}
