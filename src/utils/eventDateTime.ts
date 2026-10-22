/**
 * Adds an absolute timestamp for a calendar event's wall-clock date and zone.
 *
 * EventKit's JSON date format keeps the event's local wall time and reports
 * its time zone separately. Resolve the pair only when it names exactly one
 * instant; daylight-saving gaps and repeated hours stay without an ISO value
 * rather than receiving a guessed timestamp.
 */

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:?\d{2})?$/i;

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = FORMATTERS.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    calendar: 'iso8601',
    numberingSystem: 'latn',
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  FORMATTERS.set(timeZone, formatter);
  return formatter;
};

const toEpochMilliseconds = (parts: DateTimeParts): number | undefined => {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, parts.millisecond);

  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day ||
    date.getUTCHours() !== parts.hour ||
    date.getUTCMinutes() !== parts.minute ||
    date.getUTCSeconds() !== parts.second ||
    date.getUTCMilliseconds() !== parts.millisecond
  ) {
    return undefined;
  }

  return date.getTime();
};

const dateTimePartsFrom = (
  epochMilliseconds: number,
  formatter: Intl.DateTimeFormat,
): DateTimeParts | undefined => {
  const date = new Date(epochMilliseconds);
  const values = Object.fromEntries(
    formatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const read = (key: string): number => Number(values[key]);
  const parts: DateTimeParts = {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
    millisecond: date.getUTCMilliseconds(),
  };

  return Object.values(parts).every(Number.isFinite) ? parts : undefined;
};

const sameDateTime = (left: DateTimeParts, right: DateTimeParts): boolean =>
  left.year === right.year &&
  left.month === right.month &&
  left.day === right.day &&
  left.hour === right.hour &&
  left.minute === right.minute &&
  left.second === right.second &&
  left.millisecond === right.millisecond;

const offsetAt = (
  epochMilliseconds: number,
  formatter: Intl.DateTimeFormat,
): number | undefined => {
  const localParts = dateTimePartsFrom(epochMilliseconds, formatter);
  if (!localParts) return undefined;

  const localAsUtc = toEpochMilliseconds(localParts);
  if (localAsUtc === undefined) return undefined;

  const offsetMilliseconds = localAsUtc - epochMilliseconds;
  return offsetMilliseconds % 60_000 === 0 ? offsetMilliseconds : undefined;
};

const parseDateTime = (value: string): DateTimeParts | undefined => {
  const match = DATE_TIME_PATTERN.exec(value.trim());
  if (!match) return undefined;

  const fraction = match[7] ?? '';
  const parts: DateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
    millisecond: Number(fraction.padEnd(3, '0')),
  };

  return toEpochMilliseconds(parts) === undefined ? undefined : parts;
};

/** Returns a UTC ISO timestamp only when the source value identifies one instant. */
export const toEventDateISO = (
  value: string | undefined,
  timeZone: string | undefined,
): string | undefined => {
  if (!value) return undefined;

  const parsed = parseDateTime(value);
  const match = DATE_TIME_PATTERN.exec(value.trim());
  if (!parsed || !match) return undefined;

  const zoneSuffix = match[8];
  if (zoneSuffix) {
    const normalizedValue = value
      .trim()
      .replace(' ', 'T')
      .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const instant = new Date(normalizedValue);
    return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
  }

  if (!timeZone) return undefined;

  try {
    const formatter = getFormatter(timeZone);
    const wallTimeAsUtc = toEpochMilliseconds(parsed);
    if (wallTimeAsUtc === undefined) return undefined;

    const candidateInstants = new Set<number>();
    for (let hours = -48; hours <= 48; hours += 6) {
      const sample = wallTimeAsUtc + hours * 60 * 60 * 1000;
      const offset = offsetAt(sample, formatter);
      if (offset === undefined) continue;

      const candidate = wallTimeAsUtc - offset;
      const candidateParts = dateTimePartsFrom(candidate, formatter);
      if (candidateParts && sameDateTime(candidateParts, parsed)) {
        candidateInstants.add(candidate);
      }
    }

    if (candidateInstants.size !== 1) return undefined;
    return new Date(
      candidateInstants.values().next().value as number,
    ).toISOString();
  } catch {
    // Preserve the event read if its time-zone identifier is unknown to Intl.
    return undefined;
  }
};
