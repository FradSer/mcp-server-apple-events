/**
 * calendarRepository.ts
 * Repository for calendar event data access via the vendored `event` CLI.
 *
 * Read-only fields (URL, structured location, all-day toggle, availability,
 * alarms, recurrence rules) are passed through from JSON when present;
 * write paths only cover what `event` exposes today. See
 * `docs/migration-to-event-cli.md` for the full table.
 */

import type { Calendar, CalendarEvent } from '../types/index.js';
import type {
  CalendarJSON,
  CreateEventData,
  EventJSON,
  ICalendarRepository,
  UpdateEventData,
} from '../types/repository.js';
import { addAttendeesToEvent } from './appleScriptAttendees.js';
import { resolveCalDavCredentials } from './caldavCredentials.js';
import { exceptOccurrenceViaCalDav } from './caldavOccurrence.js';
import {
  formatDateOnly,
  formatDateOnlyOrFallback,
  shiftDays,
  toDateOnly,
} from './dateUtils.js';
import { CliUserError } from './errorHandling.js';
import { executeEventCliJson, executeEventCliPlain } from './eventCli.js';
import { addArg, addOptionalArg, nullToUndefined } from './helpers.js';
import { parseReminderDueDate } from './reminderDateParser.js';

const DEFAULT_READ_WINDOW_DAYS = 14;

/**
 * The iCalendar UID for an event, which iCloud also uses as the CalDAV
 * resource name.
 *
 * The vendored `event` CLI never emits `calendarItemExternalIdentifier` — its
 * `CalendarEvent` model has no such field — so `externalId` is absent in
 * practice and reading it alone left the occurrence-exception path unable to
 * address any resource at all. EventKit's identifier is
 * `<calendar UUID>:<item UUID>` and on an iCloud account the item half *is*
 * the UID: verified against a live collection, where the id tail, the `.ics`
 * resource name, and the `UID:` property inside it all agreed, and where the
 * same tail appeared on the organizer's and the attendee's separate copies of
 * one invitation (a per-store row id would differ).
 *
 * `externalId` still wins when present so a future CLI that supplies it needs
 * no change here. A non-iCloud event yields a UID that simply has no resource
 * behind it, and the CalDAV GET reports that rather than writing anywhere.
 */
const icalUidFor = (event: CalendarEvent): string | undefined => {
  if (event.externalId) return event.externalId;
  const tail = event.id.split(':').pop();
  return tail && tail !== event.id ? tail : undefined;
};

/**
 * `calendar list` accepts date-only bounds and treats its end as exclusive.
 * Caller-supplied date-only and non-midnight end values name a day to include,
 * so advance those bounds to the following day. A midnight date-time already
 * represents an exclusive boundary and must remain unchanged.
 */
const toCalendarReadEnd = (value: string): string => {
  const endDate = toDateOnly(value);
  const time = value.match(/[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?/);
  const isMidnight =
    time?.[1] === '00' &&
    time[2] === '00' &&
    (!time[3] || time[3] === '00') &&
    (!time[4] || /^0+$/.test(time[4]));

  if (isMidnight) return endDate;

  const parsedEndDate = parseReminderDueDate(endDate);
  if (!parsedEndDate) return endDate;

  const exclusiveEndDate = shiftDays(parsedEndDate, 1);
  return formatDateOnlyOrFallback(exclusiveEndDate, endDate);
};

const resolveReadDateRange = (filters: {
  startDate?: string;
  endDate?: string;
}): { startDate: string; endDate: string } => {
  const today = new Date();

  if (filters.startDate && filters.endDate) {
    return {
      startDate: toDateOnly(filters.startDate),
      endDate: toCalendarReadEnd(filters.endDate),
    };
  }

  if (!filters.startDate && !filters.endDate) {
    return {
      startDate: formatDateOnly(today),
      endDate: formatDateOnly(shiftDays(today, DEFAULT_READ_WINDOW_DAYS)),
    };
  }

  if (filters.startDate && !filters.endDate) {
    // `parseReminderDueDate` is the strict parser shared with the reminder
    // pipeline; it rejects auto-corrected dates like `2025-02-30` that the
    // native `Date` constructor silently coerces to March 2.
    const start = parseReminderDueDate(toDateOnly(filters.startDate));
    const startDate = toDateOnly(filters.startDate);
    return {
      startDate,
      endDate: formatDateOnlyOrFallback(
        shiftDays(start ?? today, DEFAULT_READ_WINDOW_DAYS),
        startDate,
      ),
    };
  }

  // !filters.startDate && filters.endDate
  const endStr = filters.endDate as string;
  const endDate = toCalendarReadEnd(endStr);
  const end = parseReminderDueDate(endDate);
  return {
    startDate: formatDateOnlyOrFallback(
      shiftDays(end ?? today, -DEFAULT_READ_WINDOW_DAYS),
      toDateOnly(endStr),
    ),
    endDate,
  };
};

const EVENT_NULLABLE_FIELDS: (keyof EventJSON)[] = [
  'notes',
  'location',
  'structuredLocation',
  'url',
  'timeZone',
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
];

const mapEvent = (event: EventJSON): CalendarEvent =>
  nullToUndefined(event, EVENT_NULLABLE_FIELDS) as CalendarEvent;

/**
 * Maps one `calendar calendars` entry onto the domain type. The CLI reports
 * the EventKit identifier; the MCP surface keys calendars by title everywhere
 * else (create, update, list filtering), so `id` mirrors the title and the
 * source fields carry the disambiguation.
 */
const mapCalendar = (calendar: CalendarJSON): Calendar => ({
  id: calendar.title,
  title: calendar.title,
  source: calendar.source ?? undefined,
  sourceType: calendar.sourceType ?? undefined,
  allowsContentModifications: calendar.allowsContentModifications ?? undefined,
  isImmutable: calendar.isImmutable ?? undefined,
  color: calendar.color ?? undefined,
});

type EventSpan = 'this-event' | 'future-events';

/**
 * Maps our schema span values to `event calendar delete --span` strings.
 * `event` understands "this" (default → `.thisEvent`) and "all"
 * (→ `.futureEvents`).
 */
const mapSpanForEvent = (
  span: EventSpan | undefined,
): 'this' | 'all' | undefined =>
  span === 'this-event' ? 'this' : span === 'future-events' ? 'all' : undefined;

class CalendarRepository implements ICalendarRepository {
  private async listEvents(
    startDate: string,
    endDate: string,
    calendarName?: string,
  ): Promise<EventJSON[]> {
    const args: string[] = ['calendar', 'list'];
    addArg(args, '--start', startDate);
    addArg(args, '--end', endDate);
    addOptionalArg(args, '--calendar', calendarName);
    args.push('--json');
    return executeEventCliJson<EventJSON[]>(args);
  }

  /**
   * Reads one event through `event calendar get --id`, which resolves it with
   * `EKEventStore.event(withIdentifier:)` — the same lookup `update` and
   * `delete` use, so an event that can be written can always be read back.
   * The previous ±4-year `calendar list` scan transferred the whole window to
   * filter one row in TS, and EventKit could leave the event out of that
   * window even though a direct lookup found it.
   */
  async findEventById(id: string): Promise<CalendarEvent> {
    const args: string[] = ['calendar', 'get'];
    addArg(args, '--id', id);
    args.push('--json');
    return mapEvent(await executeEventCliJson<EventJSON>(args));
  }

  async findEvents(
    filters: {
      startDate?: string;
      endDate?: string;
      calendarName?: string;
      search?: string;
      availability?: string;
    } = {},
  ): Promise<CalendarEvent[]> {
    const dateRange = resolveReadDateRange({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
    const events = await this.listEvents(
      dateRange.startDate,
      dateRange.endDate,
      filters.calendarName,
    );
    let normalized = events.map(mapEvent);

    // `event` does not surface `--search`; apply the substring match in TS
    // against title / notes / location.
    if (filters.search) {
      const needle = filters.search.toLowerCase();
      normalized = normalized.filter((event) => {
        const haystack = [event.title, event.notes, event.location]
          .filter((value): value is string => Boolean(value))
          .map((value) => value.toLowerCase());
        return haystack.some((value) => value.includes(needle));
      });
    }

    if (filters.availability) {
      normalized = normalized.filter(
        (event) => event.availability === filters.availability,
      );
    }

    return normalized;
  }

  /**
   * Lists every calendar the `event` CLI reports for the `.event` entity.
   *
   * `calendar list` could only surface a calendar that held an event inside
   * the queried window, so an empty calendar — or one whose events EventKit
   * did not return for that window — never appeared. `calendar calendars`
   * reads the EventKit catalog instead and carries the source, which tells
   * two same-named calendars apart.
   */
  async findAllCalendars(): Promise<Calendar[]> {
    const calendars = await executeEventCliJson<CalendarJSON[]>([
      'calendar',
      'calendars',
      '--json',
    ]);
    return calendars
      .map(mapCalendar)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * When a date range is supplied, scope the listing to that window and
   * annotate each calendar with how many events it contributed — this is the
   * only per-calendar signal `event` exposes for a window (it has no
   * per-calendar count), so counts are grouped by calendar title rather than
   * a stable id. Without a range, delegate to `findAllCalendars`, which reads
   * the EventKit catalog.
   */
  async findCalendars(
    filters: { startDate?: string; endDate?: string } = {},
  ): Promise<Calendar[]> {
    if (!filters.startDate && !filters.endDate) {
      return this.findAllCalendars();
    }

    const dateRange = resolveReadDateRange({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
    const events = await this.listEvents(
      dateRange.startDate,
      dateRange.endDate,
    );

    const eventCountByTitle = new Map<string, number>();
    for (const event of events) {
      if (!event.calendar) continue;
      eventCountByTitle.set(
        event.calendar,
        (eventCountByTitle.get(event.calendar) ?? 0) + 1,
      );
    }

    return Array.from(eventCountByTitle.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((title) => ({
        id: title,
        title,
        eventCount: eventCountByTitle.get(title) ?? 0,
      }));
  }

  async createEvent(data: CreateEventData): Promise<EventJSON> {
    const args: string[] = ['calendar', 'create'];
    addArg(args, '--title', data.title);
    addArg(args, '--start', data.startDate);
    addArg(args, '--end', data.endDate);
    addOptionalArg(args, '--calendar', data.calendar);
    addOptionalArg(args, '--notes', data.notes);
    addOptionalArg(args, '--location', data.location);
    addOptionalArg(args, '--timezone', data.timeZone);
    args.push('--json');
    return executeEventCliJson<EventJSON>(args);
  }

  async updateEvent(data: UpdateEventData): Promise<EventJSON> {
    const args: string[] = ['calendar', 'update'];
    addArg(args, '--id', data.id);
    addOptionalArg(args, '--title', data.title);
    addOptionalArg(args, '--start', data.startDate);
    addOptionalArg(args, '--end', data.endDate);
    addOptionalArg(args, '--location', data.location);
    addOptionalArg(args, '--notes', data.notes);
    addOptionalArg(args, '--timezone', data.timeZone);
    args.push('--json');
    return executeEventCliJson<EventJSON>(args);
  }

  /**
   * Attendee writes bypass the `event` CLI entirely: EventKit declares
   * `attendees` read-only, so the CLI has no flag that could carry them. The
   * event is resolved here first so the caller addresses it the same way as any
   * other update — by id — while Calendar.app is driven by title and date,
   * which is the only handle its scripting interface offers.
   */
  async addAttendees(
    id: string,
    emails: string[],
  ): Promise<{ event: CalendarEvent; updated: number }> {
    const event = await this.findEventById(id);
    const { updated } = await addAttendeesToEvent({
      calendarName: event.calendar,
      summary: event.title,
      date: toDateOnly(event.startDate),
      attendees: emails.map((email) => ({ email })),
    });
    return { event, updated };
  }

  async exceptOccurrence(
    id: string,
    occurrenceDate: string,
  ): Promise<{ event: CalendarEvent; excepted: string }> {
    const event = await this.findEventById(id);
    const uid = icalUidFor(event);
    if (!uid) {
      throw new CliUserError(
        `Event '${id}' carries no iCalendar UID, so its CalDAV resource ` +
          'cannot be located. Only iCloud-synced events can have a single ' +
          'occurrence excepted.',
      );
    }
    const credentials = await resolveCalDavCredentials();
    const { excepted } = await exceptOccurrenceViaCalDav({
      credentials,
      calendarName: event.calendar,
      uid,
      occurrenceDate,
    });
    return { event, excepted };
  }

  async deleteEvent(id: string, span?: EventSpan): Promise<void> {
    const args: string[] = ['calendar', 'delete'];
    addArg(args, '--id', id);
    addOptionalArg(args, '--span', mapSpanForEvent(span));
    await executeEventCliPlain(args);
  }
}

export const calendarRepository = new CalendarRepository();

export { CalendarRepository };
