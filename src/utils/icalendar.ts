/**
 * icalendar.ts
 * Minimal RFC 5545 line handling and VEVENT attendee editing.
 *
 * Deliberately not a general iCalendar parser. Attendee writes are a
 * read-modify-write against a resource authored by Calendar.app, so the
 * governing constraint is that every property we do not understand survives
 * untouched — VTIMEZONE, VALARM, TRANSP, X-APPLE-STRUCTURED-LOCATION and the
 * TZID parameter on DTSTART all carry meaning we must not normalize away.
 * Operating on the unfolded line list makes that preservation the default.
 *
 * Edits are nonetheless component-aware: a line's meaning depends on which
 * component encloses it. DTSTART inside VTIMEZONE is a zone transition rule,
 * not the event's start, and DTSTAMP inside VALARM is not the event's stamp.
 * Rewriting by property name alone silently corrupts both.
 */

import { CliUserError } from './errorHandling.js';

const MAX_OCTETS = 75;

/** RFC 5545 §3.1 line unfolding. */
export const unfold = (text: string): string[] => {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else if (raw !== '') {
      out.push(raw);
    }
  }
  return out;
};

/**
 * RFC 5545 §3.1 line folding, counted in octets rather than characters so a
 * multi-byte character is never split across the boundary.
 */
export const fold = (lines: string[]): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    if (Buffer.byteLength(line, 'utf8') <= MAX_OCTETS) {
      out.push(line);
      continue;
    }
    const chunks: string[] = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
      const size = Buffer.byteLength(ch, 'utf8');
      // Continuations spend one octet on the leading space.
      const limit = chunks.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
      if (bytes + size > limit) {
        chunks.push(current);
        current = '';
        bytes = 0;
      }
      current += ch;
      bytes += size;
    }
    if (current !== '') chunks.push(current);
    const [first, ...rest] = chunks;
    if (first !== undefined) out.push(first);
    for (const c of rest) out.push(` ${c}`);
  }
  return out;
};

export const serialize = (lines: string[]): string =>
  `${fold(lines).join('\r\n')}\r\n`;

/** Property name of a content line, upper-cased, parameters stripped. */
export const propName = (line: string): string => {
  let end = line.length;
  for (const sep of [';', ':']) {
    const i = line.indexOf(sep);
    if (i !== -1 && i < end) end = i;
  }
  return line.slice(0, end).toUpperCase();
};

export const getProperty = (
  lines: string[],
  name: string,
): string | undefined => {
  const target = name.toUpperCase();
  for (const line of lines) {
    if (propName(line) === target) {
      const i = line.indexOf(':');
      return i === -1 ? '' : line.slice(i + 1);
    }
  }
  return undefined;
};

/**
 * Innermost enclosing component for each line. BEGIN lines report the component
 * they open; END lines report the component they close.
 */
const componentOf = (lines: string[]): string[] => {
  const stack: string[] = [];
  return lines.map((line) => {
    const name = propName(line);
    const value = line.slice(line.indexOf(':') + 1).toUpperCase();
    if (name === 'BEGIN') {
      stack.push(value);
      return value;
    }
    const current = stack[stack.length - 1] ?? '';
    if (name === 'END') stack.pop();
    return current;
  });
};

const utcStamp = (): string =>
  `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

const ICAL_STAMP = /^\d{8}T\d{6}Z?$/;

/**
 * Excepts a single occurrence of a recurring series by appending an EXDATE.
 *
 * EventKit cannot express this through the MCP: every occurrence of a series
 * shares one identifier, and resolving it returns the master, whose occurrence
 * date is its own DTSTART. So a delete with span=this-event can only ever
 * except that one date; aimed at any other occurrence it silently no-ops.
 * EXDATE names the instant directly and has no such limitation.
 *
 * The EXDATE must carry the same value type and TZID as DTSTART — a floating
 * or differently-zoned EXDATE will not match the generated instance and the
 * occurrence stays put.
 */
export const exceptOccurrence = (
  lines: string[],
  occurrenceStart: string,
): string[] => {
  if (!ICAL_STAMP.test(occurrenceStart)) {
    throw new CliUserError(
      `Invalid occurrence format: expected an iCalendar date-time ` +
        `(YYYYMMDDTHHMMSS[Z]), received "${occurrenceStart}".`,
    );
  }

  const components = componentOf(lines);
  const inEvent = (i: number): boolean => components[i] === 'VEVENT';
  const eventStarts = lines.filter(
    (l, i) => propName(l) === 'BEGIN' && components[i] === 'VEVENT',
  ).length;
  if (eventStarts === 0)
    throw new CliUserError('Calendar object contains no VEVENT.');
  if (eventStarts > 1) {
    throw new CliUserError(
      'Calendar object contains more than one VEVENT. Excepting an occurrence ' +
        'of a series that already has overrides is not supported.',
    );
  }
  if (!lines.some((l, i) => inEvent(i) && propName(l) === 'RRULE')) {
    throw new CliUserError(
      'Event is not recurring; there is no occurrence to except.',
    );
  }

  // Mirror DTSTART's parameters so the EXDATE refers to the same wall clock.
  const dtstart = lines.find((l, i) => inEvent(i) && propName(l) === 'DTSTART');
  const params = dtstart
    ? dtstart.slice('DTSTART'.length, dtstart.indexOf(':'))
    : '';
  // The EXDATE must match DTSTART's value type as well as its TZID. A UTC
  // series takes a UTC EXDATE; supplying a floating stamp against DTSTART:...Z
  // yields an EXDATE that matches no generated instance, so the PUT succeeds
  // and the occurrence stays — the silent no-op this feature exists to remove.
  const dtstartValue = dtstart?.slice(dtstart.indexOf(':') + 1) ?? '';
  const seriesIsUtc = dtstartValue.endsWith('Z');
  const stamp = seriesIsUtc
    ? `${occurrenceStart.replace(/Z$/, '')}Z`
    : occurrenceStart.replace(/Z$/, '');
  const exdate = `EXDATE${params}:${stamp}`;

  const already = lines.some(
    (l, i) =>
      inEvent(i) &&
      propName(l) === 'EXDATE' &&
      l
        .slice(l.indexOf(':') + 1)
        .split(',')
        .includes(stamp),
  );
  if (already) return [...lines];

  const sequenceLine = lines.find(
    (l, i) => inEvent(i) && propName(l) === 'SEQUENCE',
  );
  const sequence = Number.parseInt(
    sequenceLine?.slice(sequenceLine.indexOf(':') + 1) ?? '0',
    10,
  );
  const endIndex = lines.findIndex(
    (l, i) => propName(l) === 'END' && components[i] === 'VEVENT',
  );

  const out: string[] = [];
  lines.forEach((line, index) => {
    if (index === endIndex) out.push(exdate);
    if (inEvent(index) && propName(line) === 'SEQUENCE') {
      out.push(`SEQUENCE:${Number.isNaN(sequence) ? 1 : sequence + 1}`);
    } else if (inEvent(index) && propName(line) === 'DTSTAMP') {
      out.push(`DTSTAMP:${utcStamp()}`);
    } else {
      out.push(line);
    }
  });
  return out;
};
