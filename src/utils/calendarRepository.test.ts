/**
 * calendarRepository.test.ts
 * Tests for calendar repository
 */

import type { Calendar, CalendarEvent } from '../types/index.js';
import { calendarRepository } from './calendarRepository.js';
import { executeCli } from './cliExecutor.js';

// Mock dependencies
jest.mock('./cliExecutor.js');

const mockExecuteCli = executeCli as jest.MockedFunction<typeof executeCli>;
const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('CalendarRepository', () => {
  const repository = calendarRepository;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findEventById', () => {
    it('should return event when found', async () => {
      const mockEvents: Partial<CalendarEvent>[] = [
        {
          id: '1',
          title: 'Meeting',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          calendar: 'Work',
          isAllDay: false,
        },
        {
          id: '2',
          title: 'Lunch',
          startDate: '2025-11-04T12:00:00+08:00',
          endDate: '2025-11-04T13:00:00+08:00',
          calendar: 'Personal',
          isAllDay: false,
        },
      ];

      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: mockEvents,
      });

      const result = await repository.findEventById('2');

      // findEventById widens the read window to ~4 years either side of
      // today so events far outside the default 14-day range can still be
      // located by id. We only assert the shape of the args; the actual
      // start/end dates are derived from `new Date()` and would be brittle
      // to pin down.
      expect(mockExecuteCli).toHaveBeenCalledTimes(1);
      const args = mockExecuteCli.mock.calls[0][0];
      expect(args.slice(0, 2)).toEqual(['--action', 'read-events']);
      expect(args).toContain('--startDate');
      expect(args).toContain('--endDate');

      expect(result).toEqual({
        id: '2',
        title: 'Lunch',
        startDate: '2025-11-04T12:00:00+08:00',
        endDate: '2025-11-04T13:00:00+08:00',
        calendar: 'Personal',
        isAllDay: false,
        notes: undefined,
        location: undefined,
        url: undefined,
      });
    });

    it('supports availability values returned by Swift', async () => {
      const availability: CalendarEvent['availability'] = 'unknown';
      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: [
          {
            id: '1',
            title: 'Event',
            startDate: '2025-11-04T09:00:00+08:00',
            endDate: '2025-11-04T10:00:00+08:00',
            calendar: 'Work',
            isAllDay: false,
            availability,
          },
        ],
      });

      const result = await repository.findEventById('1');
      expect(result.availability).toBe('unknown');
    });

    it('should throw error when event not found', async () => {
      const mockEvents: Partial<CalendarEvent>[] = [
        {
          id: '1',
          title: 'Meeting',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          calendar: 'Work',
          isAllDay: false,
        },
      ];

      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: mockEvents,
      });

      await expect(repository.findEventById('999')).rejects.toThrow(
        "Event with ID '999' not found.",
      );
    });
  });

  describe('findEvents', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return all events when no filters provided', async () => {
      const mockEvents: Partial<CalendarEvent>[] = [
        {
          id: '1',
          title: 'Event 1',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          calendar: 'Work',
          isAllDay: false,
        },
      ];

      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: mockEvents,
      });

      const result = await repository.findEvents();

      expect(result).toHaveLength(1);
    });

    it('should default date range to today through 14 days ahead when no dates are provided', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-19T12:00:00Z'));
      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: [],
      });

      await repository.findEvents();

      const expectedStart = formatLocalDate(new Date('2026-02-19T12:00:00Z'));
      const expectedEndDate = new Date('2026-02-19T12:00:00Z');
      expectedEndDate.setDate(expectedEndDate.getDate() + 14);
      const expectedEnd = formatLocalDate(expectedEndDate);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read-events',
        '--startDate',
        expectedStart,
        '--endDate',
        expectedEnd,
      ]);
    });

    it('should derive endDate as 14 days after startDate when only startDate is provided', async () => {
      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: [],
      });

      await repository.findEvents({ startDate: '2026-02-11' });

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read-events',
        '--startDate',
        '2026-02-11',
        '--endDate',
        '2026-02-25',
      ]);
    });

    it('should derive startDate as 14 days before endDate when only endDate is provided', async () => {
      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: [],
      });

      await repository.findEvents({ endDate: '2026-02-25' });

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read-events',
        '--startDate',
        '2026-02-11',
        '--endDate',
        '2026-02-25',
      ]);
    });

    it('should filter events by calendar name', async () => {
      const mockEvents: Partial<CalendarEvent>[] = [
        {
          id: '1',
          title: 'Work Event',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          calendar: 'Work',
          isAllDay: false,
        },
      ];

      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: mockEvents,
      });

      jest.useFakeTimers().setSystemTime(new Date('2026-02-19T12:00:00Z'));
      await repository.findEvents({ calendarName: 'Work' });

      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining(['--filterCalendar', 'Work']),
      );
      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining([
          '--startDate',
          formatLocalDate(new Date('2026-02-19T12:00:00Z')),
          '--endDate',
          '2026-03-05',
        ]),
      );
    });

    it('should filter events by date range', async () => {
      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: [],
      });

      await repository.findEvents({
        startDate: '2025-11-04 00:00:00',
        endDate: '2025-11-05 23:59:59',
      });

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read-events',
        '--startDate',
        '2025-11-04 00:00:00',
        '--endDate',
        '2025-11-05 23:59:59',
      ]);
    });

    it('should filter events by search term', async () => {
      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: [],
      });

      jest.useFakeTimers().setSystemTime(new Date('2026-02-19T12:00:00Z'));
      await repository.findEvents({ search: 'meeting' });

      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining(['--search', 'meeting']),
      );
      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining([
          '--startDate',
          formatLocalDate(new Date('2026-02-19T12:00:00Z')),
          '--endDate',
          '2026-03-05',
        ]),
      );
    });
  });

  describe('findAllCalendars', () => {
    it('should return all calendars', async () => {
      const mockCalendars: Calendar[] = [
        { id: '1', title: 'Work', account: 'Google', accountType: 'caldav' },
        {
          id: '2',
          title: 'Personal',
          account: 'iCloud',
          accountType: 'caldav',
        },
      ];

      mockExecuteCli.mockResolvedValue(mockCalendars);

      const result = await repository.findAllCalendars();

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read-calendars',
      ]);
      expect(result).toEqual(mockCalendars);
    });
  });

  describe('findEvents with filterAccount', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('should pass filterAccount to CLI', async () => {
      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: [],
      });

      jest.useFakeTimers().setSystemTime(new Date('2026-02-19T12:00:00Z'));
      await repository.findEvents({ accountName: 'Google' });

      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining(['--filterAccount', 'Google']),
      );
      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining([
          '--startDate',
          formatLocalDate(new Date('2026-02-19T12:00:00Z')),
          '--endDate',
          '2026-03-05',
        ]),
      );
    });
  });

  describe('createEvent', () => {
    it('should create event with all fields', async () => {
      const mockEvent: CalendarEvent = {
        id: 'new-1',
        title: 'New Event',
        startDate: '2025-11-04T14:00:00+08:00',
        endDate: '2025-11-04T16:00:00+08:00',
        calendar: 'Work',
        notes: 'Some notes',
        location: 'Office',
        url: 'https://example.com',
        isAllDay: false,
      };

      mockExecuteCli.mockResolvedValue(mockEvent);

      const result = await repository.createEvent({
        title: 'New Event',
        startDate: '2025-11-04 14:00:00',
        endDate: '2025-11-04 16:00:00',
        calendar: 'Work',
        notes: 'Some notes',
        location: 'Office',
        url: 'https://example.com',
        isAllDay: false,
      });

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'create-event',
        '--title',
        'New Event',
        '--startDate',
        '2025-11-04 14:00:00',
        '--endDate',
        '2025-11-04 16:00:00',
        '--targetCalendar',
        'Work',
        '--note',
        'Some notes',
        '--location',
        'Office',
        '--url',
        'https://example.com',
        '--isAllDay',
        'false',
      ]);
      expect(result).toEqual(mockEvent);
    });

    it('should create event with minimal fields', async () => {
      const mockEvent: CalendarEvent = {
        id: 'new-2',
        title: 'Simple Event',
        startDate: '2025-11-04T10:00:00+08:00',
        endDate: '2025-11-04T11:00:00+08:00',
        calendar: 'Personal',
        isAllDay: false,
      };

      mockExecuteCli.mockResolvedValue(mockEvent);

      const result = await repository.createEvent({
        title: 'Simple Event',
        startDate: '2025-11-04 10:00:00',
        endDate: '2025-11-04 11:00:00',
      });

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'create-event',
        '--title',
        'Simple Event',
        '--startDate',
        '2025-11-04 10:00:00',
        '--endDate',
        '2025-11-04 11:00:00',
      ]);
      expect(result).toEqual(mockEvent);
    });

    it('should create all-day event', async () => {
      const mockEvent: CalendarEvent = {
        id: 'new-3',
        title: 'All Day Event',
        startDate: '2025-11-04T00:00:00+08:00',
        endDate: '2025-11-04T23:59:59+08:00',
        calendar: 'Personal',
        isAllDay: true,
      };

      mockExecuteCli.mockResolvedValue(mockEvent);

      await repository.createEvent({
        title: 'All Day Event',
        startDate: '2025-11-04 00:00:00',
        endDate: '2025-11-04 23:59:59',
        isAllDay: true,
      });

      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining(['--isAllDay', 'true']),
      );
    });
  });

  describe('updateEvent', () => {
    it('should update event with provided fields', async () => {
      const mockEvent: CalendarEvent = {
        id: '1',
        title: 'Updated Event',
        startDate: '2025-11-04T15:00:00+08:00',
        endDate: '2025-11-04T17:00:00+08:00',
        calendar: 'Work',
        isAllDay: false,
      };

      mockExecuteCli.mockResolvedValue(mockEvent);

      const result = await repository.updateEvent({
        id: '1',
        title: 'Updated Event',
        startDate: '2025-11-04 15:00:00',
        endDate: '2025-11-04 17:00:00',
      });

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'update-event',
        '--id',
        '1',
        '--title',
        'Updated Event',
        '--startDate',
        '2025-11-04 15:00:00',
        '--endDate',
        '2025-11-04 17:00:00',
      ]);
      expect(result).toEqual(mockEvent);
    });

    it('sends empty structuredLocation to clear it', async () => {
      mockExecuteCli.mockResolvedValue({
        id: '1',
        title: 'Event',
        startDate: '2025-11-04T09:00:00+08:00',
        endDate: '2025-11-04T10:00:00+08:00',
        calendar: 'Personal',
        isAllDay: false,
      });

      await repository.updateEvent({
        id: '1',
        structuredLocation: null,
      });

      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining(['--structuredLocation', '']),
      );
    });

    it('should update event calendar', async () => {
      mockExecuteCli.mockResolvedValue({
        id: '1',
        title: 'Event',
        startDate: '2025-11-04T09:00:00+08:00',
        endDate: '2025-11-04T10:00:00+08:00',
        calendar: 'Personal',
        isAllDay: false,
      });

      await repository.updateEvent({
        id: '1',
        calendar: 'Personal',
      });

      expect(mockExecuteCli).toHaveBeenCalledWith(
        expect.arrayContaining(['--targetCalendar', 'Personal']),
      );
    });
  });

  describe('deleteEvent', () => {
    it('should delete event by id', async () => {
      mockExecuteCli.mockResolvedValue({});

      await repository.deleteEvent('1');

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'delete-event',
        '--id',
        '1',
      ]);
    });
  });
});
