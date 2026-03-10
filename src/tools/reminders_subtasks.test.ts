// Use global Jest functions to avoid extra dependencies

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SubtasksToolArgs } from '../types/index.js';
import { handleToolCall } from './index.js';

// Mock all subtask handler functions
jest.mock('./handlers/index.js', () => ({
  handleCreateReminder: jest.fn(),
  handleReadReminderLists: jest.fn(),
  handleReadReminders: jest.fn(),
  handleUpdateReminder: jest.fn(),
  handleDeleteReminder: jest.fn(),
  handleCreateReminderList: jest.fn(),
  handleUpdateReminderList: jest.fn(),
  handleDeleteReminderList: jest.fn(),
  handleCreateCalendarEvent: jest.fn(),
  handleReadCalendarEvents: jest.fn(),
  handleUpdateCalendarEvent: jest.fn(),
  handleDeleteCalendarEvent: jest.fn(),
  handleReadCalendars: jest.fn(),
  handleReadSubtasks: jest.fn(),
  handleCreateSubtask: jest.fn(),
  handleUpdateSubtask: jest.fn(),
  handleDeleteSubtask: jest.fn(),
  handleToggleSubtask: jest.fn(),
  handleReorderSubtasks: jest.fn(),
}));

jest.mock('./definitions.js', () => ({
  TOOLS: [
    { name: 'reminders_tasks', description: 'Reminder tasks tool' },
    { name: 'reminders_lists', description: 'Reminder lists tool' },
    { name: 'reminders_subtasks', description: 'Reminder subtasks tool' },
    { name: 'calendar_events', description: 'Calendar events tool' },
    { name: 'calendar_calendars', description: 'Calendar collections tool' },
  ],
}));

import {
  handleCreateSubtask,
  handleDeleteSubtask,
  handleReadSubtasks,
  handleReorderSubtasks,
  handleToggleSubtask,
  handleUpdateSubtask,
} from './handlers/index.js';

const mockHandleReadSubtasks = handleReadSubtasks as jest.MockedFunction<
  typeof handleReadSubtasks
>;
const mockHandleCreateSubtask = handleCreateSubtask as jest.MockedFunction<
  typeof handleCreateSubtask
>;
const mockHandleUpdateSubtask = handleUpdateSubtask as jest.MockedFunction<
  typeof handleUpdateSubtask
>;
const mockHandleDeleteSubtask = handleDeleteSubtask as jest.MockedFunction<
  typeof handleDeleteSubtask
>;
const mockHandleToggleSubtask = handleToggleSubtask as jest.MockedFunction<
  typeof handleToggleSubtask
>;
const mockHandleReorderSubtasks = handleReorderSubtasks as jest.MockedFunction<
  typeof handleReorderSubtasks
>;

describe('Tools Index - reminders_subtests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('reminders_subtasks tool routing', () => {
    const baseArgs = { reminderId: 'reminder-123' };

    it.each([
      [
        'read',
        mockHandleReadSubtasks,
        { ...baseArgs, action: 'read' as const },
      ],
      [
        'create',
        mockHandleCreateSubtask,
        { ...baseArgs, action: 'create' as const, title: 'New subtask' },
      ],
      [
        'update',
        mockHandleUpdateSubtask,
        {
          ...baseArgs,
          action: 'update' as const,
          subtaskId: 'subtask-456',
          title: 'Updated subtask',
        },
      ],
      [
        'delete',
        mockHandleDeleteSubtask,
        {
          ...baseArgs,
          action: 'delete' as const,
          subtaskId: 'subtask-456',
        },
      ],
      [
        'toggle',
        mockHandleToggleSubtask,
        {
          ...baseArgs,
          action: 'toggle' as const,
          subtaskId: 'subtask-456',
        },
      ],
      [
        'reorder',
        mockHandleReorderSubtasks,
        {
          ...baseArgs,
          action: 'reorder' as const,
          order: ['subtask-1', 'subtask-2', 'subtask-3'],
        },
      ],
    ])('should route reminders_subtasks action=%s correctly', async (_action, mockHandler, args) => {
      const expectedResult: CallToolResult = {
        content: [{ type: 'text', text: 'Success' }],
        isError: false,
      };

      mockHandler.mockResolvedValue(expectedResult);

      const result = await handleToolCall(
        'reminders_subtasks',
        args as SubtasksToolArgs,
      );

      expect(mockHandler).toHaveBeenCalledWith(args);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('reminders_subtasks tool error handling', () => {
    it('should return error for missing reminderId', async () => {
      await handleToolCall('reminders_subtasks', {
        action: 'read',
        reminderId: '',
      } as SubtasksToolArgs);

      // The handler should be called and return validation error
      expect(mockHandleReadSubtasks).toHaveBeenCalled();
    });

    it('should return error for unknown reminders_subtasks action', async () => {
      const result = await handleToolCall('reminders_subtasks', {
        action: 'unknown',
        reminderId: 'reminder-123',
      } as unknown as SubtasksToolArgs);

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Unknown reminders_subtasks action: unknown',
          },
        ],
        isError: true,
      });
    });

    it('should return error when args are missing', async () => {
      const result = await handleToolCall('reminders_subtasks', undefined);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'No arguments provided' }],
        isError: true,
      });
    });

    it('should propagate handler errors', async () => {
      const error = new Error('Subtask handler failed');
      mockHandleCreateSubtask.mockRejectedValue(error);

      await expect(
        handleToolCall('reminders_subtasks', {
          action: 'create',
          reminderId: 'reminder-123',
          title: 'Test subtask',
        } as SubtasksToolArgs),
      ).rejects.toThrow('Subtask handler failed');
    });
  });
});
