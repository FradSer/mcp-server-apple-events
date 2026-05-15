/**
 * reminderDateParser.ts
 * Helper utilities for parsing reminder dueDate strings safely across timezones.
 */

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_ONLY_WITH_TZ_REGEX = /^(\d{4}-\d{2}-\d{2})(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_TIME_NO_TZ_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})[ T]+(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const TIMEZONE_SUFFIX_REGEX = /(Z|[+-]\d{2}(?::?\d{2})?)$/i;

const toNumber = (value: string): number => Number.parseInt(value, 10);

const createLocalDate = (
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date | undefined => {
  if ([year, month, day, hour, minute, second].some(Number.isNaN)) {
    return undefined;
  }

  const date = new Date(year, month - 1, day, hour, minute, second, 0);

  // Validate that the date wasn't auto-corrected by JavaScript
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return undefined;
  }

  return date;
};

const normalizeTimezoneSegment = (segment: string): string => {
  if (!segment) return segment;
  if (segment === 'Z' || segment === 'z') return 'Z';

  const clean = segment.replace(':', '').replace(' ', '');
  if (clean.length === 3) {
    return `${clean}:00`;
  }
  if (clean.length === 5) {
    return `${clean.slice(0, 3)}:${clean.slice(3)}`;
  }
  return segment.includes(':')
    ? segment
    : `${segment.slice(0, 3)}:${segment.slice(3)}`;
};

const normalizeIsoString = (value: string): string => {
  let normalized = value.trim();
  if (normalized.includes(' ') && normalized.indexOf(' ') === 10) {
    normalized = `${normalized.slice(0, 10)}T${normalized.slice(11)}`;
  }

  normalized = normalized.replace(TIMEZONE_SUFFIX_REGEX, (match) =>
    normalizeTimezoneSegment(match),
  );

  return normalized;
};

const parseWithNative = (value: string): Date | undefined => {
  const normalized = normalizeIsoString(value);
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

/**
 * Parses reminder dueDate strings into Date objects without losing local timezone semantics.
 */
export const parseReminderDueDate = (
  dueDate?: string | null,
): Date | undefined => {
  if (!dueDate) return undefined;
  const trimmed = dueDate.trim();
  if (!trimmed) return undefined;

  const dateOnlyMatch = trimmed.match(DATE_ONLY_REGEX);
  if (dateOnlyMatch) {
    // Groups 1-3 are mandatory in DATE_ONLY_REGEX, so they are always defined.
    return createLocalDate(
      toNumber(dateOnlyMatch[1]!),
      toNumber(dateOnlyMatch[2]!),
      toNumber(dateOnlyMatch[3]!),
    );
  }

  const dateWithTzMatch = trimmed.match(DATE_ONLY_WITH_TZ_REGEX);
  if (dateWithTzMatch) {
    return parseWithNative(
      `${dateWithTzMatch[1]}T00:00:00${normalizeTimezoneSegment(dateWithTzMatch[2]!)}`,
    );
  }

  const localDateTimeMatch = trimmed.match(DATE_TIME_NO_TZ_REGEX);
  if (localDateTimeMatch) {
    // Groups 1-5 are mandatory; group 6 (seconds) is optional.
    const secondStr = localDateTimeMatch[6];
    return createLocalDate(
      toNumber(localDateTimeMatch[1]!),
      toNumber(localDateTimeMatch[2]!),
      toNumber(localDateTimeMatch[3]!),
      toNumber(localDateTimeMatch[4]!),
      toNumber(localDateTimeMatch[5]!),
      secondStr ? toNumber(secondStr) : 0,
    );
  }

  if (TIMEZONE_SUFFIX_REGEX.test(trimmed)) {
    return parseWithNative(trimmed);
  }

  // Reject strings that don't match expected date format patterns
  // Valid formats should only contain: digits, hyphens, colons, spaces, T, Z, +, -, and dots
  if (!/^[\d\-:T\s.Z+]+$/.test(trimmed)) {
    return undefined;
  }

  return parseWithNative(trimmed);
};
