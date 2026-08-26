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
  CreateEventData,
  EventJSON,
  ICalendarRepository,
  UpdateEventData,
} from '../types/repository.js';
import { addAttendeesToEvent } from './appleScriptAttendees.js';
import { resolveCalDavCredentials } from './caldavCredentials.js';
import { exceptOccurrenceViaCalDav } from './caldavOccurrence.js';
import { formatDateOnly, shiftDays, toDateOnly } from './dateUtils.js';
import { CliUserError } from './errorHandling.js';
import { executeEventCliJson, executeEventCliPlain } from './eventCli.js';
import { addOptionalArg, nullToUndefined } from './helpers.js';
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
 * When looking up a single event by ID, expand the read window aggressively
 * so events scheduled years away (e.g. recurring annual reservations) can
 * still be located without requiring the caller to know the date in advance.
 * EventKit only supports a maximum 4-year predicate window — bound at
 * roughly that to stay within Apple's limits.
 */
const FIND_BY_ID_WINDOW_DAYS = 365 * 4;

const resolveReadDateRange = (filters: {
  startDate?: string;
  endDate?: string;
}): { startDate: string; endDate: string } => {
  const today = new Date();

  if (filters.startDate && filters.endDate) {
    return {
      startDate: toDateOnly(filters.startDate),
      endDate: toDateOnly(filters.endDate),
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
    const start = parseReminderDueDate(filters.startDate);
    return {
      startDate: toDateOnly(filters.startDate),
      endDate: formatDateOnly(
        shiftDays(start ?? today, DEFAULT_READ_WINDOW_DAYS),
      ),
    };
  }

  // !filters.startDate && filters.endDate
  const endStr = filters.endDate as string;
  const end = parseReminderDueDate(endStr);
  return {
    startDate: formatDateOnly(
      shiftDays(end ?? today, -DEFAULT_READ_WINDOW_DAYS),
    ),
    endDate: toDateOnly(endStr),
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
    const args = ['calendar', 'list', '--start', startDate, '--end', endDate];
    addOptionalArg(args, '--calendar', calendarName);
    args.push('--json');
    return executeEventCliJson<EventJSON[]>(args);
  }

  // `findEventById` and `findAllCalendars` both need a wide read window
  // because EventKit can't be queried for a single event by id directly via
  // `event`, and empty calendars don't appear in narrow windows. Centralize
  // the bounds here so both paths stay in sync.
  private async listEventsWideWindow(): Promise<EventJSON[]> {
    // EventKit clamps `predicateForEvents` to four years measured from the
    // *start* date and drops the remainder without reporting it, so a single
    // today±4y query silently returns the backward half only — no future
    // event is ever visible, which made `findEventById` fail for every event
    // that had not happened yet. Splitting at today keeps each half inside
    // the limit. Both halves are inclusive of today, so ids are deduplicated.
    const today = new Date();
    const midpoint = formatDateOnly(today);
    const [past, future] = await Promise.all([
      this.listEvents(
        formatDateOnly(shiftDays(today, -FIND_BY_ID_WINDOW_DAYS)),
        midpoint,
      ),
      this.listEvents(
        midpoint,
        formatDateOnly(shiftDays(today, FIND_BY_ID_WINDOW_DAYS)),
      ),
    ]);

    const seen = new Set<string>();
    const merged: EventJSON[] = [];
    for (const event of [...past, ...future]) {
      if (event.id) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
      }
      merged.push(event);
    }
    return merged;
  }

  async findEventById(id: string): Promise<CalendarEvent> {
    const events = await this.listEventsWideWindow();
    const event = events.find((e) => e.id === id);
    if (!event) {
      throw new CliUserError(`Event with ID '${id}' not found.`);
    }
    return mapEvent(event);
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
   * `event` has no first-class "list calendars" command — calendar names are
   * surfaced only as the `calendar` field on each event in `calendar list`.
   * Derive a unique-by-name listing from a wide read window so callers of
   * `calendar_calendars` see every calendar that contains an event. Calendars
   * with zero events in the window won't appear; see
   * `docs/migration-to-event-cli.md` for the workaround.
   */
  async findAllCalendars(): Promise<Calendar[]> {
    const events = await this.listEventsWideWindow();
    const distinct = new Set<string>();
    for (const event of events) {
      if (event.calendar) distinct.add(event.calendar);
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ id: name, title: name }));
  }

  /**
   * When a date range is supplied, scope the listing to that window instead
   * of the default wide window and annotate each calendar with how many
   * events it contributed — this is the only per-calendar signal `event`
   * exposes (it has no EventKit account/identifier info to filter or key
   * on), so counts are grouped by calendar title rather than a stable id.
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
    const args = [
      'calendar',
      'create',
      '--title',
      data.title,
      '--start',
      data.startDate,
      '--end',
      data.endDate,
    ];
    addOptionalArg(args, '--calendar', data.calendar);
    addOptionalArg(args, '--notes', data.notes);
    addOptionalArg(args, '--location', data.location);
    addOptionalArg(args, '--timezone', data.timeZone);
    args.push('--json');
    return executeEventCliJson<EventJSON>(args);
  }

  async updateEvent(data: UpdateEventData): Promise<EventJSON> {
    const args = ['calendar', 'update', '--id', data.id];
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
    const args = ['calendar', 'delete', '--id', id];
    addOptionalArg(args, '--span', mapSpanForEvent(span));
    await executeEventCliPlain(args);
  }
}

export const calendarRepository = new CalendarRepository();

export { CalendarRepository };
