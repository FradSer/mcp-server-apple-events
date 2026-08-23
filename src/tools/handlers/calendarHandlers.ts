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
import {
  CliUserError,
  handleAsyncOperation,
} from '../../utils/errorHandling.js';
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
  if (event.timeZone) lines.push(`  - Timezone: ${event.timeZone}`);
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
      timeZone: validatedArgs.timezone,
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
    // Attendees and EventKit fields travel through different subsystems with
    // no shared concurrency token, so a combined write would have no defined
    // ordering. Requiring attendees to stand alone keeps each call atomic.
    if (validatedArgs.attendees && validatedArgs.attendees.length > 0) {
      const others = [
        validatedArgs.title,
        validatedArgs.startDate,
        validatedArgs.endDate,
        validatedArgs.note,
        validatedArgs.location,
        validatedArgs.timezone,
      ].filter((value) => value !== undefined);
      if (others.length > 0) {
        throw new CliUserError(
          'Update attendees on their own. Adding attendees goes through ' +
            'Calendar.app while other fields go through EventKit, so a ' +
            'combined update has no safe ordering. Issue two calls.',
        );
      }
      const { event: invited, updated } = await calendarRepository.addAttendees(
        validatedArgs.id,
        validatedArgs.attendees,
      );
      const list = validatedArgs.attendees.join(', ');
      return (
        `Invited ${list} to "${invited.title}" (${updated} event updated). ` +
        'iCloud sends the invitation; the event is now linked, so later ' +
        'changes and deletions propagate to the invitee.'
      );
    }

    const event = await calendarRepository.updateEvent({
      id: validatedArgs.id,
      title: validatedArgs.title,
      startDate: validatedArgs.startDate,
      endDate: validatedArgs.endDate,
      notes: validatedArgs.note,
      location: validatedArgs.location,
      timeZone: validatedArgs.timezone,
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
    // A this-event delete resolves to the series master, so without an
    // explicit occurrence it can only ever except the series start — and
    // silently no-ops on any later one. Naming the occurrence routes the write
    // over CalDAV, which can address it.
    if (validatedArgs.occurrenceDate) {
      const { event, excepted } = await calendarRepository.exceptOccurrence(
        validatedArgs.id,
        validatedArgs.occurrenceDate,
      );
      return (
        `Excepted the ${validatedArgs.occurrenceDate} occurrence of ` +
        `"${event.title}" (${excepted}). The rest of the series is unchanged.`
      );
    }

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
    const validatedArgs = extractAndValidateArgs(args, ReadCalendarsSchema);
    const calendars = await calendarRepository.findCalendars({
      startDate: validatedArgs.startDate,
      endDate: validatedArgs.endDate,
    });
    return formatListMarkdown(
      'Calendars',
      calendars,
      (calendar) => {
        // The vendored `event` CLI doesn't expose EventKit calendar
        // identifiers, so calendars synthesized from the read window have
        // `id === title`. Skip the trailing `(ID: …)` then since it just
        // duplicates the title.
        const idSuffix =
          calendar.id && calendar.id !== calendar.title
            ? ` (ID: ${calendar.id})`
            : '';
        const countSuffix =
          calendar.eventCount !== undefined
            ? ` - ${calendar.eventCount} event${calendar.eventCount === 1 ? '' : 's'}`
            : '';
        return [`- ${calendar.title}${idSuffix}${countSuffix}`];
      },
      'No calendars found.',
    );
  }, 'read calendars');
};
