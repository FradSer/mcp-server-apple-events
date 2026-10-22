/**
 * reminderRepository.ts
 * Repository for reminder data access via the vendored `event` CLI.
 *
 * Tags and subtasks are TS-managed in the notes field (`[#tag]` and
 * `---SUBTASKS---` blocks); the `event --tags` / `--parentTitle` flags are
 * not used so the AdvancedReminderEdit Shortcut is not required.
 */

import type { Reminder, ReminderList } from '../types/index.js';
import type {
  AlarmJSON,
  CreateReminderData,
  IReminderRepository,
  ListJSON,
  RecurrenceRuleJSON,
  ReminderJSON,
  UpdateReminderData,
} from '../types/repository.js';
import type { ReminderFilters } from './dateFiltering.js';
import {
  applyReminderFilters,
  prefilterReminderJsons,
} from './dateFiltering.js';
import {
  formatDateOnlyOrFallback,
  shiftDays,
  toDateOnly,
} from './dateUtils.js';
import { CliUserError } from './errorHandling.js';
import { executeEventCliJson, executeEventCliPlain } from './eventCli.js';
import {
  addArg,
  addOptionalArg,
  addOptionalNumberArg,
  nullToUndefined,
} from './helpers.js';
import { parseReminderDueDate } from './reminderDateParser.js';
import { getSubtaskProgress, parseSubtasks } from './subtaskUtils.js';
import { extractTags } from './tagUtils.js';

const VALID_ALARM_TYPES = ['display', 'audio', 'procedure', 'email'] as const;
type AlarmType = (typeof VALID_ALARM_TYPES)[number];
const isValidAlarmType = (value: unknown): value is AlarmType =>
  (VALID_ALARM_TYPES as readonly string[]).includes(value as string);
const mapAlarmType = (
  alarmType: string | null | undefined,
): AlarmType | undefined =>
  alarmType && isValidAlarmType(alarmType) ? alarmType : undefined;

/**
 * `event` returns reminders without a top-level `locationTrigger` field —
 * geofence triggers live inside the `alarms[].locationTrigger` shape. The
 * downstream formatter / icon logic still keys off `reminder.locationTrigger`
 * to render 📍, so derive the first alarm's location trigger here to preserve
 * the existing read-side rendering. Alarms whose proximity is `'none'`
 * (`EKAlarmProximityNone` — geofence configured but no fire condition) are
 * skipped so they don't show up as misleading "Arriving at..." entries.
 */
const deriveTopLevelLocationTrigger = (
  alarms: AlarmJSON[] | null | undefined,
): ReminderJSON['locationTrigger'] => {
  if (!alarms || alarms.length === 0) return null;
  for (const alarm of alarms) {
    if (alarm?.locationTrigger && alarm.locationTrigger.proximity !== 'none') {
      return alarm.locationTrigger;
    }
  }
  return null;
};

// Maps the wire-level proximity union (event emits 'enter' / 'leave' / 'none')
// onto the domain union ('enter' / 'leave'). 'none' returns undefined so the
// caller can skip surfacing an unconfigured trigger.
const mapProximity = (
  proximity: 'enter' | 'leave' | 'none',
): 'enter' | 'leave' | undefined =>
  proximity === 'leave' ? 'leave' : proximity === 'enter' ? 'enter' : undefined;

const mapList = (list: ListJSON): ReminderList => ({
  id: list.id,
  title: list.title,
  color: list.color ?? undefined,
});

const DEFAULT_READ_WINDOW_DAYS = 14;

/**
 * Resolves the optional `--start/--end` window bounds the CLI expects. Both
 * bounds are required by `event reminders list`, so a caller-supplied window
 * is normalized to date-only strings and filled from the other side (a 14-day
 * window) when only one bound is given. When neither is supplied, no window is
 * applied — the CLI returns the full (incomplete) store, preserving the
 * current default behavior.
 */
const resolveReadDateWindow = (filters: {
  startDate?: string;
  endDate?: string;
}): { startDate?: string; endDate?: string } => {
  if (!filters.startDate && !filters.endDate) {
    return {};
  }

  if (filters.startDate && filters.endDate) {
    return {
      startDate: toDateOnly(filters.startDate),
      endDate: toDateOnly(filters.endDate),
    };
  }

  if (filters.startDate && !filters.endDate) {
    // `parseReminderDueDate` is the strict parser shared with the calendar
    // pipeline; it rejects auto-corrected dates like `2025-02-30` that the
    // native `Date` constructor silently coerces to March 2. Parse the
    // date-prefix so a DST-gap time (e.g. 2026-03-08 02:30:00 in a spring-forward
    // zone) still anchors the fill to the supplied date instead of today.
    const start = parseReminderDueDate(toDateOnly(filters.startDate));
    const startDate = toDateOnly(filters.startDate);
    return {
      startDate,
      endDate: formatDateOnlyOrFallback(
        shiftDays(start ?? new Date(), DEFAULT_READ_WINDOW_DAYS),
        startDate,
      ),
    };
  }

  // !filters.startDate && filters.endDate
  const endStr = filters.endDate as string;
  const end = parseReminderDueDate(toDateOnly(endStr));
  return {
    startDate: formatDateOnlyOrFallback(
      shiftDays(end ?? new Date(), -DEFAULT_READ_WINDOW_DAYS),
      toDateOnly(endStr),
    ),
    endDate: toDateOnly(endStr),
  };
};

class ReminderRepository implements IReminderRepository {
  private mapReminder(reminder: ReminderJSON): Reminder {
    const normalizedReminder = nullToUndefined(reminder, [
      'notes',
      'url',
      'dueDate',
      'startDate',
      'completionDate',
      'location',
      'timeZone',
      'creationDate',
      'lastModifiedDate',
      'externalId',
    ]) as Reminder;

    const mapRecurrenceRule = (rule: RecurrenceRuleJSON) => ({
      frequency: rule.frequency,
      interval: rule.interval ?? 1,
      endDate: rule.endDate ?? undefined,
      occurrenceCount: rule.occurrenceCount ?? undefined,
      daysOfWeek: rule.daysOfWeek ?? undefined,
      daysOfMonth: rule.daysOfMonth ?? undefined,
      monthsOfYear: rule.monthsOfYear ?? undefined,
    });

    if (reminder.recurrenceRules && reminder.recurrenceRules.length > 0) {
      normalizedReminder.recurrenceRules =
        reminder.recurrenceRules.map(mapRecurrenceRule);
    }

    const derivedLocationTrigger =
      reminder.locationTrigger ??
      deriveTopLevelLocationTrigger(reminder.alarms);
    if (derivedLocationTrigger) {
      const proximity = mapProximity(derivedLocationTrigger.proximity);
      if (proximity) {
        normalizedReminder.locationTrigger = {
          title: derivedLocationTrigger.title,
          latitude: derivedLocationTrigger.latitude,
          longitude: derivedLocationTrigger.longitude,
          radius: derivedLocationTrigger.radius,
          proximity,
        };
      }
    }

    if (reminder.alarms && reminder.alarms.length > 0) {
      normalizedReminder.alarms = reminder.alarms
        .filter((alarm): alarm is AlarmJSON => alarm !== null)
        .map((alarm) => {
          const alarmProximity = alarm.locationTrigger
            ? mapProximity(alarm.locationTrigger.proximity)
            : undefined;
          return {
            relativeOffset: alarm.relativeOffset ?? undefined,
            absoluteDate: alarm.absoluteDate ?? undefined,
            alarmType: mapAlarmType(alarm.alarmType),
            locationTrigger:
              alarm.locationTrigger && alarmProximity
                ? {
                    title: alarm.locationTrigger.title,
                    latitude: alarm.locationTrigger.latitude,
                    longitude: alarm.locationTrigger.longitude,
                    radius: alarm.locationTrigger.radius,
                    proximity: alarmProximity,
                  }
                : undefined,
          };
        });
    }

    const tags = extractTags(reminder.notes);
    if (tags.length > 0) {
      normalizedReminder.tags = tags;
    }

    const subtasks = parseSubtasks(reminder.notes);
    if (subtasks.length > 0) {
      normalizedReminder.subtasks = subtasks;
      normalizedReminder.subtaskProgress = getSubtaskProgress(subtasks);
    }

    return normalizedReminder;
  }

  private mapReminders(reminders: ReminderJSON[]): Reminder[] {
    return reminders.map((reminder) => this.mapReminder(reminder));
  }

  async findReminderById(id: string): Promise<Reminder> {
    const args: string[] = ['reminders', 'get'];
    addArg(args, '--id', id);
    args.push('--json');
    return this.mapReminder(await executeEventCliJson<ReminderJSON>(args));
  }

  async findReminders(filters: ReminderFilters = {}): Promise<Reminder[]> {
    const args: string[] = ['reminders', 'list'];
    addOptionalArg(args, '--list', filters.list);
    if (filters.showCompleted) {
      args.push('--completed');
    }
    const window = resolveReadDateWindow(filters);
    if (window.startDate) {
      addArg(args, '--start', window.startDate);
    }
    if (window.endDate) {
      addArg(args, '--end', window.endDate);
    }
    args.push('--json');

    const reminders = await executeEventCliJson<ReminderJSON[]>(args);

    // Apply the cheap structural filters on raw JSON before `mapReminder`'s
    // regex scans for tags / subtasks — important when the result set is
    // large and the user wants a narrow slice (e.g. priority='high').
    const preFiltered = prefilterReminderJsons(reminders, filters);
    const normalized = this.mapReminders(preFiltered);

    return applyReminderFilters(normalized, {
      ...filters,
      // `event` filters out completed reminders unless `--completed` is set;
      // list filtering is done by event too. Priority/recurring/locationBased
      // were already applied to JSON. Leave only search/dueWithin/tags for
      // the post-map pass.
      showCompleted: undefined,
      list: undefined,
      priority: undefined,
      recurring: undefined,
      locationBased: undefined,
    });
  }

  async findAllLists(): Promise<ReminderList[]> {
    const lists = await executeEventCliJson<ListJSON[]>([
      'reminders',
      'lists',
      'list',
      '--json',
    ]);
    return lists.map(mapList);
  }

  async createReminder(data: CreateReminderData): Promise<ReminderJSON> {
    const args: string[] = ['reminders', 'create'];
    addArg(args, '--title', data.title);
    addOptionalArg(args, '--list', data.list);
    addOptionalArg(args, '--notes', data.notes);
    addOptionalArg(args, '--url', data.url);
    addOptionalArg(args, '--due', data.dueDate);
    addOptionalNumberArg(args, '--priority', data.priority);
    // Skip the AdvancedReminderEdit Shortcut path — tags / subtasks live in
    // the notes field (see tagUtils / subtaskUtils).
    args.push('--no-shortcuts', '--json');
    return executeEventCliJson<ReminderJSON>(args);
  }

  async updateReminder(data: UpdateReminderData): Promise<ReminderJSON> {
    // Cross-list moves are rejected by the handler, which shares its
    // `findReminderById` fetch with the notes-rebuild path.
    const args: string[] = ['reminders', 'update'];
    addArg(args, '--id', data.id);
    addOptionalArg(args, '--title', data.newTitle);
    addOptionalArg(args, '--notes', data.notes);
    addOptionalArg(args, '--url', data.url);
    addOptionalArg(args, '--due', data.dueDate);
    addOptionalArg(args, '--start', data.startDate);
    addOptionalNumberArg(args, '--priority', data.priority);
    if (data.isCompleted !== undefined) {
      addArg(args, '--completed', data.isCompleted ? 'true' : 'false');
    }
    args.push('--no-shortcuts', '--json');
    return executeEventCliJson<ReminderJSON>(args);
  }

  async deleteReminder(id: string): Promise<void> {
    // `event reminders delete` prints a status line ("Reminder deleted
    // successfully") instead of JSON. Use the plain-text executor so we don't
    // attempt to JSON.parse the success message.
    const args: string[] = ['reminders', 'delete'];
    addArg(args, '--id', id);
    await executeEventCliPlain(args);
  }

  async createReminderList(name: string): Promise<ReminderList> {
    const args: string[] = ['reminders', 'lists', 'create'];
    addArg(args, '--name', name);
    args.push('--json');
    return mapList(await executeEventCliJson<ListJSON>(args));
  }

  /**
   * Resolves a list name to its EventKit identifier. `event reminders lists
   * update|delete` are keyed by id, not name, so we have to round-trip
   * through `lists list` whenever a caller targets a list by name.
   */
  private async resolveListIdByName(name: string): Promise<string> {
    const lists = await executeEventCliJson<ListJSON[]>([
      'reminders',
      'lists',
      'list',
      '--json',
    ]);
    const match = lists.find((list) => list.title === name);
    if (!match) {
      throw new CliUserError(`List '${name}' not found.`);
    }
    return match.id;
  }

  async updateReminderList(
    currentName: string,
    newName: string,
  ): Promise<ReminderList> {
    const id = await this.resolveListIdByName(currentName);
    const args: string[] = ['reminders', 'lists', 'update'];
    addArg(args, '--id', id);
    addArg(args, '--name', newName);
    args.push('--json');
    return mapList(await executeEventCliJson<ListJSON>(args));
  }

  async deleteReminderList(name: string): Promise<void> {
    const id = await this.resolveListIdByName(name);
    const args: string[] = ['reminders', 'lists', 'delete'];
    addArg(args, '--id', id);
    await executeEventCliPlain(args);
  }
}

export const reminderRepository = new ReminderRepository();

export { ReminderRepository };
