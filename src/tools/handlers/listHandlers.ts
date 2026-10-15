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
  createStructuredToolResult,
  extractAndValidateArgs,
} from './shared.js';

export const handleReadReminderLists = async (): Promise<CallToolResult> => {
  return handleAsyncOperation(async () => {
    const lists = await reminderRepository.findAllLists();
    return createStructuredToolResult('Read reminder lists.', lists);
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
    return createStructuredToolResult('Created reminder list.', [list]);
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
    return createStructuredToolResult('Updated reminder list.', [list]);
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
    return createStructuredToolResult('Deleted reminder list.', [
      { name: validatedArgs.name },
    ]);
  }, 'delete reminder list');
};
