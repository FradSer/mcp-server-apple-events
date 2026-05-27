/**
 * handlers/calendarHandlers.ts
 * Handlers for calendar event operations
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  CalendarEvent,
  CalendarsToolArgs,
  CalendarToolArgs,
} from '../../types/index.js';
import { calendarRepository } from '../../utils/calendarRepository.js';
import { handleAsyncOperation } from '../../utils/errorHandling.js';
import { formatMultilineNotes } from '../../utils/helpers.js';
import {
  CreateCalendarEventSchema,
  DeleteCalendarEventSchema,
  ReadCalendarEventsSchema,
  ReadCalendarsSchema,
  UpdateCalendarEventSchema,
} from '../../validation/schemas.js';
import { formatAlarm, formatRecurrenceRules } from './formatters.js';
import {
  extractAndValidateArgs,
  formatDeleteMessage,
  formatListMarkdown,
  formatSuccessMessage,
  UNTRUSTED_DATA_NOTICE,
} from './shared.js';

/**
 * Formats a calendar event as a markdown list item. Renders alarms /
 * recurrence rules through the same helpers as the reminder formatter so the
 * two outputs stay structurally consistent (instead of degenerating to bare
 * counts like `Alarms: 2`).
 */
const formatEventMarkdown = (event: CalendarEvent): string[] => {
  const lines: string[] = [];
  lines.push(`- ${event.title}`);
  if (event.calendar) lines.push(`  - Calendar: ${event.calendar}`);
  if (event.id) lines.push(`  - ID: ${event.id}`);
  if (event.startDate) lines.push(`  - Start: ${event.startDate}`);
  if (event.endDate) lines.push(`  - End: ${event.endDate}`);
  if (event.isAllDay !== undefined)
    lines.push(`  - All Day: ${event.isAllDay}`);
  if (event.location) lines.push(`  - Location: ${event.location}`);
  if (event.structuredLocation)
    lines.push(`  - Structured Location: ${event.structuredLocation.title}`);
  if (event.availability) lines.push(`  - Availability: ${event.availability}`);
  if (event.alarms && event.alarms.length > 0) {
    lines.push(`  - Alarms: ${event.alarms.map(formatAlarm).join('; ')}`);
  }
  if (event.recurrenceRules && event.recurrenceRules.length > 0) {
    lines.push(`  - Repeats: ${formatRecurrenceRules(event.recurrenceRules)}`);
  }
  if (event.organizer)
    lines.push(`  - Organizer: ${event.organizer.name ?? event.organizer.url}`);
  if (event.attendees && event.attendees.length > 0) {
    const attendeeList = event.attendees.map((a) => a.name ?? a.url).join(', ');
    lines.push(`  - Attendees (${event.attendees.length}): ${attendeeList}`);
  }
  if (event.status) lines.push(`  - Status: ${event.status}`);
  if (event.isDetached !== undefined)
    lines.push(`  - Detached: ${event.isDetached}`);
  if (event.occurrenceDate)
    lines.push(`  - Occurrence Date: ${event.occurrenceDate}`);
  if (event.externalId) lines.push(`  - External ID: ${event.externalId}`);
  if (event.creationDate) lines.push(`  - Created: ${event.creationDate}`);
  if (event.lastModifiedDate)
    lines.push(`  - Modified: ${event.lastModifiedDate}`);
  if (event.notes)
    lines.push(`  - Notes: ${formatMultilineNotes(event.notes)}`);
  if (event.url) lines.push(`  - URL: ${event.url}`);
  return lines;
};

export const handleCreateCalendarEvent = async (
  args: CalendarToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(
      args,
      CreateCalendarEventSchema,
    );
    const event = await calendarRepository.createEvent({
      title: validatedArgs.title,
      startDate: validatedArgs.startDate,
      endDate: validatedArgs.endDate,
      calendar: validatedArgs.targetCalendar,
      notes: validatedArgs.note,
      location: validatedArgs.location,
      structuredLocation: validatedArgs.structuredLocation,
      url: validatedArgs.url,
      isAllDay: validatedArgs.isAllDay,
      availability: validatedArgs.availability,
      alarms: validatedArgs.alarms,
      recurrenceRules: validatedArgs.recurrenceRules,
    });
    return formatSuccessMessage('created', 'event', event.title, event.id);
  }, 'create calendar event');
};

export const handleUpdateCalendarEvent = async (
  args: CalendarToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(
      args,
      UpdateCalendarEventSchema,
    );
    const event = await calendarRepository.updateEvent({
      id: validatedArgs.id,
      title: validatedArgs.title,
      startDate: validatedArgs.startDate,
      endDate: validatedArgs.endDate,
      calendar: validatedArgs.targetCalendar,
      notes: validatedArgs.note,
      location: validatedArgs.location,
      structuredLocation: validatedArgs.structuredLocation,
      url: validatedArgs.url,
      isAllDay: validatedArgs.isAllDay,
      availability: validatedArgs.availability,
      alarms: validatedArgs.alarms,
      clearAlarms: validatedArgs.clearAlarms,
      recurrenceRules: validatedArgs.recurrenceRules,
      clearRecurrence: validatedArgs.clearRecurrence,
      span: validatedArgs.span,
    });
    return formatSuccessMessage('updated', 'event', event.title, event.id);
  }, 'update calendar event');
};

export const handleDeleteCalendarEvent = async (
  args: CalendarToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(
      args,
      DeleteCalendarEventSchema,
    );
    await calendarRepository.deleteEvent(validatedArgs.id, validatedArgs.span);
    return formatDeleteMessage('event', validatedArgs.id, {
      useQuotes: true,
      useIdPrefix: true,
      usePeriod: true,
      useColon: false,
    });
  }, 'delete calendar event');
};

export const handleReadCalendarEvents = async (
  args: CalendarToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(
      args,
      ReadCalendarEventsSchema,
    );

    if (validatedArgs.id) {
      const event = await calendarRepository.findEventById(validatedArgs.id);
      return [
        '### Calendar Event',
        '',
        UNTRUSTED_DATA_NOTICE,
        '',
        ...formatEventMarkdown(event),
      ].join('\n');
    }

    const events = await calendarRepository.findEvents({
      startDate: validatedArgs.startDate,
      endDate: validatedArgs.endDate,
      calendarName: validatedArgs.filterCalendar,
      search: validatedArgs.search,
      availability: validatedArgs.availability,
      accountName: validatedArgs.filterAccount,
    });

    return formatListMarkdown(
      'Calendar Events',
      events,
      formatEventMarkdown,
      'No calendar events found.',
    );
  }, 'read calendar events');
};

export const handleReadCalendars = async (
  args?: CalendarsToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    extractAndValidateArgs(args, ReadCalendarsSchema);
    const calendars = await calendarRepository.findAllCalendars();
    return formatListMarkdown(
      'Calendars',
      calendars,
      (calendar) => [
        `- ${calendar.title} (${calendar.account}) (ID: ${calendar.id})`,
      ],
      'No calendars found.',
    );
  }, 'read calendars');
};
