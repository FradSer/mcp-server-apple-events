/**
 * timeHelpers.test.ts
 * Tests for time formatting and context utilities
 */

import {
  formatRelativeTime,
  getFuzzyTimeSuggestions,
  getTimeContext,
} from './timeHelpers.js';

describe('timeHelpers', () => {
  describe('getTimeContext', () => {
    it('should return complete time context', () => {
      const context = getTimeContext();

      // Verify all required fields exist
      expect(context).toHaveProperty('currentDateTime');
      expect(context).toHaveProperty('currentDate');
      expect(context).toHaveProperty('currentTime');
      expect(context).toHaveProperty('dayOfWeek');
      expect(context).toHaveProperty('isWorkingHours');
      expect(context).toHaveProperty('timeOfDay');
      expect(context).toHaveProperty('timeDescription');

      // Verify data formats
      expect(context.currentDateTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
      expect(context.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(context.currentTime).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof context.isWorkingHours).toBe('boolean');
      expect(['morning', 'afternoon', 'evening', 'night']).toContain(
        context.timeOfDay,
      );
      expect(context.dayOfWeek).toMatch(
        /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/,
      );
      expect(context.timeDescription).toContain(context.dayOfWeek);
    });

    it('should include working hours status in description', () => {
      const context = getTimeContext();

      if (context.isWorkingHours) {
        expect(context.timeDescription).toContain('working hours');
      } else {
        expect(context.timeDescription).toContain('outside working hours');
      }
    });

    it('should include time of day in description', () => {
      const context = getTimeContext();
      expect(context.timeDescription).toContain(context.timeOfDay);
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // Mock current time for consistent testing
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should format time for today', () => {
      const now = new Date('2024-01-15T10:30:00');
      jest.setSystemTime(now);

      const todayTime = new Date('2024-01-15T14:00:00');
      const result = formatRelativeTime(todayTime);

      expect(result).toBe('today at 2:00 PM');
    });

    it('should format time for tomorrow', () => {
      const now = new Date('2024-01-15T10:30:00');
      jest.setSystemTime(now);

      const tomorrowTime = new Date('2024-01-16T09:00:00');
      const result = formatRelativeTime(tomorrowTime);

      expect(result).toBe('tomorrow at 9:00 AM');
    });

    it('should format time for future dates', () => {
      const now = new Date('2024-01-15T10:30:00');
      jest.setSystemTime(now);

      const futureTime = new Date('2024-01-20T15:30:00');
      const result = formatRelativeTime(futureTime);

      expect(result).toBe('Sat, Jan 20, 3:30 PM');
    });
  });

  describe('getFuzzyTimeSuggestions', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should provide fuzzy time suggestions during working hours', () => {
      const now = new Date('2024-01-15T10:00:00'); // 10 AM Monday
      jest.setSystemTime(now);

      const suggestions = getFuzzyTimeSuggestions();

      expect(suggestions).toHaveProperty('laterToday');
      expect(suggestions).toHaveProperty('tomorrow');
      expect(suggestions).toHaveProperty('endOfWeek');
      expect(suggestions).toHaveProperty('nextWeek');

      // Later today should be within working hours
      expect(suggestions.laterToday).toContain('today at');
      expect(suggestions.tomorrow).toContain('tomorrow at');
      expect(suggestions.endOfWeek).toContain('Fri, Jan 19');
      expect(suggestions.nextWeek).toContain('Mon, Jan 22');
    });

    it('should handle late evening times correctly', () => {
      const now = new Date('2024-01-15T20:00:00'); // 8 PM Monday
      jest.setSystemTime(now);

      const suggestions = getFuzzyTimeSuggestions();

      // Later today should be capped at 5 PM if it's already past
      expect(suggestions.laterToday).toContain('today at');
      expect(suggestions.tomorrow).toContain('tomorrow at');
    });

    it('should handle weekend times correctly', () => {
      const now = new Date('2024-01-13T10:00:00'); // 10 AM Saturday
      jest.setSystemTime(now);

      const suggestions = getFuzzyTimeSuggestions();

      // End of week should be Friday
      expect(suggestions.endOfWeek).toContain('Fri, Jan 19');
    });
  });

  describe('TimeContext consistency', () => {
    it('should provide consistent date information across all fields', () => {
      const context = getTimeContext();

      // currentDate should be in YYYY-MM-DD format (local timezone)
      expect(context.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Verify currentDate uses local timezone (may differ from UTC date)
      const now = new Date();
      const expectedLocalDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(context.currentDate).toBe(expectedLocalDate);

      // currentDateTime should be in ISO format (UTC)
      expect(context.currentDateTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );

      // Current time should be in valid 24-hour format
      expect(context.currentTime).toMatch(/^\d{2}:\d{2}$/);
      expect(
        parseInt(context.currentTime.split(':')[0]!, 10),
      ).toBeGreaterThanOrEqual(0);
      expect(parseInt(context.currentTime.split(':')[0]!, 10)).toBeLessThan(24);
      expect(
        parseInt(context.currentTime.split(':')[1]!, 10),
      ).toBeGreaterThanOrEqual(0);
      expect(parseInt(context.currentTime.split(':')[1]!, 10)).toBeLessThan(60);
    });
  });

  describe('getTimeContext timeOfDay categorization', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should categorize early morning as morning', () => {
      const now = new Date('2024-01-15T05:30:00');
      jest.setSystemTime(now);

      const context = getTimeContext();

      expect(context.timeOfDay).toBe('morning');
      expect(context.timeDescription).toContain('morning');
    });

    it('should categorize midday as afternoon', () => {
      const now = new Date('2024-01-15T13:00:00');
      jest.setSystemTime(now);

      const context = getTimeContext();

      expect(context.timeOfDay).toBe('afternoon');
      expect(context.timeDescription).toContain('afternoon');
    });

    it('should categorize late afternoon as evening', () => {
      const now = new Date('2024-01-15T18:00:00');
      jest.setSystemTime(now);

      const context = getTimeContext();

      expect(context.timeOfDay).toBe('evening');
      expect(context.timeDescription).toContain('evening');
    });

    it('should categorize late night as night', () => {
      const now = new Date('2024-01-15T23:00:00');
      jest.setSystemTime(now);

      const context = getTimeContext();

      expect(context.timeOfDay).toBe('night');
      expect(context.timeDescription).toContain('night');
    });

    it('should include working hours status in night description', () => {
      const now = new Date('2024-01-15T22:00:00');
      jest.setSystemTime(now);

      const context = getTimeContext();

      expect(context.isWorkingHours).toBe(false);
      expect(context.timeDescription).toContain('outside working hours');
    });
  });
});
