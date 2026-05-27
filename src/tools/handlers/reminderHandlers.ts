/**
 * handlers/reminderHandlers.ts
 * Handlers for reminder task operations
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  type Alarm,
  type LocationTrigger,
  PRIORITY_LABELS,
  type RecurrenceRule,
  type RemindersToolArgs,
  type Subtask,
} from '../../types/index.js';
import { handleAsyncOperation } from '../../utils/errorHandling.js';
import { formatMultilineNotes } from '../../utils/helpers.js';
import { reminderRepository } from '../../utils/reminderRepository.js';
import {
  combineSubtasksAndNotes,
  createSubtasksFromTitles,
  parseSubtasks,
  stripSubtasks,
} from '../../utils/subtaskUtils.js';
import {
  addTagsToNotes,
  combineTagsAndNotes,
  extractTags,
  removeTagsFromNotes,
  stripTags,
} from '../../utils/tagUtils.js';
import {
  CreateReminderSchema,
  DeleteReminderSchema,
  ReadRemindersSchema,
  UpdateReminderSchema,
} from '../../validation/schemas.js';
import {
  formatAlarm,
  formatLocationTrigger,
  formatRecurrenceRules,
} from './formatters.js';
import {
  extractAndValidateArgs,
  formatDeleteMessage,
  formatListMarkdown,
  formatSuccessMessage,
  UNTRUSTED_DATA_NOTICE,
} from './shared.js';

/**
 * Rebuilds notes for update operation, handling tags and subtasks
 * @param currentNotes - Existing notes from the reminder
 * @param newNote - New note content (if provided)
 * @param tags - Complete tag replacement (if provided)
 * @param addTags - Tags to add
 * @param removeTags - Tags to remove
 * @returns Rebuilt notes with tags and subtasks preserved
 */
function rebuildNotesForUpdate(
  currentNotes: string | undefined,
  newNote: string | undefined,
  tags: string[] | undefined,
  addTags: string[] | undefined,
  removeTags: string[] | undefined,
): string {
  const existingNotes = currentNotes ?? '';
  const existingSubtasks = parseSubtasks(existingNotes);
  const notesWithoutSubtasks = stripSubtasks(existingNotes);

  let notesWithTags = notesWithoutSubtasks;

  // Add tags
  if (addTags && addTags.length > 0) {
    notesWithTags = addTagsToNotes(addTags, notesWithTags);
  }

  // Remove tags
  if (removeTags && removeTags.length > 0) {
    notesWithTags = removeTagsFromNotes(removeTags, notesWithTags);
  }

  // Replace all tags
  if (tags) {
    const baseNote =
      newNote !== undefined
        ? stripSubtasks(stripTags(newNote))
        : stripTags(notesWithoutSubtasks);
    notesWithTags = combineTagsAndNotes(tags, baseNote);
  } else if (newNote !== undefined) {
    // Update note content while preserving existing tags
    const cleanNewNote = stripSubtasks(stripTags(newNote));
    const tagsFromExisting = extractTags(notesWithTags);
    notesWithTags = combineTagsAndNotes(tagsFromExisting, cleanNewNote);
  }

  // Recombine with subtasks
  return combineSubtasksAndNotes(existingSubtasks, notesWithTags);
}

/**
 * Builds icon string based on reminder properties
 */
const buildReminderIcons = (reminder: {
  recurrence?: RecurrenceRule;
  recurrenceRules?: RecurrenceRule[];
  locationTrigger?: LocationTrigger;
  tags?: string[];
  subtasks?: Subtask[];
}): string => {
  const icons: string[] = [];
  if (reminder.recurrenceRules && reminder.recurrenceRules.length > 0)
    icons.push('🔄');
  if (reminder.locationTrigger) icons.push('📍');
  if (reminder.tags && reminder.tags.length > 0) icons.push('🏷️');
  if (reminder.subtasks && reminder.subtasks.length > 0) icons.push('📋');
  return icons.length > 0 ? ` ${icons.join('')}` : '';
};

const formatReminderMarkdown = (reminder: {
  title: string;
  isCompleted: boolean;
  list?: string;
  id?: string;
  notes?: string;
  dueDate?: string;
  url?: string;
  location?: string;
  priority?: number;
  recurrence?: RecurrenceRule;
  recurrenceRules?: RecurrenceRule[];
  locationTrigger?: LocationTrigger;
  alarms?: Alarm[];
  completionDate?: string;
  startDate?: string;
  creationDate?: string;
  lastModifiedDate?: string;
  externalId?: string;
  tags?: string[];
  subtasks?: Subtask[];
  subtaskProgress?: { completed: number; total: number; percentage: number };
}): string[] => {
  const lines: string[] = [];
  const checkbox = reminder.isCompleted ? '[x]' : '[ ]';
  const icons = buildReminderIcons(reminder);
  lines.push(`- ${checkbox} ${reminder.title}${icons}`);
  if (reminder.list) lines.push(`  - List: ${reminder.list}`);
  if (reminder.id) lines.push(`  - ID: ${reminder.id}`);
  if (reminder.priority !== undefined) {
    const priorityLabel = PRIORITY_LABELS[reminder.priority] ?? 'unknown';
    lines.push(`  - Priority: ${priorityLabel} (${reminder.priority})`);
  }
  if (reminder.startDate) lines.push(`  - Start: ${reminder.startDate}`);
  if (reminder.tags && reminder.tags.length > 0) {
    lines.push(`  - Tags: ${reminder.tags.map((t) => `#${t}`).join(' ')}`);
  }
  const recurrenceRules =
    reminder.recurrenceRules ??
    (reminder.recurrence ? [reminder.recurrence] : undefined);
  if (recurrenceRules && recurrenceRules.length > 0) {
    lines.push(`  - Repeats: ${formatRecurrenceRules(recurrenceRules)}`);
  }
  if (reminder.locationTrigger) {
    lines.push(
      `  - Location: ${formatLocationTrigger(reminder.locationTrigger)}`,
    );
  }
  if (reminder.location) lines.push(`  - Location Text: ${reminder.location}`);
  if (reminder.alarms && reminder.alarms.length > 0) {
    lines.push(`  - Alarms: ${reminder.alarms.map(formatAlarm).join('; ')}`);
  }
  if (reminder.subtasks && reminder.subtasks.length > 0) {
    const progress = reminder.subtaskProgress;
    const progressText = progress
      ? ` (${progress.completed}/${progress.total})`
      : '';
    lines.push(`  - Subtasks${progressText}:`);
    for (const subtask of reminder.subtasks) {
      const subtaskCheckbox = subtask.isCompleted ? '[x]' : '[ ]';
      lines.push(`    - ${subtaskCheckbox} ${subtask.title}`);
    }
  }
  const cleanNotes = stripSubtasks(stripTags(reminder.notes));
  if (cleanNotes) {
    lines.push(`  - Notes: ${formatMultilineNotes(cleanNotes)}`);
  }
  if (reminder.dueDate) lines.push(`  - Due: ${reminder.dueDate}`);
  if (reminder.completionDate)
    lines.push(`  - Completed: ${reminder.completionDate}`);
  if (reminder.url) lines.push(`  - URL: ${reminder.url}`);
  if (reminder.externalId)
    lines.push(`  - External ID: ${reminder.externalId}`);
  if (reminder.creationDate)
    lines.push(`  - Created: ${reminder.creationDate}`);
  if (reminder.lastModifiedDate)
    lines.push(`  - Modified: ${reminder.lastModifiedDate}`);
  return lines;
};

export const handleCreateReminder = async (
  args: RemindersToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, CreateReminderSchema);

    // Combine tags with notes if tags are provided
    let notesWithMetadata = validatedArgs.tags
      ? combineTagsAndNotes(validatedArgs.tags, validatedArgs.note)
      : validatedArgs.note;

    if (validatedArgs.subtasks && validatedArgs.subtasks.length > 0) {
      const subtasks = createSubtasksFromTitles(validatedArgs.subtasks);
      notesWithMetadata = combineSubtasksAndNotes(subtasks, notesWithMetadata);
    }

    const reminder = await reminderRepository.createReminder({
      title: validatedArgs.title,
      notes: notesWithMetadata,
      url: validatedArgs.url,
      location: validatedArgs.location,
      list: validatedArgs.targetList,
      startDate: validatedArgs.startDate,
      dueDate: validatedArgs.dueDate,
      priority: validatedArgs.priority,
      isCompleted: validatedArgs.completed,
      alarms: validatedArgs.alarms,
      recurrenceRules:
        validatedArgs.recurrenceRules ??
        (validatedArgs.recurrence ? [validatedArgs.recurrence] : undefined),
      locationTrigger: validatedArgs.locationTrigger,
    });
    return formatSuccessMessage(
      'created',
      'reminder',
      reminder.title,
      reminder.id,
    );
  }, 'create reminder');
};

export const handleUpdateReminder = async (
  args: RemindersToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, UpdateReminderSchema);

    let notesToSend = validatedArgs.note;
    const shouldRebuildNotes =
      validatedArgs.note !== undefined ||
      Boolean(validatedArgs.tags) ||
      Boolean(validatedArgs.addTags) ||
      Boolean(validatedArgs.removeTags);

    if (shouldRebuildNotes) {
      const currentReminder = await reminderRepository.findReminderById(
        validatedArgs.id,
      );
      notesToSend = rebuildNotesForUpdate(
        currentReminder.notes,
        validatedArgs.note,
        validatedArgs.tags,
        validatedArgs.addTags,
        validatedArgs.removeTags,
      );
    }

    const reminder = await reminderRepository.updateReminder({
      id: validatedArgs.id,
      newTitle: validatedArgs.title,
      notes: notesToSend,
      url: validatedArgs.url,
      location: validatedArgs.location,
      isCompleted: validatedArgs.completed,
      completionDate: validatedArgs.completionDate,
      list: validatedArgs.targetList,
      startDate: validatedArgs.startDate,
      dueDate: validatedArgs.dueDate,
      priority: validatedArgs.priority,
      alarms: validatedArgs.alarms,
      clearAlarms: validatedArgs.clearAlarms,
      recurrenceRules:
        validatedArgs.recurrenceRules ??
        (validatedArgs.recurrence ? [validatedArgs.recurrence] : undefined),
      clearRecurrence: validatedArgs.clearRecurrence,
      locationTrigger: validatedArgs.locationTrigger,
      clearLocationTrigger: validatedArgs.clearLocationTrigger,
    });
    return formatSuccessMessage(
      'updated',
      'reminder',
      reminder.title,
      reminder.id,
    );
  }, 'update reminder');
};

export const handleDeleteReminder = async (
  args: RemindersToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, DeleteReminderSchema);
    await reminderRepository.deleteReminder(validatedArgs.id);
    return formatDeleteMessage('reminder', validatedArgs.id, {
      useQuotes: false,
      useIdPrefix: true,
      usePeriod: false,
    });
  }, 'delete reminder');
};

export const handleReadReminders = async (
  args: RemindersToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, ReadRemindersSchema);

    if (validatedArgs.id) {
      const reminder = await reminderRepository.findReminderById(
        validatedArgs.id,
      );
      const markdownLines: string[] = [
        '### Reminder',
        '',
        UNTRUSTED_DATA_NOTICE,
        '',
        ...formatReminderMarkdown(reminder),
      ];
      return markdownLines.join('\n');
    }
    const reminders = await reminderRepository.findReminders({
      list: validatedArgs.filterList,
      showCompleted: validatedArgs.showCompleted,
      search: validatedArgs.search,
      dueWithin: validatedArgs.dueWithin,
      priority: validatedArgs.filterPriority,
      recurring: validatedArgs.filterRecurring,
      locationBased: validatedArgs.filterLocationBased,
      tags: validatedArgs.filterTags,
    });

    return formatListMarkdown(
      'Reminders',
      reminders,
      formatReminderMarkdown,
      'No reminders found matching the criteria.',
    );
  }, 'read reminders');
};
