/**
 * dateUtils.test.ts
 * Tests for date calculation utilities
 */

import { getWeekStart } from './dateUtils.js';

describe('getWeekStart', () => {
  // Wednesday, January 17, 2024 at noon
  const FIXED_DATE = new Date('2024-01-17T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_DATE);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('week start behavior', () => {
    it('returns a date at the beginning of the day (midnight)', () => {
      const result = getWeekStart();
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });

    it('returns a date in the past or today (never future)', () => {
      const result = getWeekStart();
      expect(result.getTime()).toBeLessThanOrEqual(FIXED_DATE.getTime());
    });

    it('returns a date within 7 days of the fixed date', () => {
      const result = getWeekStart();
      const daysDiff =
        (FIXED_DATE.getTime() - result.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeLessThan(7);
      expect(daysDiff).toBeGreaterThanOrEqual(0);
    });
  });
});
