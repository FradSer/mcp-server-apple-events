/**
 * dateUtils.test.ts
 * Tests for date calculation utilities
 */

import {
  formatDateOnly,
  getWeekStart,
  shiftDays,
  toDateOnly,
} from './dateUtils.js';

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

  describe('formatDateOnly', () => {
    it('formats a Date as a zero-padded yyyy-MM-dd string', () => {
      expect(formatDateOnly(new Date(2026, 7, 4))).toBe('2026-08-04');
      expect(formatDateOnly(new Date(2026, 0, 9))).toBe('2026-01-09');
    });
  });

  describe('shiftDays', () => {
    it('returns a new Date shifted by days without mutating the input', () => {
      const date = new Date(2026, 7, 4);
      const shifted = shiftDays(date, 14);
      expect(shifted).toEqual(new Date(2026, 7, 18));
      expect(shifted).not.toBe(date);
      expect(date).toEqual(new Date(2026, 7, 4));
    });

    it('accepts a negative shift for past dates', () => {
      expect(shiftDays(new Date(2026, 7, 24), -14)).toEqual(
        new Date(2026, 7, 10),
      );
    });
  });

  describe('toDateOnly', () => {
    it('trims a time component down to yyyy-MM-dd', () => {
      expect(toDateOnly('2026-08-10 09:30:00')).toBe('2026-08-10');
      expect(toDateOnly('2026-08-10T09:30:00Z')).toBe('2026-08-10');
    });

    it('passes a bare yyyy-MM-dd through unchanged', () => {
      expect(toDateOnly('2026-08-10')).toBe('2026-08-10');
    });

    it('leaves non-matching input untouched (caller validation surfaces the error)', () => {
      expect(toDateOnly('not-a-date')).toBe('not-a-date');
    });
  });
});
