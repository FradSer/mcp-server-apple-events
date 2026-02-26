/**
 * reminderRepository.ts
 * Repository pattern implementation for reminder data access operations using EventKitCLI.
 */

import type { Reminder, ReminderList } from '../types/index.js';
import type {
  AlarmJSON,
  CreateReminderData,
  ListJSON,
  RecurrenceRuleJSON,
  ReminderJSON,
  ReminderReadResult,
  UpdateReminderData,
} from '../types/repository.js';
import { getListEmblems, setListEmblem } from './applescriptList.js';
import { executeCli } from './cliExecutor.js';
import type { ReminderFilters } from './dateFiltering.js';
import { applyReminderFilters } from './dateFiltering.js';
import {
  addOptionalArg,
  addOptionalBooleanArg,
  addOptionalJsonArg,
  addOptionalNumberArg,
  nullToUndefined,
} from './helpers.js';
import { getSubtaskProgress, parseSubtasks } from './subtaskUtils.js';
import { extractTags } from './tagUtils.js';

const VALID_ALARM_TYPES = ['display', 'audio', 'procedure', 'email'] as const;

const isValidAlarmType = (
  value: unknown,
): value is 'display' | 'audio' | 'procedure' | 'email' =>
  (VALID_ALARM_TYPES as readonly string[]).includes(value as string);

const mapAlarmType = (
  alarmType: string | null | undefined,
): 'display' | 'audio' | 'procedure' | 'email' | undefined => {
  if (alarmType && isValidAlarmType(alarmType)) {
    return alarmType;
  }
  return undefined;
};

class ReminderRepository {
  private mapReminder(reminder: ReminderJSON): Reminder {
    // Convert null values to undefined for optional fields
    // dueDate is passed through as-is from Swift CLI to avoid double timezone conversion
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

    // Map recurrence rules from JSON (convert nulls to undefined, default interval to 1)
    if (reminder.recurrenceRules && reminder.recurrenceRules.length > 0) {
      normalizedReminder.recurrenceRules =
        reminder.recurrenceRules.map(mapRecurrenceRule);
    }

    // Map location trigger from JSON
    if (reminder.locationTrigger) {
      normalizedReminder.locationTrigger = {
        title: reminder.locationTrigger.title,
        latitude: reminder.locationTrigger.latitude,
        longitude: reminder.locationTrigger.longitude,
        radius: reminder.locationTrigger.radius,
        proximity:
          reminder.locationTrigger.proximity === 'leave' ? 'leave' : 'enter',
      };
    }

    // Map alarms from JSON
    if (reminder.alarms && reminder.alarms.length > 0) {
      normalizedReminder.alarms = reminder.alarms
        .filter((alarm): alarm is AlarmJSON => alarm !== null)
        .map((alarm) => ({
          relativeOffset: alarm.relativeOffset ?? undefined,
          absoluteDate: alarm.absoluteDate ?? undefined,
          alarmType: mapAlarmType(alarm.alarmType),
          locationTrigger: alarm.locationTrigger
            ? {
                title: alarm.locationTrigger.title,
                latitude: alarm.locationTrigger.latitude,
                longitude: alarm.locationTrigger.longitude,
                radius: alarm.locationTrigger.radius,
                proximity:
                  alarm.locationTrigger.proximity === 'leave'
                    ? 'leave'
                    : 'enter',
              }
            : undefined,
        }));
    }

    // Extract tags from notes
    const tags = extractTags(reminder.notes);
    if (tags.length > 0) {
      normalizedReminder.tags = tags;
    }

    // Extract subtasks from notes
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
    const reminderJSON = await executeCli<ReminderJSON>([
      '--action',
      'read-by-id',
      '--id',
      id,
    ]);
    return this.mapReminder(reminderJSON);
  }

  async findReminders(filters: ReminderFilters = {}): Promise<Reminder[]> {
    const args = ['--action', 'read'];
    addOptionalBooleanArg(
      args,
      '--showCompleted',
      filters.showCompleted ?? true,
    );
    addOptionalArg(args, '--filterList', filters.list);
    addOptionalArg(args, '--search', filters.search);
    addOptionalArg(args, '--dueWithin', filters.dueWithin);

    const { reminders } = await executeCli<ReminderReadResult>(args);
    const normalizedReminders = this.mapReminders(reminders);

    return applyReminderFilters(normalizedReminders, {
      ...filters,
      showCompleted: undefined,
      list: undefined,
      search: undefined,
      dueWithin: undefined,
    });
  }

  async findAllLists(): Promise<ReminderList[]> {
    const lists = await executeCli<ListJSON[]>(['--action', 'read-lists']);

    // Get emblems for all lists in parallel
    const listTitles = lists.map((l) => l.title);
    const emblems = await getListEmblems(listTitles);

    return lists.map((list) => {
      const result: ReminderList = {
        id: list.id,
        title: list.title,
      };

      // Add color if present and not null
      if (list.color) {
        result.color = list.color;
      }

      // Add emblem if found
      const emblem = emblems.get(list.title);
      if (emblem) {
        result.emblem = emblem;
      }

      return result;
    });
  }

  async createReminder(data: CreateReminderData): Promise<ReminderJSON> {
    const args = ['--action', 'create', '--title', data.title];
    addOptionalArg(args, '--targetList', data.list);
    addOptionalArg(args, '--note', data.notes);
    addOptionalArg(args, '--url', data.url);
    addOptionalArg(args, '--location', data.location);
    addOptionalArg(args, '--startDate', data.startDate);
    addOptionalArg(args, '--dueDate', data.dueDate);
    addOptionalNumberArg(args, '--priority', data.priority);
    addOptionalBooleanArg(args, '--isCompleted', data.isCompleted);
    addOptionalJsonArg(args, '--alarms', data.alarms);
    addOptionalJsonArg(args, '--recurrenceRules', data.recurrenceRules);
    addOptionalJsonArg(args, '--locationTrigger', data.locationTrigger);

    return executeCli<ReminderJSON>(args);
  }

  async updateReminder(data: UpdateReminderData): Promise<ReminderJSON> {
    const args = ['--action', 'update', '--id', data.id];
    addOptionalArg(args, '--title', data.newTitle);
    addOptionalArg(args, '--targetList', data.list);
    addOptionalArg(args, '--note', data.notes);
    addOptionalArg(args, '--url', data.url);
    addOptionalArg(args, '--location', data.location);
    addOptionalArg(args, '--startDate', data.startDate);
    addOptionalArg(args, '--dueDate', data.dueDate);
    addOptionalBooleanArg(args, '--isCompleted', data.isCompleted);
    addOptionalArg(args, '--completionDate', data.completionDate);
    addOptionalNumberArg(args, '--priority', data.priority);
    addOptionalJsonArg(args, '--alarms', data.alarms);
    addOptionalBooleanArg(args, '--clearAlarms', data.clearAlarms);
    addOptionalJsonArg(args, '--recurrenceRules', data.recurrenceRules);
    addOptionalBooleanArg(args, '--clearRecurrence', data.clearRecurrence);
    addOptionalJsonArg(args, '--locationTrigger', data.locationTrigger);
    addOptionalBooleanArg(
      args,
      '--clearLocationTrigger',
      data.clearLocationTrigger,
    );

    return executeCli<ReminderJSON>(args);
  }

  async deleteReminder(id: string): Promise<void> {
    await executeCli<unknown>(['--action', 'delete', '--id', id]);
  }

  async createReminderList(
    name: string,
    color?: string,
    emblem?: string,
  ): Promise<ReminderList> {
    const args = ['--action', 'create-list', '--name', name];
    if (color) {
      args.push('--color', color);
    }
    const listJson = await executeCli<ListJSON>(args);

    // Set emblem if provided
    let actualEmblem: string | undefined;
    if (emblem) {
      try {
        await setListEmblem(name, emblem);
        actualEmblem = emblem;
      } catch {
        // Emblem setting failed but list was created
      }
    }

    return {
      id: listJson.id,
      title: listJson.title,
      color: listJson.color ?? undefined,
      emblem: actualEmblem,
    };
  }

  async updateReminderList(
    currentName: string,
    newName?: string,
    color?: string,
    emblem?: string,
  ): Promise<ReminderList> {
    const args = ['--action', 'update-list', '--name', currentName];
    const effectiveName = newName ?? currentName;

    if (newName) {
      args.push('--newName', newName);
    }
    if (color) {
      args.push('--color', color);
    }
    const listJson = await executeCli<ListJSON>(args);

    // Set emblem if provided
    let actualEmblem: string | undefined;
    if (emblem) {
      try {
        await setListEmblem(effectiveName, emblem);
        actualEmblem = emblem;
      } catch {
        // Emblem setting failed but list was updated
      }
    }

    return {
      id: listJson.id,
      title: listJson.title,
      color: listJson.color ?? undefined,
      emblem: actualEmblem,
    };
  }

  async deleteReminderList(name: string): Promise<void> {
    await executeCli<unknown>(['--action', 'delete-list', '--name', name]);
  }
}

export const reminderRepository = new ReminderRepository();
