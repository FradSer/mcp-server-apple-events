// Use global Jest functions to avoid extra dependencies

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
  CalendarsToolArgs,
  CalendarToolArgs,
  ListsToolArgs,
  RemindersToolArgs,
} from '../types/index.js';
import { handleToolCall } from './index.js';

// Mock all handler functions
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
}));

jest.mock('./definitions.js', () => ({
  TOOLS: [
    { name: 'reminders_tasks', description: 'Reminder tasks tool' },
    { name: 'reminders_lists', description: 'Reminder lists tool' },
    { name: 'calendar_events', description: 'Calendar events tool' },
    { name: 'calendar_calendars', description: 'Calendar collections tool' },
  ],
}));

import {
  handleCreateCalendarEvent,
  handleCreateReminder,
  handleCreateReminderList,
  handleDeleteCalendarEvent,
  handleDeleteReminder,
  handleDeleteReminderList,
  handleReadCalendarEvents,
  handleReadCalendars,
  handleReadReminderLists,
  handleReadReminders,
  handleUpdateCalendarEvent,
  handleUpdateReminder,
  handleUpdateReminderList,
} from './handlers/index.js';

const mockHandleCreateReminder = handleCreateReminder as jest.MockedFunction<
  typeof handleCreateReminder
>;
const mockHandleReadReminderLists =
  handleReadReminderLists as jest.MockedFunction<
    typeof handleReadReminderLists
  >;
const mockHandleReadReminders = handleReadReminders as jest.MockedFunction<
  typeof handleReadReminders
>;
const mockHandleUpdateReminder = handleUpdateReminder as jest.MockedFunction<
  typeof handleUpdateReminder
>;
const mockHandleDeleteReminder = handleDeleteReminder as jest.MockedFunction<
  typeof handleDeleteReminder
>;
const mockHandleCreateReminderList =
  handleCreateReminderList as jest.MockedFunction<
    typeof handleCreateReminderList
  >;
const mockHandleUpdateReminderList =
  handleUpdateReminderList as jest.MockedFunction<
    typeof handleUpdateReminderList
  >;
const mockHandleDeleteReminderList =
  handleDeleteReminderList as jest.MockedFunction<
    typeof handleDeleteReminderList
  >;
const mockHandleCreateCalendarEvent =
  handleCreateCalendarEvent as jest.MockedFunction<
    typeof handleCreateCalendarEvent
  >;
const mockHandleReadCalendarEvents =
  handleReadCalendarEvents as jest.MockedFunction<
    typeof handleReadCalendarEvents
  >;
const mockHandleUpdateCalendarEvent =
  handleUpdateCalendarEvent as jest.MockedFunction<
    typeof handleUpdateCalendarEvent
  >;
const mockHandleDeleteCalendarEvent =
  handleDeleteCalendarEvent as jest.MockedFunction<
    typeof handleDeleteCalendarEvent
  >;
const mockHandleReadCalendars = handleReadCalendars as jest.MockedFunction<
  typeof handleReadCalendars
>;

describe('Tools Index', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleToolCall', () => {
    describe('reminders_tasks tool routing', () => {
      it.each([
        [
          'read',
          mockHandleReadReminders,
          { action: 'read' as const, id: '123' },
        ],
        [
          'create',
          mockHandleCreateReminder,
          { action: 'create' as const, title: 'Test reminder' },
        ],
        [
          'update',
          mockHandleUpdateReminder,
          {
            action: 'update' as const,
            title: 'Old title',
            newTitle: 'New title',
          },
        ],
        [
          'delete',
          mockHandleDeleteReminder,
          { action: 'delete' as const, title: 'Delete me' },
        ],
      ])('should route reminders_tasks action=%s correctly', async (_action, mockHandler, args) => {
        const expectedResult: CallToolResult = {
          content: [{ type: 'text', text: 'Success' }],
          isError: false,
        };

        mockHandler.mockResolvedValue(expectedResult);

        const result = await handleToolCall('reminders_tasks', args);

        expect(mockHandler).toHaveBeenCalledWith(args);
        expect(result).toEqual(expectedResult);
      });
    });

    describe('error handling', () => {
      it('should return error for unknown tool and not call handlers', async () => {
        const result = await handleToolCall('unknown_tool', {
          action: 'read',
        } as unknown as RemindersToolArgs);

        expect(result).toEqual({
          content: [{ type: 'text', text: 'Unknown tool: unknown_tool' }],
          isError: true,
        });
        expect(mockHandleCreateReminder).not.toHaveBeenCalled();
        expect(mockHandleReadReminders).not.toHaveBeenCalled();
        expect(mockHandleReadReminderLists).not.toHaveBeenCalled();
        expect(mockHandleUpdateReminder).not.toHaveBeenCalled();
        expect(mockHandleDeleteReminder).not.toHaveBeenCalled();
      });

      it('should return error for empty tool name', async () => {
        const result = await handleToolCall('', {
          action: 'read',
        } as RemindersToolArgs);

        expect(result).toEqual({
          content: [{ type: 'text', text: 'Unknown tool: ' }],
          isError: true,
        });
      });

      it('should return error for unknown reminders_lists action', async () => {
        const result = await handleToolCall('reminders_lists', {
          action: 'unknown',
        } as unknown as ListsToolArgs);

        expect(result).toEqual({
          content: [
            {
              type: 'text',
              text: 'Unknown reminders_lists action: unknown',
            },
          ],
          isError: true,
        });
      });

      it('should propagate handler errors', async () => {
        const error = new Error('Handler failed');
        mockHandleCreateReminder.mockRejectedValue(error);

        await expect(
          handleToolCall('reminders_tasks', { action: 'create' as const }),
        ).rejects.toThrow('Handler failed');
      });

      it('should handle complex arguments', async () => {
        const complexArgs = {
          action: 'create' as const,
          title: 'Complex reminder',
          dueDate: '2024-12-25 18:00:00',
          list: 'Work Tasks',
          note: 'Complex note',
          url: 'https://example.com/task',
        };

        const expectedResult: CallToolResult = {
          content: [{ type: 'text', text: 'Complex reminder created' }],
          isError: false,
        };

        mockHandleCreateReminder.mockResolvedValue(expectedResult);

        const result = await handleToolCall('reminders_tasks', complexArgs);

        expect(mockHandleCreateReminder).toHaveBeenCalledWith(complexArgs);
        expect(result).toEqual(expectedResult);
      });
    });

    describe('reminders_tasks tool error handling', () => {
      it.each([
        [undefined, 'No arguments provided'],
        [{ action: undefined }, 'Unknown reminders_tasks action: undefined'],
        [{ action: 'unknown' }, 'Unknown reminders_tasks action: unknown'],
      ])('should return error for invalid reminders_tasks args', async (args, expectedText) => {
        const result = await handleToolCall(
          'reminders_tasks',
          args as unknown as RemindersToolArgs,
        );

        expect(result).toEqual({
          content: [{ type: 'text', text: expectedText }],
          isError: true,
        });
      });
    });

    describe('reminders_lists tool routing', () => {
      it.each([
        [
          'read',
          mockHandleReadReminderLists,
          { action: 'read' as const },
          undefined,
        ],
        [
          'create',
          mockHandleCreateReminderList,
          { action: 'create' as const, name: 'New List' },
          { action: 'create', name: 'New List' },
        ],
        [
          'update',
          mockHandleUpdateReminderList,
          { action: 'update' as const, name: 'Old Name', newName: 'New Name' },
          { action: 'update', name: 'Old Name', newName: 'New Name' },
        ],
        [
          'delete',
          mockHandleDeleteReminderList,
          { action: 'delete' as const, name: 'List Name' },
          { action: 'delete', name: 'List Name' },
        ],
      ])('should route reminders_lists action=%s correctly', async (_action, mockHandler, args, expectedCallArgs) => {
        const expectedResult: CallToolResult = {
          content: [{ type: 'text', text: 'Success' }],
          isError: false,
        };

        mockHandler.mockResolvedValue(expectedResult);

        const result = await handleToolCall(
          'reminders_lists',
          args as ListsToolArgs,
        );

        if (expectedCallArgs) {
          expect(mockHandler).toHaveBeenCalledWith(expectedCallArgs);
        } else {
          expect(mockHandler).toHaveBeenCalled();
        }
        expect(result).toEqual(expectedResult);
      });
    });

    describe('reminders_lists tool validation errors', () => {
      it.each([
        [
          'create',
          mockHandleCreateReminderList,
          { action: 'create' as const },
          'name',
        ],
        [
          'update',
          mockHandleUpdateReminderList,
          { action: 'update' as const, newName: 'New Name' },
          'name',
        ],
        [
          'update',
          mockHandleUpdateReminderList,
          { action: 'update' as const, name: 'Old Name' },
          'newName',
        ],
        [
          'delete',
          mockHandleDeleteReminderList,
          { action: 'delete' as const },
          'name',
        ],
      ])('should return validation error when reminders_lists %s field is missing', async (_action, mockHandler, args, missingField) => {
        mockHandler.mockResolvedValue({
          content: [
            {
              type: 'text',
              text: `Input validation failed: ${missingField}: List name cannot be empty`,
            },
          ],
          isError: true,
        });

        const result = await handleToolCall(
          'reminders_lists',
          args as ListsToolArgs,
        );

        expect(result.isError).toBe(true);
        expect(result.content[0]?.type).toBe('text');
        const textContent = result.content[0] as
          | { type: 'text'; text: string }
          | undefined;
        expect(textContent?.text).toContain('Input validation failed');
        expect(textContent?.text).toContain(missingField);
      });
    });
  });

  describe('calendar_events tool routing', () => {
    it.each([
      ['read', mockHandleReadCalendarEvents, { action: 'read' as const }],
      [
        'create',
        mockHandleCreateCalendarEvent,
        {
          action: 'create' as const,
          title: 'New Event',
          startDate: '2025-11-04 14:00:00',
          endDate: '2025-11-04 16:00:00',
        },
      ],
      [
        'update',
        mockHandleUpdateCalendarEvent,
        {
          action: 'update' as const,
          id: 'event-123',
          title: 'Updated Event',
        },
      ],
      [
        'delete',
        mockHandleDeleteCalendarEvent,
        { action: 'delete' as const, id: 'event-123' },
      ],
    ])('should route calendar_events action=%s correctly', async (_action, mockHandler, args) => {
      const expectedResult: CallToolResult = {
        content: [{ type: 'text', text: 'Success' }],
        isError: false,
      };

      mockHandler.mockResolvedValue(expectedResult);

      const result = await handleToolCall(
        'calendar_events',
        args as CalendarToolArgs,
      );

      expect(mockHandler).toHaveBeenCalledWith(args);
      expect(result).toEqual(expectedResult);
    });

    it('should return error for unknown calendar_events action', async () => {
      const result = await handleToolCall('calendar_events', {
        action: 'unknown',
      } as unknown as CalendarToolArgs);

      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: 'Unknown calendar_events action: unknown',
          },
        ],
        isError: true,
      });
    });

    it('should return error when calendar events args are missing', async () => {
      const result = await handleToolCall('calendar_events', undefined);

      expect(result).toEqual({
        content: [{ type: 'text', text: 'No arguments provided' }],
        isError: true,
      });
    });
  });

  describe('calendar_calendars tool routing', () => {
    it('should route read action to handleReadCalendars', async () => {
      const expectedResult: CallToolResult = {
        content: [{ type: 'text', text: 'Calendars listed' }],
        isError: false,
      };

      mockHandleReadCalendars.mockResolvedValue(expectedResult);

      const result = await handleToolCall('calendar_calendars', {
        action: 'read',
      } as CalendarsToolArgs);

      expect(mockHandleReadCalendars).toHaveBeenCalledWith({
        action: 'read',
      });
      expect(result).toEqual(expectedResult);
    });

    it('should allow missing args and still call handleReadCalendars', async () => {
      const expectedResult: CallToolResult = {
        content: [{ type: 'text', text: 'Calendars listed' }],
        isError: false,
      };

      mockHandleReadCalendars.mockResolvedValue(expectedResult);

      const result = await handleToolCall('calendar_calendars');

      expect(mockHandleReadCalendars).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(expectedResult);
    });
  });
});
