/**
 * timezoneIntegration.test.ts
 * Integration tests for timezone handling across TypeScript and Swift layers
 *
 * Since the TypeScript layer (Repository) is designed to be a pass-through for date strings,
 * these tests primarily verify that the Repository layer does NOT modify the date strings
 * returned by the Swift CLI. Actual timezone logic resides in the Swift layer.
 */

import type { CalendarEvent, Reminder } from '../types/index.js';
import { calendarRepository } from './calendarRepository.js';
import { executeCli } from './cliExecutor.js';
import { reminderRepository } from './reminderRepository.js';

// Mock CLI executor
jest.mock('./cliExecutor.js');
const mockExecuteCli = executeCli as jest.MockedFunction<typeof executeCli>;

describe('Timezone Data Passthrough Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Reminder Date Handling', () => {
    it('should pass through date strings from CLI without modification', async () => {
      // Test various formats that might be returned by Swift CLI
      const testCases = [
        '2025-11-15T08:30:00Z', // UTC
        '2025-11-15T16:30:00+08:00', // Offset
        '2025-11-15 16:30:00', // Local
        '2025-11-15', // Date only
      ];

      const mockReminders: Partial<Reminder>[] = testCases.map(
        (date, index) => ({
          id: `rem-${index}`,
          title: `Reminder ${index}`,
          isCompleted: false,
          list: 'Default',
          dueDate: date,
        }),
      );

      mockExecuteCli.mockResolvedValue({
        reminders: mockReminders,
        lists: [],
      });

      const results = await reminderRepository.findReminders();

      expect(results).toHaveLength(testCases.length);
      results.forEach((reminder, index) => {
        expect(reminder.dueDate).toBe(testCases[index]);
      });
    });
  });

  describe('Calendar Event Date Handling', () => {
    it('should pass through start and end date strings from CLI without modification', async () => {
      const testCases = [
        {
          start: '2025-11-15T08:30:00Z',
          end: '2025-11-15T09:30:00Z',
        },
        {
          start: '2025-11-15T16:30:00+08:00',
          end: '2025-11-15T17:30:00+08:00',
        },
      ];

      const mockEvents: Partial<CalendarEvent>[] = testCases.map(
        (dates, index) => ({
          id: `evt-${index}`,
          title: `Event ${index}`,
          startDate: dates.start,
          endDate: dates.end,
          calendar: 'Work',
          isAllDay: false,
        }),
      );

      mockExecuteCli.mockResolvedValue({
        calendars: [],
        events: mockEvents,
      });

      const results = await calendarRepository.findEvents();

      expect(results).toHaveLength(testCases.length);
      results.forEach((event, index) => {
        expect(event.startDate).toBe(testCases[index]?.start);
        expect(event.endDate).toBe(testCases[index]?.end);
      });
    });
  });
});
