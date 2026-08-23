/**
 * icalendarExdate.test.ts
 *
 * Excepting a single occurrence of a recurring series.
 *
 * EventKit resolves a series by id to its master, whose occurrence date is its
 * own DTSTART, so the MCP can only ever except that one date — every other
 * occurrence is unaddressable and the call no-ops while reporting success.
 * EXDATE is the underlying primitive and can name any date, so writing it
 * directly is what makes arbitrary occurrences exceptable.
 */

import {
  exceptOccurrence,
  getProperty,
  propName,
  unfold,
} from './icalendar.js';

const SERIES = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:abc',
  'DTSTAMP:20260823T000000Z',
  'DTSTART;TZID=America/Los_Angeles:20260907T090000',
  'DTEND;TZID=America/Los_Angeles:20260907T100000',
  'RRULE:FREQ=WEEKLY;COUNT=6',
  'SEQUENCE:0',
  'SUMMARY:Weekly thing',
  'END:VEVENT',
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'BEGIN:STANDARD',
  'DTSTART:20071104T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
  'END:VCALENDAR',
].join('\r\n');

describe('exceptOccurrence', () => {
  it('adds an EXDATE carrying the same TZID as DTSTART', () => {
    const out = exceptOccurrence(unfold(SERIES), '20260921T090000');
    expect(out).toContain('EXDATE;TZID=America/Los_Angeles:20260921T090000');
  });

  it('places the EXDATE inside the VEVENT', () => {
    const out = exceptOccurrence(unfold(SERIES), '20260921T090000');
    const i = out.findIndex((l) => propName(l) === 'EXDATE');
    expect(i).toBeGreaterThan(out.indexOf('BEGIN:VEVENT'));
    expect(i).toBeLessThan(out.indexOf('END:VEVENT'));
  });

  it('appends alongside an existing EXDATE rather than replacing it', () => {
    const withOne = exceptOccurrence(unfold(SERIES), '20260914T090000');
    const withTwo = exceptOccurrence(withOne, '20260921T090000');
    const exdates = withTwo.filter((l) => propName(l) === 'EXDATE');
    expect(exdates).toHaveLength(2);
    expect(exdates.join('|')).toContain('20260914T090000');
    expect(exdates.join('|')).toContain('20260921T090000');
  });

  it('is idempotent — the same occurrence is not excepted twice', () => {
    const once = exceptOccurrence(unfold(SERIES), '20260921T090000');
    const twice = exceptOccurrence(once, '20260921T090000');
    expect(twice.filter((l) => propName(l) === 'EXDATE')).toHaveLength(1);
  });

  it('bumps SEQUENCE so the change is a recognised revision', () => {
    const out = exceptOccurrence(unfold(SERIES), '20260921T090000');
    expect(getProperty(out, 'SEQUENCE')).toBe('1');
  });

  it('preserves the VTIMEZONE component untouched', () => {
    const before = unfold(SERIES);
    const out = exceptOccurrence(before, '20260921T090000');
    const slice = (a: string[]) =>
      a.slice(a.indexOf('BEGIN:VTIMEZONE'), a.indexOf('END:VTIMEZONE') + 1);
    expect(slice(out)).toEqual(slice(before));
  });

  it('refuses a non-recurring event, which has no occurrence to except', () => {
    const single = unfold(SERIES).filter((l) => propName(l) !== 'RRULE');
    expect(() => exceptOccurrence(single, '20260921T090000')).toThrow(
      /not recurring/i,
    );
  });

  it('refuses a malformed occurrence stamp rather than writing it', () => {
    expect(() => exceptOccurrence(unfold(SERIES), '2026-09-21')).toThrow(
      /format/i,
    );
  });

  it('supports a UTC series, emitting a UTC EXDATE', () => {
    const utc = unfold(SERIES).map((l) =>
      propName(l) === 'DTSTART' ? 'DTSTART:20260907T160000Z' : l,
    );
    const out = exceptOccurrence(utc, '20260921T160000Z');
    expect(out).toContain('EXDATE:20260921T160000Z');
  });

  it('refuses a resource with more than one VEVENT', () => {
    const multi = unfold(SERIES).flatMap((l) =>
      l === 'END:VCALENDAR'
        ? [
            'BEGIN:VEVENT',
            'UID:abc',
            'RECURRENCE-ID:20260914T090000',
            'END:VEVENT',
            l,
          ]
        : [l],
    );
    expect(() => exceptOccurrence(multi, '20260921T090000')).toThrow(
      /one VEVENT/i,
    );
  });
});
