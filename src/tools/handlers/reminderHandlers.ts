/**
 * handlers/reminderHandlers.ts
 * Handlers for reminder task operations
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  PRIORITY_LABELS,
  type Reminder,
  type RemindersToolArgs,
} from '../../types/index.js';
import {
  CliUserError,
  handleAsyncOperation,
} from '../../utils/errorHandling.js';
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

const buildReminderIcons = (reminder: Reminder): string => {
  const icons: string[] = [];
  if (reminder.recurrenceRules && reminder.recurrenceRules.length > 0)
    icons.push('🔄');
  if (reminder.locationTrigger) icons.push('📍');
  if (reminder.tags && reminder.tags.length > 0) icons.push('🏷️');
  if (reminder.subtasks && reminder.subtasks.length > 0) icons.push('📋');
  return icons.length > 0 ? ` ${icons.join('')}` : '';
};

const formatReminderMarkdown = (reminder: Reminder): string[] => {
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
  if (reminder.recurrenceRules && reminder.recurrenceRules.length > 0) {
    lines.push(
      `  - Repeats: ${formatRecurrenceRules(reminder.recurrenceRules)}`,
    );
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
      list: validatedArgs.targetList,
      dueDate: validatedArgs.dueDate,
      priority: validatedArgs.priority,
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

    // `event reminders update` cannot un-complete or move between lists.
    // Reject both up front so the user sees a clear error instead of a
    // silently-dropped change. The cross-list-move check needs the current
    // reminder, so coalesce it with the notes-rebuild fetch below.
    if (validatedArgs.completed === false) {
      throw new CliUserError(
        'Marking a reminder uncompleted is not supported by the underlying `event` CLI. Toggle completion from Reminders.app.',
      );
    }

    // Empty `addTags`/`removeTags` arrays are no-ops; only fetch the current
    // reminder when there's a real change to apply.
    const shouldRebuildNotes =
      validatedArgs.note !== undefined ||
      validatedArgs.tags !== undefined ||
      (validatedArgs.addTags?.length ?? 0) > 0 ||
      (validatedArgs.removeTags?.length ?? 0) > 0;
    const needsListCheck = validatedArgs.targetList !== undefined;

    let notesToSend = validatedArgs.note;
    if (shouldRebuildNotes || needsListCheck) {
      const currentReminder = await reminderRepository.findReminderById(
        validatedArgs.id,
      );
      if (needsListCheck && currentReminder.list !== validatedArgs.targetList) {
        throw new CliUserError(
          'Moving a reminder between lists is not supported by the underlying `event` CLI. Move it from Reminders.app, or delete and recreate the reminder in the target list.',
        );
      }
      if (shouldRebuildNotes) {
        notesToSend = rebuildNotesForUpdate(
          currentReminder.notes,
          validatedArgs.note,
          validatedArgs.tags,
          validatedArgs.addTags,
          validatedArgs.removeTags,
        );
      }
    }

    const reminder = await reminderRepository.updateReminder({
      id: validatedArgs.id,
      newTitle: validatedArgs.title,
      notes: notesToSend,
      url: validatedArgs.url,
      isCompleted: validatedArgs.completed,
      startDate: validatedArgs.startDate,
      dueDate: validatedArgs.dueDate,
      priority: validatedArgs.priority,
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
