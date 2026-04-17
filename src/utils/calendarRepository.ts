/**
 * calendarRepository.ts
 * Repository pattern implementation for calendar event data access operations using EventKitCLI.
 */

import type { Calendar, CalendarEvent } from '../types/index.js';
import type {
  CalendarJSON,
  CreateEventData,
  EventJSON,
  EventsReadResult,
  UpdateEventData,
} from '../types/repository.js';
import { executeCli } from './cliExecutor.js';
import {
  addOptionalArg,
  addOptionalBooleanArg,
  addOptionalJsonArg,
  nullToUndefined,
} from './helpers.js';

const DEFAULT_READ_WINDOW_DAYS = 14;

const formatDateOnly = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInput = (value: string): Date | undefined => {
  const normalized = value.includes(' ')
    ? value.replace(' ', 'T')
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00`
      : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const shiftDays = (date: Date, days: number): Date => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
};

const resolveReadDateRange = (filters: {
  startDate?: string;
  endDate?: string;
}): { startDate?: string; endDate?: string } => {
  if (filters.startDate && filters.endDate) {
    return { startDate: filters.startDate, endDate: filters.endDate };
  }

  if (!filters.startDate && !filters.endDate) {
    const today = new Date();
    return {
      startDate: formatDateOnly(today),
      endDate: formatDateOnly(shiftDays(today, DEFAULT_READ_WINDOW_DAYS)),
    };
  }

  if (filters.startDate && !filters.endDate) {
    const start = parseDateInput(filters.startDate);
    if (!start) return { startDate: filters.startDate };
    return {
      startDate: filters.startDate,
      endDate: formatDateOnly(shiftDays(start, DEFAULT_READ_WINDOW_DAYS)),
    };
  }

  if (!filters.startDate && filters.endDate) {
    const end = parseDateInput(filters.endDate);
    if (!end) return { endDate: filters.endDate };
    return {
      startDate: formatDateOnly(shiftDays(end, -DEFAULT_READ_WINDOW_DAYS)),
      endDate: filters.endDate,
    };
  }

  return {};
};

class CalendarRepository {
  private async readEvents(
    startDate?: string,
    endDate?: string,
    calendarName?: string,
    search?: string,
    accountName?: string,
  ): Promise<EventsReadResult> {
    const args = ['--action', 'read-events'];
    addOptionalArg(args, '--startDate', startDate);
    addOptionalArg(args, '--endDate', endDate);
    addOptionalArg(args, '--filterCalendar', calendarName);
    addOptionalArg(args, '--search', search);
    addOptionalArg(args, '--filterAccount', accountName);

    return executeCli<EventsReadResult>(args);
  }

  async findEventById(id: string): Promise<CalendarEvent> {
    const { events } = await this.readEvents();
    const event = events.find((e) => e.id === id);
    if (!event) {
      throw new Error(`Event with ID '${id}' not found.`);
    }
    return nullToUndefined(event, [
      'notes',
      'location',
      'structuredLocation',
      'url',
      'availability',
      'alarms',
      'recurrenceRules',
      'organizer',
      'attendees',
      'status',
      'isDetached',
      'occurrenceDate',
      'creationDate',
      'lastModifiedDate',
      'externalId',
    ]) as CalendarEvent;
  }

  async findEvents(
    filters: {
      startDate?: string;
      endDate?: string;
      calendarName?: string;
      search?: string;
      availability?: string;
      accountName?: string;
    } = {},
  ): Promise<CalendarEvent[]> {
    const dateRange = resolveReadDateRange({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
    const { events } = await this.readEvents(
      dateRange.startDate,
      dateRange.endDate,
      filters.calendarName,
      filters.search,
      filters.accountName,
    );
    const normalized = events.map((e) =>
      nullToUndefined(e, [
        'notes',
        'location',
        'structuredLocation',
        'url',
        'availability',
        'alarms',
        'recurrenceRules',
        'organizer',
        'attendees',
        'status',
        'isDetached',
        'occurrenceDate',
        'creationDate',
        'lastModifiedDate',
        'externalId',
      ]),
    ) as CalendarEvent[];

    if (filters.availability) {
      return normalized.filter(
        (event) => event.availability === filters.availability,
      );
    }

    return normalized;
  }

  async findAllCalendars(): Promise<Calendar[]> {
    return executeCli<CalendarJSON[]>(['--action', 'read-calendars']);
  }

  async createEvent(data: CreateEventData): Promise<EventJSON> {
    const args = [
      '--action',
      'create-event',
      '--title',
      data.title,
      '--startDate',
      data.startDate,
      '--endDate',
      data.endDate,
    ];
    addOptionalArg(args, '--targetCalendar', data.calendar);
    addOptionalArg(args, '--note', data.notes);
    addOptionalArg(args, '--location', data.location);
    addOptionalJsonArg(args, '--structuredLocation', data.structuredLocation);
    addOptionalArg(args, '--url', data.url);
    addOptionalBooleanArg(args, '--isAllDay', data.isAllDay);
    addOptionalArg(args, '--availability', data.availability);
    addOptionalJsonArg(args, '--alarms', data.alarms);
    addOptionalJsonArg(args, '--recurrenceRules', data.recurrenceRules);

    return executeCli<EventJSON>(args);
  }

  async updateEvent(data: UpdateEventData): Promise<EventJSON> {
    const args = ['--action', 'update-event', '--id', data.id];
    addOptionalArg(args, '--title', data.title);
    addOptionalArg(args, '--targetCalendar', data.calendar);
    addOptionalArg(args, '--startDate', data.startDate);
    addOptionalArg(args, '--endDate', data.endDate);
    addOptionalArg(args, '--note', data.notes);
    addOptionalArg(args, '--location', data.location);
    if (data.structuredLocation === null) {
      args.push('--structuredLocation', '');
    } else {
      addOptionalJsonArg(args, '--structuredLocation', data.structuredLocation);
    }
    addOptionalArg(args, '--url', data.url);
    addOptionalBooleanArg(args, '--isAllDay', data.isAllDay);
    addOptionalArg(args, '--availability', data.availability);
    addOptionalJsonArg(args, '--alarms', data.alarms);
    addOptionalBooleanArg(args, '--clearAlarms', data.clearAlarms);
    addOptionalJsonArg(args, '--recurrenceRules', data.recurrenceRules);
    addOptionalBooleanArg(args, '--clearRecurrence', data.clearRecurrence);
    addOptionalArg(args, '--span', data.span);

    return executeCli<EventJSON>(args);
  }

  async deleteEvent(id: string, span?: string): Promise<void> {
    const args = ['--action', 'delete-event', '--id', id];
    addOptionalArg(args, '--span', span);
    await executeCli<unknown>(args);
  }
}

export const calendarRepository = new CalendarRepository();

// Export class for dependency injection and testing
export { CalendarRepository };
