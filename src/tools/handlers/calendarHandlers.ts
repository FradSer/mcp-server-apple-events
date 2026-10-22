/**
 * handlers/calendarHandlers.ts
 * Handlers for calendar event operations
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { CalendarsToolArgs, CalendarToolArgs } from '../../types/index.js';
import { calendarRepository } from '../../utils/calendarRepository.js';
import {
  CliUserError,
  handleAsyncOperation,
} from '../../utils/errorHandling.js';
import {
  CreateCalendarEventSchema,
  DeleteCalendarEventSchema,
  ReadCalendarEventsSchema,
  ReadCalendarsSchema,
  UpdateCalendarEventSchema,
} from '../../validation/schemas.js';
import {
  createStructuredToolResult,
  extractAndValidateArgs,
} from './shared.js';

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
      url: validatedArgs.url,
      alarms: validatedArgs.alarms,
      availability: validatedArgs.availability,
    });
    return createStructuredToolResult('Created calendar event.', [event]);
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
    if (validatedArgs.targetCalendar !== undefined) {
      throw new CliUserError(
        'Moving a calendar event to another calendar is not supported by the underlying `event` CLI. Move it in Calendar.app, or delete and recreate it in the target calendar.',
      );
    }
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
        validatedArgs.url,
        validatedArgs.alarms,
        validatedArgs.addAlarms,
        validatedArgs.clearAlarms ? true : undefined,
        validatedArgs.availability,
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
      return createStructuredToolResult('Invited calendar attendees.', [
        { event: invited, updated },
      ]);
    }

    const event = await calendarRepository.updateEvent({
      id: validatedArgs.id,
      title: validatedArgs.title,
      startDate: validatedArgs.startDate,
      endDate: validatedArgs.endDate,
      notes: validatedArgs.note,
      location: validatedArgs.location,
      timeZone: validatedArgs.timezone,
      url: validatedArgs.url ?? undefined,
      clearURL: validatedArgs.url === null,
      alarms: validatedArgs.alarms,
      addAlarms: validatedArgs.addAlarms,
      clearAlarms: validatedArgs.clearAlarms,
      availability: validatedArgs.availability,
    });
    return createStructuredToolResult('Updated calendar event.', [event]);
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
    // span and occurrenceDate express contradictory intents — "this or all
    // following" versus "exactly this one". Silently honouring occurrenceDate
    // would leave the caller believing span applied.
    if (validatedArgs.occurrenceDate && validatedArgs.span) {
      throw new CliUserError(
        'Provide either span or occurrenceDate, not both. span scopes a ' +
          'change across a series; occurrenceDate excepts one occurrence.',
      );
    }

    if (validatedArgs.occurrenceDate) {
      const { event, excepted } = await calendarRepository.exceptOccurrence(
        validatedArgs.id,
        validatedArgs.occurrenceDate,
      );
      return createStructuredToolResult('Excepted calendar occurrence.', [
        { event, excepted },
      ]);
    }

    await calendarRepository.deleteEvent(validatedArgs.id, validatedArgs.span);
    return createStructuredToolResult('Deleted calendar event.', [
      { id: validatedArgs.id },
    ]);
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
      return createStructuredToolResult('Read calendar events.', [event]);
    }

    const events = await calendarRepository.findEvents({
      startDate: validatedArgs.startDate,
      endDate: validatedArgs.endDate,
      calendarName: validatedArgs.filterCalendar,
      search: validatedArgs.search,
      availability: validatedArgs.availability,
    });

    return createStructuredToolResult('Read calendar events.', events);
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
    return createStructuredToolResult('Read calendars.', calendars);
  }, 'read calendars');
};
