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
 * Creates a date object representing the start of the current calendar week.
 * Uses Sunday as the first day of the week, matching Swift's Calendar.current
 * on macOS with the default US locale.
 */
export function getWeekStart(): Date {
  const today = getTodayStart();
  const dayOfWeek = today.getDay(); // 0=Sunday, 6=Saturday
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);
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
