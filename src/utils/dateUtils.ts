/**
 * dateUtils.ts
 * Shared date calculation utilities
 */

/**
 * Creates a date object representing the start of today (midnight)
 */
export function getTodayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Creates a date object representing the start of tomorrow (midnight)
 */
export function getTomorrowStart(): Date {
  const today = getTodayStart();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/**
 * Gets the first day of the week for the current locale using Intl.Locale API.
 * @returns 0-6 where 0=Sunday, 1=Monday, ..., 6=Saturday
 */
function getLocaleFirstDay(): number {
  try {
    // Get the default locale from the system
    const defaultLocale =
      Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
    const locale = new Intl.Locale(defaultLocale);
    const weekInfo = (
      locale as Intl.Locale & { weekInfo?: { firstDay?: number } }
    ).weekInfo;
    if (weekInfo?.firstDay !== undefined) {
      // Intl returns 1-7 where 1=Monday, 7=Sunday
      // Convert to JS format 0-6 where 0=Sunday
      return weekInfo.firstDay === 7 ? 0 : weekInfo.firstDay;
    }
  } catch {
    // Fallback to Sunday if Intl.Locale is unavailable
  }
  return 0; // Default: Sunday
}

/**
 * Creates a date object representing the start of the current calendar week.
 * Uses Intl.Locale.weekInfo for locale-aware week start when available.
 * Falls back to Sunday for environments without Intl.Locale support.
 */
export function getWeekStart(): Date {
  const today = getTodayStart();
  const dayOfWeek = today.getDay(); // 0=Sunday, 6=Saturday
  const firstDay = getLocaleFirstDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((dayOfWeek - firstDay + 7) % 7));
  return weekStart;
}

/**
 * Creates a date object representing the end of the current calendar week
 * (start of next week). Matches Swift's Calendar.current.dateInterval(of: .weekOfYear).
 */
export function getWeekEnd(): Date {
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  return weekEnd;
}

/**
 * Creates a date object representing the start of a specific date (midnight)
 */
export function getDateStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Formats a Date as a local `yyyy-MM-dd` string — the shape the `event` CLI
 * accepts for `calendar list` / `reminders list` window bounds.
 */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns a new Date shifted by `days` (negative for the past), leaving the
 * argument untouched.
 */
export function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/**
 * Trims a caller-supplied date to a bare `yyyy-MM-dd` bound.
 *
 * Use this for values that are genuinely date-only (an all-day event's date,
 * for instance). For read-window bounds prefer `toWindowStart`/`toWindowEnd`:
 * the `event` CLI validates `yyyy-MM-dd HH:mm:ss` and ISO 8601 as well, so a
 * window bound does not need its time component removed.
 */
export function toDateOnly(value: string): string {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? value;
}

/** Matches a caller-supplied bound that already carries a time component. */
const BOUND_HAS_TIME = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})/;

/**
 * Resolves the start of a calendar read window.
 *
 * Midnight is already the right reading of a date-only bound, so this only
 * preserves a time the caller supplied rather than discarding it.
 */
export function toWindowStart(value: string): string {
  return BOUND_HAS_TIME.test(value) ? value : toDateOnly(value);
}

/**
 * Resolves the end of a calendar read window.
 *
 * `EKEventStore.predicateForEvents(withStart:end:)` matches events overlapping
 * the interval between the two instants, so a date-only end bound parses to
 * midnight and excludes the entire day it names. Asking for a single day
 * (start and end on the same date) then collapses to a zero-width window that
 * matches nothing at all, and the caller gets a confident empty result rather
 * than an error.
 *
 * Expand a date-only bound to the final second of that day, and pass a bound
 * that already carries a time straight through.
 */
export function toWindowEnd(value: string): string {
  if (BOUND_HAS_TIME.test(value)) return value;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? `${match[1]} 23:59:59` : value;
}
