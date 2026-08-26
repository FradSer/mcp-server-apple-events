/**
 * icalendarOverrides.test.ts
 *
 * A series carries override VEVENTs precisely because someone already edited one
 * of its occurrences — which makes it the common case for anyone editing an
 * occurrence again, not an exotic one. Refusing it outright, as the first cut
 * did, blocked the population most likely to need this.
 *
 * Adding an EXDATE is safe here; the only extra work is dropping an override
 * whose RECURRENCE-ID names the same instant, which would otherwise survive as
 * a detached event after its parent occurrence was excepted.
 */

import { CliUserError } from './errorHandling.js';
import { exceptOccurrence, propName } from './icalendar.js';

const withOverride = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:abc',
  'DTSTAMP:20260823T000000Z',
  'DTSTART;TZID=America/Los_Angeles:20260907T090000',
  'RRULE:FREQ=WEEKLY;COUNT=6',
  'SEQUENCE:0',
  'SUMMARY:Weekly thing',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:abc',
  'RECURRENCE-ID;TZID=America/Los_Angeles:20260914T090000',
  'DTSTART;TZID=America/Los_Angeles:20260914T110000',
  'SEQUENCE:1',
  'SUMMARY:Weekly thing (moved)',
  'END:VEVENT',
  'BEGIN:VTIMEZONE',
  'TZID:America/Los_Angeles',
  'BEGIN:STANDARD',
  'DTSTART:20071104T020000',
  'END:STANDARD',
  'END:VTIMEZONE',
  'END:VCALENDAR',
];

const overrideBlocks = (lines: string[]) =>
  lines.filter((l) => propName(l) === 'RECURRENCE-ID');

describe('exceptOccurrence — series that already has overrides', () => {
  it('excepts an untouched occurrence without refusing', () => {
    const out = exceptOccurrence(withOverride, '20260921T090000');
    expect(out).toContain('EXDATE;TZID=America/Los_Angeles:20260921T090000');
  });

  it('leaves an unrelated override intact', () => {
    const out = exceptOccurrence(withOverride, '20260921T090000');
    expect(overrideBlocks(out)).toHaveLength(1);
    expect(out).toContain('SUMMARY:Weekly thing (moved)');
  });

  it('adds the EXDATE to the master, not to the override', () => {
    const out = exceptOccurrence(withOverride, '20260921T090000');
    const exdate = out.findIndex((l) => propName(l) === 'EXDATE');
    const firstEnd = out.indexOf('END:VEVENT');
    expect(exdate).toBeLessThan(firstEnd);
  });

  it('bumps only the master SEQUENCE', () => {
    const out = exceptOccurrence(withOverride, '20260921T090000');
    expect(out.find((l) => propName(l) === 'SEQUENCE')).toBe('SEQUENCE:1');
    // the override keeps its own
    expect(out.filter((l) => l === 'SEQUENCE:1')).toHaveLength(2);
  });

  // Excepting the instant an override describes must remove the override too.
  // Left behind, it survives as a detached event after its parent occurrence is
  // gone — the occurrence "comes back", moved, which looks like the exception
  // silently failed.
  it('removes an override whose RECURRENCE-ID matches the excepted instant', () => {
    const out = exceptOccurrence(withOverride, '20260914T090000');
    expect(overrideBlocks(out)).toHaveLength(0);
    expect(out).not.toContain('SUMMARY:Weekly thing (moved)');
    expect(out).toContain('EXDATE;TZID=America/Los_Angeles:20260914T090000');
  });

  it('keeps the master and VTIMEZONE when removing an override', () => {
    const out = exceptOccurrence(withOverride, '20260914T090000');
    expect(out).toContain('SUMMARY:Weekly thing');
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('still refuses a resource with no recurring master', () => {
    const noMaster = withOverride.filter((l) => propName(l) !== 'RRULE');
    expect(() => exceptOccurrence(noMaster, '20260921T090000')).toThrow(
      CliUserError,
    );
  });

  it('still refuses when two VEVENTs both look like masters', () => {
    const twoMasters = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:a',
      'DTSTART:20260907T160000Z',
      'RRULE:FREQ=WEEKLY',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:b',
      'DTSTART:20260907T160000Z',
      'RRULE:FREQ=WEEKLY',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    expect(() => exceptOccurrence(twoMasters, '20260921T160000')).toThrow(
      /one recurring/i,
    );
  });
});

/**
 * Regression: the SEQUENCE fallback used to splice at the first END:VEVENT in
 * the output. Everything else here is order-agnostic, so nothing guarantees the
 * master is the first block — and SEQUENCE is optional in RFC 5545, so a
 * resource written by another client may omit it. Together those put the bump
 * inside an unrelated override and leave the master unbumped, which a server
 * may then treat as an unchanged revision: the exact non-application this
 * function exists to prevent.
 */
describe('exceptOccurrence — master that is neither first nor SEQUENCE-bearing', () => {
  const overrideFirst = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    // override precedes the master, and is NOT the instant being excepted
    'BEGIN:VEVENT',
    'UID:abc',
    'RECURRENCE-ID;TZID=America/Los_Angeles:20260914T090000',
    'DTSTART;TZID=America/Los_Angeles:20260914T110000',
    'SUMMARY:moved one',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:abc',
    'DTSTAMP:20260823T000000Z',
    'DTSTART;TZID=America/Los_Angeles:20260907T090000',
    'RRULE:FREQ=WEEKLY;COUNT=6',
    'SUMMARY:the master',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const blockOf = (lines: string[], summary: string) => {
    const at = lines.indexOf(`SUMMARY:${summary}`);
    const start = lines.lastIndexOf('BEGIN:VEVENT', at);
    const end = lines.indexOf('END:VEVENT', at);
    return lines.slice(start, end + 1);
  };

  it('puts the SEQUENCE bump in the master, not the preceding override', () => {
    const out = exceptOccurrence(overrideFirst, '20260921T090000');
    expect(blockOf(out, 'the master')).toContain('SEQUENCE:1');
    expect(blockOf(out, 'moved one')).not.toContain('SEQUENCE:1');
  });

  it('puts the EXDATE in the master too', () => {
    const out = exceptOccurrence(overrideFirst, '20260921T090000');
    expect(blockOf(out, 'the master')).toContain(
      'EXDATE;TZID=America/Los_Angeles:20260921T090000',
    );
  });

  it('leaves the preceding override otherwise untouched', () => {
    const out = exceptOccurrence(overrideFirst, '20260921T090000');
    expect(blockOf(out, 'moved one')).toEqual(
      blockOf(overrideFirst, 'moved one'),
    );
  });

  it('adds exactly one SEQUENCE line across the whole resource', () => {
    const out = exceptOccurrence(overrideFirst, '20260921T090000');
    expect(out.filter((l) => propName(l) === 'SEQUENCE')).toHaveLength(1);
  });
});
