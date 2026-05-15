/**
 * handlers/formatters.ts
 * Shared display formatters for reminder/event sub-structures (alarms,
 * recurrence rules, location triggers). Calendar events and reminders both
 * persist these as the same EventKit primitives, so rendering them through
 * a single set of helpers keeps the two tool outputs consistent.
 */

import type {
  Alarm,
  LocationTrigger,
  RecurrenceRule,
} from '../../types/index.js';

/**
 * Formats a single recurrence rule into a short human-readable phrase
 * (e.g. "every 2 weeks on Mon, Wed").
 */
export const formatRecurrence = (recurrence: RecurrenceRule): string => {
  const parts: string[] = [];
  const interval =
    recurrence.interval > 1 ? `every ${recurrence.interval} ` : '';

  switch (recurrence.frequency) {
    case 'minutely':
      parts.push(`${interval}minute${recurrence.interval > 1 ? 's' : ''}`);
      break;
    case 'hourly':
      parts.push(`${interval}hour${recurrence.interval > 1 ? 's' : ''}`);
      break;
    case 'daily':
      parts.push(`${interval}day${recurrence.interval > 1 ? 's' : ''}`);
      break;
    case 'weekly':
      parts.push(`${interval}week${recurrence.interval > 1 ? 's' : ''}`);
      if (recurrence.daysOfWeek?.length) {
        const dayNames = ['', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = recurrence.daysOfWeek.map((d) => dayNames[d]).join(', ');
        parts.push(`on ${days}`);
      }
      break;
    case 'monthly':
      parts.push(`${interval}month${recurrence.interval > 1 ? 's' : ''}`);
      if (recurrence.daysOfMonth?.length) {
        parts.push(
          `on day${recurrence.daysOfMonth.length > 1 ? 's' : ''} ${recurrence.daysOfMonth.join(', ')}`,
        );
      }
      break;
    case 'yearly':
      parts.push(`${interval}year${recurrence.interval > 1 ? 's' : ''}`);
      if (recurrence.monthsOfYear?.length) {
        const monthNames = [
          '',
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ];
        const months = recurrence.monthsOfYear
          .map((m) => monthNames[m])
          .join(', ');
        parts.push(`in ${months}`);
      }
      break;
    default: {
      const exhaustiveCheck: never = recurrence.frequency;
      throw new Error(`Unknown recurrence frequency: ${exhaustiveCheck}`);
    }
  }

  if (recurrence.endDate) {
    parts.push(`until ${recurrence.endDate}`);
  } else if (recurrence.occurrenceCount) {
    parts.push(`(${recurrence.occurrenceCount} times)`);
  }

  return parts.join(' ');
};

export const formatRecurrenceRules = (rules: RecurrenceRule[]): string => {
  const [first, ...rest] = rules;
  if (first && rest.length === 0) return formatRecurrence(first);
  return rules.map((rule) => formatRecurrence(rule)).join('; ');
};

/**
 * Formats a location trigger as a short human-readable phrase
 * (e.g. `Arriving at "Home" (100m radius)`).
 */
export const formatLocationTrigger = (location: LocationTrigger): string => {
  const proximityText =
    location.proximity === 'enter' ? 'Arriving at' : 'Leaving';
  const radiusText = location.radius ? ` (${location.radius}m radius)` : '';
  return `${proximityText} "${location.title}"${radiusText}`;
};

/**
 * Formats a single alarm — relative offset, absolute date, or location
 * trigger — into a single line.
 */
export const formatAlarm = (alarm: Alarm): string => {
  const typeStr = alarm.alarmType ? ` (${alarm.alarmType})` : '';
  if (alarm.absoluteDate) return `at ${alarm.absoluteDate}${typeStr}`;
  if (alarm.relativeOffset !== undefined)
    return `${alarm.relativeOffset}s from due/start${typeStr}`;
  if (alarm.locationTrigger)
    return `on ${formatLocationTrigger(alarm.locationTrigger)}${typeStr}`;
  return 'unknown';
};
