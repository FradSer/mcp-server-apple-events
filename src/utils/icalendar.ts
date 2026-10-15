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
const MAX_CALENDAR_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 20_000;
const MAX_LINE_BYTES = 64 * 1024;
const MAX_COMPONENT_DEPTH = 16;
const MAX_EVENTS = 2000;
const MAX_OVERRIDES = 1000;

const checkLimit = (value: number, limit: number, name: string): void => {
  if (value > limit) {
    throw new CliUserError(
      `Calendar ${name} limit exceeded (${limit}). Reduce the calendar resource before retrying.`,
    );
  }
};

const checkLines = (lines: string[]): void => {
  checkLimit(lines.length, MAX_LINES, 'line count');
  let bytes = 0;
  for (const line of lines) {
    const size = Buffer.byteLength(line, 'utf8');
    checkLimit(size, MAX_LINE_BYTES, 'line length');
    bytes += size + 2;
    checkLimit(bytes, MAX_CALENDAR_BYTES, 'size');
  }
};

/** RFC 5545 §3.1 line unfolding. */
export const unfold = (text: string): string[] => {
  checkLimit(Buffer.byteLength(text, 'utf8'), MAX_CALENDAR_BYTES, 'size');
  let physicalLines = 1;
  // Count before splitting so a body of empty lines cannot allocate a large
  // array before the structural limit is enforced.
  for (const ch of text) {
    if (ch === '\n') checkLimit(++physicalLines, MAX_LINES, 'line count');
  }
  const out: string[] = [];
  let logicalBytes = 0;
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const size = Buffer.byteLength(raw, 'utf8');
    checkLimit(size, MAX_LINE_BYTES, 'line length');
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      logicalBytes += size - 1;
      checkLimit(logicalBytes, MAX_LINE_BYTES, 'line length');
      out[out.length - 1] += raw.slice(1);
    } else if (raw !== '') {
      logicalBytes = size;
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
  checkLines(lines);
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

export const serialize = (lines: string[]): string => {
  const folded = fold(lines);
  checkLimit(folded.length + 1, MAX_LINES, 'line count');
  checkLines(folded);
  return `${folded.join('\r\n')}\r\n`;
};

/** Property name of a content line, upper-cased, parameters stripped. */
export const propName = (line: string): string => {
  let end = line.length;
  for (const sep of [';', ':']) {
    const i = line.indexOf(sep);
    if (i !== -1 && i < end) end = i;
  }
  return line.slice(0, end).toUpperCase();
};

/**
 * Innermost enclosing component for each line. BEGIN lines report the component
 * they open; END lines report the component they close.
 */
const componentOf = (lines: string[]): string[] => {
  const stack: string[] = [];
  let events = 0;
  let overrides = 0;
  return lines.map((line) => {
    const name = propName(line);
    const value = line.slice(line.indexOf(':') + 1).toUpperCase();
    if (name === 'BEGIN') {
      checkLimit(stack.length + 1, MAX_COMPONENT_DEPTH, 'nesting');
      if (value === 'VEVENT') {
        if (stack.includes('VEVENT')) {
          throw new CliUserError(
            'Calendar contains a nested VEVENT; cannot safely edit it.',
          );
        }
        checkLimit(++events, MAX_EVENTS, 'event count');
      }
      stack.push(value);
      return value;
    }
    const current = stack[stack.length - 1] ?? '';
    if (name === 'RECURRENCE-ID') {
      checkLimit(++overrides, MAX_OVERRIDES, 'override count');
    }
    if (name === 'END') stack.pop();
    return current;
  });
};

const utcStamp = (): string =>
  `${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

interface Block {
  start: number;
  end: number;
}

/** Index ranges of each top-level VEVENT, inclusive of its BEGIN and END. */
const veventBlocks = (lines: string[], components: string[]): Block[] => {
  const out: Block[] = [];
  let open: number | null = null;
  lines.forEach((line, i) => {
    if (components[i] !== 'VEVENT') return;
    if (propName(line) === 'BEGIN') open = i;
    else if (propName(line) === 'END' && open !== null) {
      out.push({ start: open, end: i });
      open = null;
    }
  });
  return out;
};

const lineIn = (
  lines: string[],
  block: Block,
  name: string,
): string | undefined => {
  for (let i = block.start; i <= block.end; i++) {
    const line = lines[i];
    if (line !== undefined && propName(line) === name) return line;
  }
  return undefined;
};

const blockHas = (lines: string[], block: Block, name: string): boolean =>
  lineIn(lines, block, name) !== undefined;

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
  checkLines(lines);
  if (!ICAL_STAMP.test(occurrenceStart)) {
    throw new CliUserError(
      `Invalid occurrence format: expected an iCalendar date-time ` +
        `(YYYYMMDDTHHMMSS[Z]), received "${occurrenceStart}".`,
    );
  }

  const components = componentOf(lines);
  const blocks = veventBlocks(lines, components);
  if (blocks.length === 0) {
    throw new CliUserError('Calendar object contains no VEVENT.');
  }

  // A series with overrides is the *common* case for occurrence editing — the
  // overrides exist because someone already edited an occurrence. Only the
  // master carries RRULE and no RECURRENCE-ID; the rest describe single
  // instances and are left alone unless they name the instant being excepted.
  const masters = blocks.filter(
    (b) => !blockHas(lines, b, 'RECURRENCE-ID') && blockHas(lines, b, 'RRULE'),
  );
  if (masters.length === 0) {
    throw new CliUserError(
      'Event is not recurring; there is no occurrence to except.',
    );
  }
  if (masters.length > 1) {
    throw new CliUserError(
      'Calendar object contains more than one recurring master; cannot tell ' +
        'which series the occurrence belongs to.',
    );
  }
  const master = masters[0] as Block;

  const dtstart = lineIn(lines, master, 'DTSTART');
  const params = dtstart
    ? dtstart.slice('DTSTART'.length, dtstart.indexOf(':'))
    : '';
  // The EXDATE must match DTSTART's value type as well as its TZID. A floating
  // stamp against a UTC series matches no generated instance, so the write
  // succeeds and the occurrence stays.
  const seriesIsUtc = (dtstart?.slice(dtstart.indexOf(':') + 1) ?? '').endsWith(
    'Z',
  );
  const stamp = seriesIsUtc
    ? `${occurrenceStart.replace(/Z$/, '')}Z`
    : occurrenceStart.replace(/Z$/, '');
  const exdate = `EXDATE${params}:${stamp}`;

  const alreadyExcepted = lines.some(
    (l, i) =>
      i >= master.start &&
      i <= master.end &&
      propName(l) === 'EXDATE' &&
      l
        .slice(l.indexOf(':') + 1)
        .split(',')
        .includes(stamp),
  );

  // An override naming this instant must go with it. Left behind it survives as
  // a detached event once its parent occurrence is excepted, so the occurrence
  // appears to come back — indistinguishable from the exception having failed.
  const doomed = blocks.filter((b) => {
    const rid = lineIn(lines, b, 'RECURRENCE-ID');
    if (!rid) return false;
    const value = rid.slice(rid.indexOf(':') + 1);
    return value.replace(/Z$/, '') === stamp.replace(/Z$/, '');
  });

  if (alreadyExcepted && doomed.length === 0) return [...lines];

  const sequenceLine = lineIn(lines, master, 'SEQUENCE');
  const sequence = Number.parseInt(
    sequenceLine?.slice(sequenceLine.indexOf(':') + 1) ?? '0',
    10,
  );
  const now = utcStamp();

  const out: string[] = [];
  // Blocks are disjoint and ordered by position, so advance through each
  // removal interval once instead of searching every interval for every line.
  let doomedIndex = 0;
  lines.forEach((line, index) => {
    let removed = doomed[doomedIndex];
    while (removed && index > removed.end) {
      doomedIndex += 1;
      removed = doomed[doomedIndex];
    }
    if (removed && index >= removed.start) return;
    const inMaster = index >= master.start && index <= master.end;
    if (index === master.end) {
      if (!alreadyExcepted) out.push(exdate);
      // Emitted here rather than spliced afterwards: an index into `lines` does
      // not survive into `out` once doomed blocks are dropped, and searching
      // `out` for the first END:VEVENT would land in whichever block happens to
      // come first — nothing in this function requires that to be the master.
      if (sequenceLine === undefined) out.push('SEQUENCE:1');
    }
    if (inMaster && propName(line) === 'SEQUENCE') {
      out.push(`SEQUENCE:${Number.isNaN(sequence) ? 1 : sequence + 1}`);
    } else if (inMaster && propName(line) === 'DTSTAMP') {
      out.push(`DTSTAMP:${now}`);
    } else {
      out.push(line);
    }
  });

  return out;
};
