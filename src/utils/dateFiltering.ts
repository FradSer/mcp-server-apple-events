/**
 * dateFiltering.ts
 * Reusable utilities for filtering reminders by date criteria
 */

import type { Reminder } from '../types/index.js';
import type { ReminderJSON } from '../types/repository.js';
import {
  getTodayStart,
  getTomorrowStart,
  getWeekEnd,
  getWeekStart,
} from './dateUtils.js';
import { parseReminderDueDate } from './reminderDateParser.js';
import { hasAllTags } from './tagUtils.js';

/**
 * Date range filters for reminders
 */
export type DateFilter =
  | 'today'
  | 'tomorrow'
  | 'this-week'
  | 'overdue'
  | 'no-date';

/**
 * Date range boundaries
 */
interface DateBoundaries {
  today: Date;
  tomorrow: Date;
  dayAfterTomorrow: Date;
  weekStart: Date;
  weekEnd: Date;
}

/**
 * Creates standardized date boundaries for filtering operations
 */
function createDateBoundaries(): DateBoundaries {
  const today = getTodayStart();
  const tomorrow = getTomorrowStart();
  const dayAfterTomorrow = getTomorrowStart();
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();

  return { today, tomorrow, dayAfterTomorrow, weekStart, weekEnd };
}

/**
 * Filters reminders based on due date criteria
 */
function filterRemindersByDate(
  reminders: Reminder[],
  filter: DateFilter,
): Reminder[] {
  if (filter === 'no-date') {
    return reminders.filter((reminder) => !reminder.dueDate);
  }

  const { today, tomorrow, dayAfterTomorrow, weekStart, weekEnd } =
    createDateBoundaries();

  return reminders.filter((reminder) => {
    if (!reminder.dueDate) return false;

    const dueDate = parseReminderDueDate(reminder.dueDate);
    if (!dueDate) return false;

    switch (filter) {
      case 'overdue':
        return dueDate.getTime() < today.getTime();

      case 'today':
        return (
          dueDate.getTime() >= today.getTime() &&
          dueDate.getTime() < tomorrow.getTime()
        );

      case 'tomorrow':
        return (
          dueDate.getTime() >= tomorrow.getTime() &&
          dueDate.getTime() < dayAfterTomorrow.getTime()
        );

      case 'this-week':
        return (
          dueDate.getTime() >= weekStart.getTime() &&
          dueDate.getTime() < weekEnd.getTime()
        );

      default:
        return true;
    }
  });
}

/**
 * Priority filter values (string names that map to EventKit integers)
 */
export type PriorityFilter = 'high' | 'medium' | 'low' | 'none';

/**
 * Maps priority filter strings to EventKit integer values
 */
const PRIORITY_FILTER_MAP: Record<PriorityFilter, number> = {
  none: 0,
  high: 1,
  medium: 5,
  low: 9,
};

/**
 * Filters for reminder search operations
 */
export interface ReminderFilters {
  showCompleted?: boolean;
  search?: string;
  dueWithin?: DateFilter;
  list?: string;
  priority?: PriorityFilter;
  recurring?: boolean;
  locationBased?: boolean;
  tags?: string[];
  /**
   * Due-date window bounds passed straight to `event reminders list
   * --start/--end`. Unlike `dueWithin` (which is applied in TS against a full
   * fetch), a window is pushed down to the CLI so the fetch itself is scoped.
   */
  startDate?: string;
  endDate?: string;
}

/**
 * Narrows the raw `event` JSON response by the filter predicates that don't
 * require `mapReminder`'s notes-field regex scans. Used by the repository to
 * skip mapping reminders that the caller will discard anyway.
 *
 * Notes-dependent filters (tags, full-text search) and date-window filters
 * stay in {@link applyReminderFilters} for now — date parsing per reminder is
 * not free, and tag filtering needs the mapped form.
 */
export function prefilterReminderJsons(
  reminders: ReminderJSON[],
  filters: ReminderFilters,
): ReminderJSON[] {
  let result = reminders;

  if (filters.priority) {
    const target = PRIORITY_FILTER_MAP[filters.priority];
    result = result.filter((reminder) => reminder.priority === target);
  }

  if (filters.recurring) {
    result = result.filter(
      (reminder) => (reminder.recurrenceRules?.length ?? 0) > 0,
    );
  }

  if (filters.locationBased) {
    result = result.filter(
      (reminder) =>
        reminder.locationTrigger != null ||
        (reminder.alarms?.some(
          (alarm) =>
            alarm?.locationTrigger != null &&
            alarm.locationTrigger.proximity !== 'none',
        ) ??
          false),
    );
  }

  return result;
}

/**
 * Applies multiple filters to a list of reminders
 */
export function applyReminderFilters(
  reminders: Reminder[],
  filters: ReminderFilters,
): Reminder[] {
  let filteredReminders = [...reminders];

  // Filter by completion status
  if (filters.showCompleted !== undefined) {
    filteredReminders = filteredReminders.filter(
      (reminder) => filters.showCompleted || !reminder.isCompleted,
    );
  }

  // Filter by list
  if (filters.list) {
    filteredReminders = filteredReminders.filter(
      (reminder) => reminder.list === filters.list,
    );
  }

  // Filter by search term
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredReminders = filteredReminders.filter(
      (reminder) =>
        reminder.title.toLowerCase().includes(searchLower) ||
        reminder.notes?.toLowerCase().includes(searchLower),
    );
  }

  // Filter by due date
  if (filters.dueWithin) {
    filteredReminders = filterRemindersByDate(
      filteredReminders,
      filters.dueWithin,
    );
  }

  // Filter by priority
  if (filters.priority) {
    const priorityValue = PRIORITY_FILTER_MAP[filters.priority];
    filteredReminders = filteredReminders.filter(
      (reminder) => reminder.priority === priorityValue,
    );
  }

  // Filter by recurring status
  if (filters.recurring !== undefined && filters.recurring) {
    filteredReminders = filteredReminders.filter(
      (reminder) => (reminder.recurrenceRules?.length ?? 0) > 0,
    );
  }

  // Filter by location-based status
  if (filters.locationBased !== undefined && filters.locationBased) {
    filteredReminders = filteredReminders.filter(
      (reminder) => reminder.locationTrigger !== undefined,
    );
  }

  // Filter by tags (must have ALL specified tags)
  if (filters.tags && filters.tags.length > 0) {
    const { tags } = filters;
    filteredReminders = filteredReminders.filter((reminder) =>
      hasAllTags(reminder.tags, tags),
    );
  }

  return filteredReminders;
}
