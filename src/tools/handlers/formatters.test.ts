/**
 * formatters.test.ts
 * Tests for the shared reminder/event formatter helpers. Both
 * `reminderHandlers` and `calendarHandlers` consume these, so the contract
 * here is asserted independently of either handler's wiring.
 */

import type {
  Alarm,
  LocationTrigger,
  RecurrenceRule,
} from '../../types/index.js';
import {
  formatAlarm,
  formatLocationTrigger,
  formatRecurrence,
  formatRecurrenceRules,
} from './formatters.js';

describe('formatRecurrence', () => {
  it('renders weekly recurrence with day-of-week labels', () => {
    const rule: RecurrenceRule = {
      frequency: 'weekly',
      interval: 2,
      daysOfWeek: [2, 4, 6],
    };
    expect(formatRecurrence(rule)).toBe('every 2 weeks on Mon, Wed, Fri');
  });

  it('renders daily with no interval prefix when interval is 1', () => {
    expect(formatRecurrence({ frequency: 'daily', interval: 1 })).toBe('day');
  });

  it('renders monthly with days-of-month list', () => {
    expect(
      formatRecurrence({
        frequency: 'monthly',
        interval: 1,
        daysOfMonth: [1, 15],
      }),
    ).toBe('month on days 1, 15');
  });

  it('renders yearly with months-of-year list', () => {
    expect(
      formatRecurrence({
        frequency: 'yearly',
        interval: 1,
        monthsOfYear: [1, 6, 12],
      }),
    ).toBe('year in Jan, Jun, Dec');
  });

  it('appends an end-date "until" clause', () => {
    expect(
      formatRecurrence({
        frequency: 'daily',
        interval: 1,
        endDate: '2026-01-01',
      }),
    ).toBe('day until 2026-01-01');
  });

  it('appends an occurrence-count clause when no end date is set', () => {
    expect(
      formatRecurrence({
        frequency: 'weekly',
        interval: 1,
        occurrenceCount: 10,
      }),
    ).toBe('week (10 times)');
  });

  it('handles minutely and hourly frequencies', () => {
    expect(formatRecurrence({ frequency: 'minutely', interval: 5 })).toBe(
      'every 5 minutes',
    );
    expect(formatRecurrence({ frequency: 'hourly', interval: 1 })).toBe('hour');
  });
});

describe('formatRecurrenceRules', () => {
  it('returns the single formatted rule for a 1-element array', () => {
    expect(formatRecurrenceRules([{ frequency: 'daily', interval: 1 }])).toBe(
      'day',
    );
  });

  it('joins multiple rules with "; "', () => {
    expect(
      formatRecurrenceRules([
        { frequency: 'daily', interval: 1 },
        { frequency: 'weekly', interval: 1, daysOfWeek: [2] },
      ]),
    ).toBe('day; week on Mon');
  });
});

describe('formatLocationTrigger', () => {
  it('renders "Arriving at" for enter proximity with radius', () => {
    const loc: LocationTrigger = {
      title: 'Home',
      latitude: 1,
      longitude: 1,
      radius: 100,
      proximity: 'enter',
    };
    expect(formatLocationTrigger(loc)).toBe('Arriving at "Home" (100m radius)');
  });

  it('renders "Leaving" for leave proximity without radius', () => {
    expect(
      formatLocationTrigger({
        title: 'Office',
        latitude: 0,
        longitude: 0,
        proximity: 'leave',
      }),
    ).toBe('Leaving "Office"');
  });
});

describe('formatAlarm', () => {
  it('renders absolute-date alarms with their date string', () => {
    expect(formatAlarm({ absoluteDate: '2026-01-01T09:00:00Z' } as Alarm)).toBe(
      'at 2026-01-01T09:00:00Z',
    );
  });

  it('renders relative-offset alarms with seconds units', () => {
    expect(formatAlarm({ relativeOffset: -300 } as Alarm)).toBe(
      '-300s from due/start',
    );
  });

  it('renders location-triggered alarms with the trigger phrase', () => {
    expect(
      formatAlarm({
        locationTrigger: {
          title: 'Home',
          latitude: 0,
          longitude: 0,
          proximity: 'enter',
        },
      } as Alarm),
    ).toBe('on Arriving at "Home"');
  });

  it('appends the alarm type when present', () => {
    expect(
      formatAlarm({
        absoluteDate: '2026-01-01',
        alarmType: 'audio',
      } as Alarm),
    ).toBe('at 2026-01-01 (audio)');
  });

  it('returns "unknown" when no trigger fields are present', () => {
    expect(formatAlarm({} as Alarm)).toBe('unknown');
  });
});
