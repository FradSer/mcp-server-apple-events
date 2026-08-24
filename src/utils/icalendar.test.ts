/**
 * icalendar.test.ts
 * RFC 5545 line handling + minimal VEVENT editing.
 *
 * The round-trip fixture is a real event read off iCloud CalDAV (Calendar.app
 * authored it), because byte-preservation of properties we do not understand —
 * X-APPLE-STRUCTURED-LOCATION, VTIMEZONE, TRANSP — is the whole point.
 */

import { fold, propName, serialize, unfold } from './icalendar.js';

// Verbatim from iCloud, folded exactly as the server returned it.
const REAL_EVENT = [
  'BEGIN:VCALENDAR',
  'CALSCALE:GREGORIAN',
  'PRODID:-//Apple Inc.//macOS 26.5.2//EN',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'CREATED:20260819T151202Z',
  'DESCRIPTION:MKTG-300-001 · KSB T58',
  'DTEND;TZID=GMT-0400:20260831T141000',
  'DTSTART;TZID=GMT-0400:20260831T125500',
  'LAST-MODIFIED:20260821T225744Z',
  'LOCATION:Kogod School of Business',
  'SEQUENCE:0',
  'SUMMARY:MKTG 300 — Class 1: Intros + Course Promise',
  'UID:52694C69-7B46-432F-8B65-5D50BBAA913D',
  'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-APPLE-RADIUS=200;X-APPLE-REFERENCE',
  ' FRAME=0;X-TITLE=Kogod School of Business:geo:38.937000,-77.089700',
  'DTSTAMP:20260821T225744Z',
  'TRANSP:OPAQUE',
  'END:VEVENT',
  'BEGIN:VTIMEZONE',
  'TZID:GMT-0400',
  'X-LIC-LOCATION:GMT-0400',
  'BEGIN:STANDARD',
  'DTSTART:18000101T000000',
  'RDATE:18000101T000000',
  'TZNAME:-04',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0400',
  'END:STANDARD',
  'END:VTIMEZONE',
  'END:VCALENDAR',
].join('\r\n');

describe('unfold', () => {
  it('joins continuation lines beginning with a space', () => {
    const lines = unfold('FOO:bar\r\n baz');
    expect(lines).toEqual(['FOO:barbaz']);
  });

  it('joins continuation lines beginning with a tab', () => {
    expect(unfold('FOO:bar\r\n\tbaz')).toEqual(['FOO:barbaz']);
  });

  it('reassembles a folded X-APPLE-STRUCTURED-LOCATION into one line', () => {
    const line = unfold(REAL_EVENT).find(
      (l) => propName(l) === 'X-APPLE-STRUCTURED-LOCATION',
    );
    expect(line).toContain('X-TITLE=Kogod School of Business');
    expect(line).toContain('geo:38.937000,-77.089700');
  });

  it('drops nothing and preserves order', () => {
    const lines = unfold(REAL_EVENT);
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines[lines.length - 1]).toBe('END:VCALENDAR');
  });
});

describe('fold', () => {
  it('leaves short lines untouched', () => {
    expect(fold(['TRANSP:OPAQUE'])).toEqual(['TRANSP:OPAQUE']);
  });

  it('folds at 75 octets with a leading space on continuations', () => {
    const long = `X-LONG:${'a'.repeat(200)}`;
    const out = fold([long]);
    expect(out.length).toBeGreaterThan(1);
    for (const l of out) {
      expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(out.slice(1).every((l) => l.startsWith(' '))).toBe(true);
  });

  it('never splits a multi-byte character across a fold boundary', () => {
    // Em dash is 3 bytes in UTF-8; a naive character-count fold corrupts it.
    const line = `SUMMARY:${'—'.repeat(60)}`;
    const rejoined = unfold(fold(line.split('\0')).join('\r\n'));
    expect(rejoined[0]).toBe(line);
  });
});

describe('round-trip', () => {
  // Not byte-identical: Apple folds this fixture's X-APPLE-STRUCTURED-LOCATION at
  // 74 octets, and RFC 5545 leaves the fold point free. Semantic identity is the
  // real invariant — the server re-folds however it likes on the way back out.
  it('unfold(serialize(unfold(x))) is identical to unfold(x)', () => {
    const once = unfold(REAL_EVENT);
    expect(unfold(serialize(once))).toEqual(once);
  });

  it('emits no line longer than 75 octets', () => {
    for (const line of serialize(unfold(REAL_EVENT)).split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('preserves VTIMEZONE, TRANSP and X-APPLE-* through a round trip', () => {
    const out = serialize(unfold(REAL_EVENT));
    expect(out).toContain('BEGIN:VTIMEZONE');
    expect(out).toContain('TZOFFSETFROM:-0400');
    expect(out).toContain('TRANSP:OPAQUE');
    expect(out).toContain('X-APPLE-STRUCTURED-LOCATION');
  });

  it('preserves the TZID parameter on DTSTART rather than coercing to UTC', () => {
    const dtstart = unfold(REAL_EVENT).find((l) => propName(l) === 'DTSTART');
    expect(dtstart).toBe('DTSTART;TZID=GMT-0400:20260831T125500');
  });
});

describe('propName', () => {
  it.each([
    ['ATTENDEE;CN=Sam:mailto:a@b.c', 'ATTENDEE'],
    ['TRANSP:OPAQUE', 'TRANSP'],
    ['BEGIN:VEVENT', 'BEGIN'],
    ['x-lower;P=1:v', 'X-LOWER'],
  ])('parses %s as %s', (line, expected) => {
    expect(propName(line)).toBe(expected);
  });
});
