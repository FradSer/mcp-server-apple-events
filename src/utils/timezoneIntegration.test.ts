/**
 * timezoneIntegration.test.ts
 * Integration tests for timezone handling across TypeScript and the `event`
 * Swift CLI.
 *
 * The TS layer (Repository) is a pass-through for date strings: it must not
 * coerce, reformat, or shift zones. These tests assert that property for both
 * reminder dueDate / startDate and calendar event start/endDate, since the
 * actual timezone semantics are implemented in `event`'s Swift code.
 */

import type { CalendarEvent, Reminder } from '../types/index.js';
import { calendarRepository } from './calendarRepository.js';
import { executeEventCliJson } from './eventCli.js';
import { reminderRepository } from './reminderRepository.js';

jest.mock('./eventCli.js');
const mockJson = executeEventCliJson as jest.MockedFunction<
  typeof executeEventCliJson
>;

describe('Timezone Data Passthrough Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Reminder date handling', () => {
    it('passes through dueDate strings from the event CLI without modification', async () => {
      const testCases = [
        '2025-11-15T08:30:00Z',
        '2025-11-15T16:30:00+08:00',
        '2025-11-15 16:30:00',
        '2025-11-15',
      ];

      const reminders: Partial<Reminder>[] = testCases.map((date, index) => ({
        id: `rem-${index}`,
        title: `Reminder ${index}`,
        isCompleted: false,
        list: 'Default',
        dueDate: date,
      }));
      mockJson.mockResolvedValueOnce(reminders);

      const results = await reminderRepository.findReminders();

      expect(results).toHaveLength(testCases.length);
      results.forEach((reminder, index) => {
        expect(reminder.dueDate).toBe(testCases[index]);
      });
    });
  });

  describe('Calendar event date handling', () => {
    it('passes through start/end strings from the event CLI without modification', async () => {
      const testCases = [
        { start: '2025-11-15T08:30:00Z', end: '2025-11-15T09:30:00Z' },
        {
          start: '2025-11-15T16:30:00+08:00',
          end: '2025-11-15T17:30:00+08:00',
        },
      ];

      const events: Partial<CalendarEvent>[] = testCases.map(
        (dates, index) => ({
          id: `evt-${index}`,
          title: `Event ${index}`,
          startDate: dates.start,
          endDate: dates.end,
          calendar: 'Work',
          isAllDay: false,
        }),
      );
      mockJson.mockResolvedValueOnce(events);

      const results = await calendarRepository.findEvents();

      expect(results).toHaveLength(testCases.length);
      results.forEach((event, index) => {
        expect(event.startDate).toBe(testCases[index]?.start);
        expect(event.endDate).toBe(testCases[index]?.end);
      });
    });
  });
});
