/**
 * handlers/listHandlers.ts
 * Handlers for reminder list operations
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ListsToolArgs } from '../../types/index.js';
import { handleAsyncOperation } from '../../utils/errorHandling.js';
import { reminderRepository } from '../../utils/reminderRepository.js';
import {
  CreateReminderListSchema,
  DeleteReminderListSchema,
  UpdateReminderListSchema,
} from '../../validation/schemas.js';
import {
  extractAndValidateArgs,
  formatDeleteMessage,
  formatListMarkdown,
  formatSuccessMessage,
} from './shared.js';

const formatReminderList = (list: {
  title: string;
  id: string;
  color?: string;
}): string[] => {
  let display = list.title;
  if (list.color) {
    display = `${display} (Color: ${list.color})`;
  }
  return [`- ${display} (ID: ${list.id})`];
};

export const handleReadReminderLists = async (): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const lists = await reminderRepository.findAllLists();
    return formatListMarkdown(
      'Reminder Lists',
      lists,
      formatReminderList,
      'No reminder lists found.',
    );
  }, 'read reminder lists');
};

export const handleCreateReminderList = async (
  args: ListsToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(
      args,
      CreateReminderListSchema,
    );
    const list = await reminderRepository.createReminderList(
      validatedArgs.name,
    );
    return formatSuccessMessage('created', 'list', list.title, list.id);
  }, 'create reminder list');
};

export const handleUpdateReminderList = async (
  args: ListsToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(
      args,
      UpdateReminderListSchema,
    );
    const list = await reminderRepository.updateReminderList(
      validatedArgs.name,
      validatedArgs.newName,
    );
    return formatSuccessMessage('updated', 'list', list.title, list.id);
  }, 'update reminder list');
};

export const handleDeleteReminderList = async (
  args: ListsToolArgs,
): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const validatedArgs = extractAndValidateArgs(
      args,
      DeleteReminderListSchema,
    );
    await reminderRepository.deleteReminderList(validatedArgs.name);
    return formatDeleteMessage('list', validatedArgs.name, {
      useQuotes: true,
      useIdPrefix: false,
      usePeriod: true,
    });
  }, 'delete reminder list');
};
