/**
 * dateFiltering.test.ts
 * Tests for date filtering utilities
 */

import type { Reminder } from '../types/index.js';
import { applyReminderFilters, type ReminderFilters } from './dateFiltering.js';

/**
 * Factory function to create test reminders with sensible defaults
 */
function createReminder(
  overrides: Partial<Reminder> & { id: string; title: string },
): Reminder {
  return {
    list: 'Default',
    isCompleted: false,
    priority: 0,
    ...overrides,
  };
}

const DEFAULT_TZ = process.env.TZ;
const MOCK_NOW_ISO = '2024-01-15T12:00:00.000Z';
const RealDate = global.Date;

const restoreDefaultTimezone = () => {
  if (DEFAULT_TZ) {
    process.env.TZ = DEFAULT_TZ;
  } else {
    delete process.env.TZ;
  }
};

const installDateMock = () => {
  const mockNow = new RealDate(MOCK_NOW_ISO);

  global.Date = class extends RealDate {
    constructor(...args: ConstructorParameters<typeof RealDate>) {
      if (args.length === (0 as number)) {
        super(mockNow);
      } else {
        super(...args);
      }
    }

    static now(): number {
      return mockNow.getTime();
    }
  } as typeof global.Date;
};

const resetDateMock = () => {
  global.Date = RealDate;
  installDateMock();
};

const setTimezoneAndResetDateMock = (tz: string) => {
  process.env.TZ = tz;
  resetDateMock();
};

describe('DateFiltering', () => {
  beforeEach(() => {
    resetDateMock();
  });

  afterEach(() => {
    restoreDefaultTimezone();
    global.Date = RealDate;
  });

  describe('applyReminderFilters', () => {
    const reminders: Reminder[] = [
      createReminder({ id: '1', title: 'Active reminder' }),
      createReminder({
        id: '2',
        title: 'Completed reminder',
        isCompleted: true,
      }),
      createReminder({ id: '3', title: 'Work reminder', list: 'Work' }),
      createReminder({
        id: '4',
        title: 'Project meeting',
        list: 'Work',
        notes: 'Discuss project timeline',
      }),
      createReminder({
        id: '5',
        title: 'Personal task',
        list: 'Personal',
        dueDate: '2024-01-15T10:00:00Z',
      }),
    ];

    it('should filter by completion status', () => {
      const filters: ReminderFilters = { showCompleted: false };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(4);
      expect(result.every((r) => !r.isCompleted)).toBe(true);
    });

    it('should include completed reminders when showCompleted is true', () => {
      const filters: ReminderFilters = { showCompleted: true };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(5);
    });

    it('should filter by list', () => {
      const filters: ReminderFilters = { list: 'Work' };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(2);
      expect(result.every((r) => r.list === 'Work')).toBe(true);
    });

    it('should filter by search term in title', () => {
      const filters: ReminderFilters = { search: 'meeting' };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('should filter by search term in notes', () => {
      const filters: ReminderFilters = { search: 'timeline' };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('should filter by due date', () => {
      const filters: ReminderFilters = { dueWithin: 'today' };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('5');
    });

    it('should apply multiple filters together', () => {
      const filters: ReminderFilters = {
        list: 'Work',
        showCompleted: false,
        search: 'project',
      };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('should return all reminders when no filters applied', () => {
      const filters: ReminderFilters = {};
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(5);
    });

    it('should handle empty reminder list', () => {
      const filters: ReminderFilters = { search: 'test' };
      const result = applyReminderFilters([], filters);

      expect(result).toHaveLength(0);
    });

    it('should be case insensitive for search', () => {
      const filters: ReminderFilters = { search: 'PROJECT' };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('4');
    });

    it('should filter reminders with no due date', () => {
      const filters: ReminderFilters = { dueWithin: 'no-date' };
      const result = applyReminderFilters(reminders, filters);

      expect(result).toHaveLength(4);
      expect(result.every((r) => !r.dueDate)).toBe(true);
    });

    it('should filter overdue reminders', () => {
      const overdueReminders: Reminder[] = [
        createReminder({
          id: '1',
          title: 'Overdue task',
          dueDate: '2024-01-10T10:00:00Z',
        }),
        createReminder({
          id: '2',
          title: 'Current task',
          dueDate: '2024-01-15T10:00:00Z',
        }),
        createReminder({
          id: '3',
          title: 'Future task',
          dueDate: '2024-01-20T10:00:00Z',
        }),
      ];

      const filters: ReminderFilters = { dueWithin: 'overdue' };
      const result = applyReminderFilters(overdueReminders, filters);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should filter tomorrow reminders', () => {
      const tomorrowReminders: Reminder[] = [
        createReminder({
          id: '1',
          title: 'Today task',
          dueDate: '2024-01-15T10:00:00Z',
        }),
        createReminder({
          id: '2',
          title: 'Tomorrow task',
          dueDate: '2024-01-16T10:00:00Z',
        }),
        createReminder({
          id: '3',
          title: 'Day after tomorrow task',
          dueDate: '2024-01-17T10:00:00Z',
        }),
      ];

      const filters: ReminderFilters = { dueWithin: 'tomorrow' };
      const result = applyReminderFilters(tomorrowReminders, filters);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should filter this-week reminders using calendar week boundaries', () => {
      // Mock now is 2024-01-15 (Monday). Calendar week (Sunday start) is Jan 14–20.
      const weekReminders: Reminder[] = [
        createReminder({
          id: '1',
          title: 'Last week task',
          dueDate: '2024-01-08T10:00:00Z',
        }),
        createReminder({
          id: '2',
          title: 'Earlier this week (Sunday)',
          dueDate: '2024-01-14T10:00:00Z',
        }),
        createReminder({
          id: '3',
          title: 'This week task',
          dueDate: '2024-01-17T10:00:00Z',
        }),
        createReminder({
          id: '4',
          title: 'Next week task',
          dueDate: '2024-01-25T10:00:00Z',
        }),
      ];

      const filters: ReminderFilters = { dueWithin: 'this-week' };
      const result = applyReminderFilters(weekReminders, filters);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('2');
      expect(result[1].id).toBe('3');
    });

    it('should handle unknown dueWithin filter (default branch)', () => {
      const allReminders: Reminder[] = [
        createReminder({
          id: '1',
          title: 'Any reminder',
          dueDate: '2024-01-15T10:00:00Z',
        }),
        createReminder({
          id: '2',
          title: 'Another reminder',
          dueDate: '2024-01-16T10:00:00Z',
        }),
      ];

      // Testing unknown filter value - using type assertion to bypass type checking
      const filters = {
        dueWithin: 'unknown-filter' as unknown,
      } as ReminderFilters;
      const result = applyReminderFilters(allReminders, filters);

      // Should return all reminders with due dates (default branch behavior)
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual(['1', '2']);
    });

    describe('timezone handling for floating dates', () => {
      it('should treat YYYY-MM-DD due dates as today for America/New_York timezone', () => {
        setTimezoneAndResetDateMock('America/New_York');
        const floatingReminders: Reminder[] = [
          createReminder({
            id: 'floating-date',
            title: 'Floating date',
            dueDate: '2024-01-15',
          }),
        ];

        const result = applyReminderFilters(floatingReminders, {
          dueWithin: 'today',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('floating-date');
      });

      it('should treat local datetime strings without timezone as today for America/New_York timezone', () => {
        setTimezoneAndResetDateMock('America/New_York');
        const floatingDateTimeReminders: Reminder[] = [
          createReminder({
            id: 'floating-datetime',
            title: 'Floating datetime',
            dueDate: '2024-01-15 09:30:00',
          }),
        ];

        const result = applyReminderFilters(floatingDateTimeReminders, {
          dueWithin: 'today',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('floating-datetime');
      });
    });
  });
});
