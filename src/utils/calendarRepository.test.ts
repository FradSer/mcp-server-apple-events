/**
 * calendarRepository.test.ts
 * Tests for the calendar repository against the vendored `event` CLI.
 *
 * Scenarios are organized by the shapes the repository exposes:
 *   - read by id   → list the backward and forward 4-year windows (EventKit
 *                    caps one predicate at 4 years), then array `.find`
 *   - list events  → `event calendar list --start --end [--calendar] --json`
 *                    with TS-side search/availability filtering
 *   - calendars    → derive distinct calendar names from both wide windows
 *   - create       → `event calendar create` with the trimmed flag set
 *                    (no url / structuredLocation / isAllDay / availability /
 *                    alarms / recurrenceRules)
 *   - update       → `event calendar update` (no cross-calendar move, no span)
 *   - delete       → `event calendar delete --id [--span this|all]`
 */

import type { EventJSON } from '../types/repository.js';
import { calendarRepository } from './calendarRepository.js';
import { executeEventCliJson, executeEventCliPlain } from './eventCli.js';

jest.mock('./eventCli.js');

const mockJson = executeEventCliJson as jest.MockedFunction<
  typeof executeEventCliJson
>;
const mockPlain = executeEventCliPlain as jest.MockedFunction<
  typeof executeEventCliPlain
>;

const eventFixture = (overrides: Partial<EventJSON> = {}): EventJSON =>
  ({
    id: 'evt-1',
    title: 'Meeting',
    calendar: 'Work',
    startDate: '2025-11-04T09:00:00+08:00',
    endDate: '2025-11-04T10:00:00+08:00',
    notes: null,
    location: null,
    url: null,
    isAllDay: false,
    ...overrides,
  }) as EventJSON;

describe('CalendarRepository (event CLI backend)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findEventById', () => {
    it('lists both wide read windows then finds by id', async () => {
      // Backward half, then forward half.
      mockJson.mockResolvedValueOnce([eventFixture()]);
      mockJson.mockResolvedValueOnce([
        eventFixture({
          id: 'evt-2',
          title: 'Lunch',
          startDate: '2025-11-04T12:00:00+08:00',
          endDate: '2025-11-04T13:00:00+08:00',
        }),
      ]);

      const result = await calendarRepository.findEventById('evt-2');

      expect(mockJson).toHaveBeenCalledTimes(2);
      for (const [args] of mockJson.mock.calls) {
        expect(args.slice(0, 2)).toEqual(['calendar', 'list']);
        expect(args).toContain('--start');
        expect(args).toContain('--end');
        expect(args).toContain('--json');
      }
      expect(result.id).toBe('evt-2');
      expect(result.title).toBe('Lunch');
    });

    it("splits at today so neither window exceeds EventKit's 4-year cap", async () => {
      // A single today±4y predicate is silently truncated to its first four
      // years, which hid every future event from id lookup.
      mockJson.mockResolvedValue([]);

      await expect(calendarRepository.findEventById('evt-1')).rejects.toThrow();

      const [past, future] = mockJson.mock.calls.map(([args]) => ({
        start: args[args.indexOf('--start') + 1] as string,
        end: args[args.indexOf('--end') + 1] as string,
      }));
      expect(past!.end).toBe(future!.start);
      const spanYears = (a: string, b: string) =>
        (Date.parse(b) - Date.parse(a)) / (365.2425 * 24 * 60 * 60 * 1000);
      expect(spanYears(past!.start, past!.end)).toBeLessThanOrEqual(4);
      expect(spanYears(future!.start, future!.end)).toBeLessThanOrEqual(4);
      expect(spanYears(past!.start, future!.end)).toBeGreaterThan(7);
    });

    it('deduplicates an event returned by both windows', async () => {
      // Today's events sit on the shared boundary date and come back twice.
      mockJson.mockResolvedValue([eventFixture()]);

      const result = await calendarRepository.findEventById('evt-1');

      expect(result.id).toBe('evt-1');
    });

    it('throws CliUserError when the id is not present in the listing', async () => {
      mockJson.mockResolvedValue([eventFixture()]);

      await expect(calendarRepository.findEventById('missing')).rejects.toThrow(
        "Event with ID 'missing' not found.",
      );
    });
  });

  describe('findEvents', () => {
    it('issues `calendar list --start <today> --end <+14d> --json` when no filters provided', async () => {
      mockJson.mockResolvedValueOnce([]);

      await calendarRepository.findEvents();

      const args = mockJson.mock.calls[0]![0];
      expect(args.slice(0, 2)).toEqual(['calendar', 'list']);
      expect(args[2]).toBe('--start');
      expect(args[4]).toBe('--end');
      expect(args[args.length - 1]).toBe('--json');
    });

    it('passes --calendar when filtered by name', async () => {
      mockJson.mockResolvedValueOnce([]);

      await calendarRepository.findEvents({ calendarName: 'Work' });

      const args = mockJson.mock.calls[0]![0];
      expect(args).toContain('--calendar');
      expect(args[args.indexOf('--calendar') + 1]).toBe('Work');
    });

    it('strips the time component from caller-supplied dates so `event` accepts them', async () => {
      mockJson.mockResolvedValueOnce([]);

      await calendarRepository.findEvents({
        startDate: '2025-11-04 09:00:00',
        endDate: '2025-11-05T12:34:56Z',
      });

      const args = mockJson.mock.calls[0]![0];
      expect(args[args.indexOf('--start') + 1]).toBe('2025-11-04');
      expect(args[args.indexOf('--end') + 1]).toBe('2025-11-05');
    });

    it('applies TS-side search filter against title, notes, and location', async () => {
      mockJson.mockResolvedValueOnce([
        eventFixture({ id: 'a', title: 'Sprint review meeting' }),
        eventFixture({
          id: 'b',
          title: 'Lunch',
          notes: 'sprint planning notes',
        }),
        eventFixture({ id: 'c', title: 'Yoga', location: 'Sprint room A' }),
        eventFixture({ id: 'd', title: 'Unrelated' }),
      ]);

      const results = await calendarRepository.findEvents({ search: 'sprint' });

      expect(results.map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('applies TS-side availability filter', async () => {
      mockJson.mockResolvedValueOnce([
        eventFixture({ id: 'a', availability: 'busy' }),
        eventFixture({ id: 'b', availability: 'free' }),
      ]);

      const results = await calendarRepository.findEvents({
        availability: 'busy',
      });

      expect(results.map((e) => e.id)).toEqual(['a']);
    });
  });

  describe('findAllCalendars', () => {
    it('derives a distinct calendar listing from both wide read windows', async () => {
      mockJson.mockResolvedValueOnce([
        eventFixture({ id: 'a', calendar: 'Work' }),
        eventFixture({ id: 'b', calendar: 'Personal' }),
      ]);
      // A calendar whose only events are in the future must still appear.
      mockJson.mockResolvedValueOnce([
        eventFixture({ id: 'c', calendar: 'Work' }),
        eventFixture({ id: 'd', calendar: 'Family' }),
      ]);

      const result = await calendarRepository.findAllCalendars();

      expect(result.map((c) => c.title).sort()).toEqual([
        'Family',
        'Personal',
        'Work',
      ]);
      // Sorted alphabetically; id mirrors the calendar name.
      expect(result.map((c) => c.id)).toEqual(['Family', 'Personal', 'Work']);
    });

    it('returns an empty array when no events exist in the window', async () => {
      mockJson.mockResolvedValue([]);

      const result = await calendarRepository.findAllCalendars();
      expect(result).toEqual([]);
    });
  });

  describe('findCalendars', () => {
    it('delegates to findAllCalendars when no date range is given', async () => {
      mockJson.mockResolvedValue([eventFixture({ id: 'a', calendar: 'Work' })]);

      const result = await calendarRepository.findCalendars({});

      expect(result).toEqual([{ id: 'Work', title: 'Work' }]);
    });

    it('scopes the listing to the given date range and counts events per calendar title', async () => {
      // `event` has no EventKit calendar identifiers or account info, so
      // counts are grouped by the `calendar` title field on each event.
      mockJson.mockResolvedValueOnce([
        eventFixture({ id: 'event-1', calendar: 'Work' }),
        eventFixture({ id: 'event-2', calendar: 'Work' }),
        eventFixture({ id: 'event-3', calendar: 'Personal' }),
      ]);

      const result = await calendarRepository.findCalendars({
        startDate: '2026-05-04',
        endDate: '2026-05-11',
      });

      const args = mockJson.mock.calls[0]![0];
      expect(args[args.indexOf('--start') + 1]).toBe('2026-05-04');
      expect(args[args.indexOf('--end') + 1]).toBe('2026-05-11');
      expect(result).toEqual([
        { id: 'Personal', title: 'Personal', eventCount: 1 },
        { id: 'Work', title: 'Work', eventCount: 2 },
      ]);
    });

    it('omits calendars with zero events in the scoped window', async () => {
      mockJson.mockResolvedValueOnce([]);

      const result = await calendarRepository.findCalendars({
        startDate: '2026-05-04',
        endDate: '2026-05-11',
      });

      expect(result).toEqual([]);
    });
  });

  describe('createEvent', () => {
    it('passes only the event-supported flag subset', async () => {
      mockJson.mockResolvedValueOnce(eventFixture({ id: 'created' }));

      await calendarRepository.createEvent({
        title: 'New event',
        startDate: '2025-11-04 09:00:00',
        endDate: '2025-11-04 10:00:00',
        calendar: 'Work',
        notes: 'agenda',
        location: 'HQ',
      });

      expect(mockJson).toHaveBeenCalledWith([
        'calendar',
        'create',
        '--title',
        'New event',
        '--start',
        '2025-11-04 09:00:00',
        '--end',
        '2025-11-04 10:00:00',
        '--calendar',
        'Work',
        '--notes',
        'agenda',
        '--location',
        'HQ',
        '--json',
      ]);
    });

    it('preserves all-day formatting when callers pass bare YYYY-MM-DD', async () => {
      mockJson.mockResolvedValueOnce(eventFixture({ id: 'created' }));

      await calendarRepository.createEvent({
        title: 'All-day',
        startDate: '2025-11-04',
        endDate: '2025-11-05',
      });

      const args = mockJson.mock.calls[0]![0];
      expect(args[args.indexOf('--start') + 1]).toBe('2025-11-04');
      expect(args[args.indexOf('--end') + 1]).toBe('2025-11-05');
    });

    it('passes --timezone when provided', async () => {
      mockJson.mockResolvedValueOnce(eventFixture({ id: 'created' }));

      await calendarRepository.createEvent({
        title: 'Timed event',
        startDate: '2025-11-04 09:00:00',
        endDate: '2025-11-04 10:00:00',
        timeZone: 'America/New_York',
      });

      const args = mockJson.mock.calls[0]![0];
      expect(args).toContain('--timezone');
      expect(args[args.indexOf('--timezone') + 1]).toBe('America/New_York');
    });
  });

  describe('updateEvent', () => {
    it('passes only the event-supported flag subset', async () => {
      mockJson.mockResolvedValueOnce(eventFixture({ id: 'evt-1' }));

      await calendarRepository.updateEvent({
        id: 'evt-1',
        title: 'Renamed',
        startDate: '2025-11-04 10:00:00',
        endDate: '2025-11-04 11:00:00',
        location: 'Conference room B',
        notes: 'rescheduled',
      });

      expect(mockJson).toHaveBeenCalledWith([
        'calendar',
        'update',
        '--id',
        'evt-1',
        '--title',
        'Renamed',
        '--start',
        '2025-11-04 10:00:00',
        '--end',
        '2025-11-04 11:00:00',
        '--location',
        'Conference room B',
        '--notes',
        'rescheduled',
        '--json',
      ]);
    });

    it('passes --timezone when provided', async () => {
      mockJson.mockResolvedValueOnce(eventFixture({ id: 'evt-1' }));

      await calendarRepository.updateEvent({
        id: 'evt-1',
        title: 'Renamed',
        timeZone: 'Asia/Shanghai',
      });

      const args = mockJson.mock.calls[0]![0];
      expect(args).toContain('--timezone');
      expect(args[args.indexOf('--timezone') + 1]).toBe('Asia/Shanghai');
    });
  });

  describe('deleteEvent', () => {
    it('maps schema span values onto event-CLI spans', async () => {
      mockPlain.mockResolvedValue('Event deleted successfully');

      await calendarRepository.deleteEvent('evt-1', 'this-event');
      expect(mockPlain).toHaveBeenLastCalledWith([
        'calendar',
        'delete',
        '--id',
        'evt-1',
        '--span',
        'this',
      ]);

      await calendarRepository.deleteEvent('evt-2', 'future-events');
      expect(mockPlain).toHaveBeenLastCalledWith([
        'calendar',
        'delete',
        '--id',
        'evt-2',
        '--span',
        'all',
      ]);
    });

    it('omits --span when none is provided', async () => {
      mockPlain.mockResolvedValueOnce('Event deleted successfully');

      await calendarRepository.deleteEvent('evt-3');

      expect(mockPlain).toHaveBeenCalledWith([
        'calendar',
        'delete',
        '--id',
        'evt-3',
      ]);
    });
  });
});
