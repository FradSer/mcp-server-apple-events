/**
 * handlers/subtaskHandlers.ts
 * Handlers for subtask operations within reminders
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SubtasksToolArgs } from '../../types/index.js';
import { handleAsyncOperation } from '../../utils/errorHandling.js';
import { reminderRepository } from '../../utils/reminderRepository.js';
import {
  addSubtask,
  parseSubtasks,
  removeSubtask,
  reorderSubtasks,
  toggleSubtask,
  updateSubtask,
} from '../../utils/subtaskUtils.js';
import {
  CreateSubtaskSchema,
  DeleteSubtaskSchema,
  ReadSubtasksSchema,
  ReorderSubtasksSchema,
  ToggleSubtaskSchema,
  UpdateSubtaskSchema,
} from '../../validation/schemas.js';
import {
  createStructuredToolResult,
  extractAndValidateArgs,
} from './shared.js';

export const handleReadSubtasks = async (
  args: SubtasksToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, ReadSubtasksSchema);

    const reminder = await reminderRepository.findReminderById(
      validatedArgs.reminderId,
    );
    const subtasks = parseSubtasks(reminder.notes);

    return createStructuredToolResult('Read reminder subtasks.', [
      { parentTitle: reminder.title, subtasks },
    ]);
  }, 'read subtasks');
};

export const handleCreateSubtask = async (
  args: SubtasksToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, CreateSubtaskSchema);

    const reminder = await reminderRepository.findReminderById(
      validatedArgs.reminderId,
    );

    const { notes: updatedNotes, subtask } = addSubtask(
      validatedArgs.title,
      reminder.notes,
    );

    await reminderRepository.updateReminder({
      id: validatedArgs.reminderId,
      notes: updatedNotes,
    });

    return createStructuredToolResult('Created subtask.', [subtask]);
  }, 'create subtask');
};

export const handleUpdateSubtask = async (
  args: SubtasksToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, UpdateSubtaskSchema);

    const reminder = await reminderRepository.findReminderById(
      validatedArgs.reminderId,
    );

    const updatedNotes = updateSubtask(
      validatedArgs.subtaskId,
      {
        title: validatedArgs.title,
        isCompleted: validatedArgs.completed,
      },
      reminder.notes,
    );

    await reminderRepository.updateReminder({
      id: validatedArgs.reminderId,
      notes: updatedNotes,
    });

    return createStructuredToolResult(
      'Updated subtask.',
      parseSubtasks(updatedNotes).filter(
        (subtask) => subtask.id === validatedArgs.subtaskId,
      ),
    );
  }, 'update subtask');
};

export const handleDeleteSubtask = async (
  args: SubtasksToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, DeleteSubtaskSchema);

    const reminder = await reminderRepository.findReminderById(
      validatedArgs.reminderId,
    );

    const updatedNotes = removeSubtask(validatedArgs.subtaskId, reminder.notes);

    await reminderRepository.updateReminder({
      id: validatedArgs.reminderId,
      notes: updatedNotes,
    });

    return createStructuredToolResult('Deleted subtask.', [
      {
        reminderId: validatedArgs.reminderId,
        subtaskId: validatedArgs.subtaskId,
      },
    ]);
  }, 'delete subtask');
};

export const handleToggleSubtask = async (
  args: SubtasksToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, ToggleSubtaskSchema);

    const reminder = await reminderRepository.findReminderById(
      validatedArgs.reminderId,
    );

    const { notes: updatedNotes, subtask } = toggleSubtask(
      validatedArgs.subtaskId,
      reminder.notes,
    );

    await reminderRepository.updateReminder({
      id: validatedArgs.reminderId,
      notes: updatedNotes,
    });

    return createStructuredToolResult('Updated subtask completion.', [subtask]);
  }, 'toggle subtask');
};

export const handleReorderSubtasks = async (
  args: SubtasksToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(args, ReorderSubtasksSchema);

    const reminder = await reminderRepository.findReminderById(
      validatedArgs.reminderId,
    );

    const updatedNotes = reorderSubtasks(validatedArgs.order, reminder.notes);

    await reminderRepository.updateReminder({
      id: validatedArgs.reminderId,
      notes: updatedNotes,
    });

    return createStructuredToolResult('Reordered subtasks.', [
      {
        reminderId: validatedArgs.reminderId,
        order: validatedArgs.order,
      },
    ]);
  }, 'reorder subtasks');
};
