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
