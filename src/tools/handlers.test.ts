/**
 * tests/tools/handlers.test.ts
 * Tests for the refactored, Markdown-outputting tool handlers.
 */

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
} from '../tools/handlers/index.js';
import type { Reminder } from '../types/index.js';
import { calendarRepository } from '../utils/calendarRepository.js';
import { handleAsyncOperation } from '../utils/errorHandling.js';
import { reminderRepository } from '../utils/reminderRepository.js';

// Mock the cliExecutor to avoid import.meta issues
jest.mock('../utils/cliExecutor.js', () => ({
  executeCli: jest.fn(),
}));

// Mock the repository and error handling
jest.mock('../utils/reminderRepository.js');
jest.mock('../utils/calendarRepository.js');
jest.mock('../utils/errorHandling.js');

const mockReminderRepository = reminderRepository as jest.Mocked<
  typeof reminderRepository
>;
const mockCalendarRepository = calendarRepository as jest.Mocked<
  typeof calendarRepository
>;
const mockHandleAsyncOperation = handleAsyncOperation as jest.Mock;

/**
 * Type guard helper to extract text content from CallToolResult
 */
function getTextContent(
  content: Array<{ type: string; [key: string]: unknown }>,
): string {
  const firstContent = content[0];
  if (firstContent && firstContent.type === 'text' && 'text' in firstContent) {
    return firstContent.text as string;
  }
  throw new Error('Expected text content');
}

// Simplified wrapper mock for testing. It mimics the real implementation.
mockHandleAsyncOperation.mockImplementation(async (operation) => {
  try {
    const result = await operation();
    return { content: [{ type: 'text', text: result }], isError: false };
  } catch (error) {
    return {
      content: [{ type: 'text', text: (error as Error).message }],
      isError: true,
    };
  }
});

describe('Tool Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Reminder Handlers ---

  describe('handleReadReminders', () => {
    it('formats reminder collections with completion states and metadata', async () => {
      const mockReminders = [
        {
          id: '1',
          title: 'Basic Reminder',
          isCompleted: false,
          list: 'Personal',
          notes: 'Line 1\nLine 2',
          dueDate: '2024-01-15T10:00:00Z',
          url: 'https://example.com',
          priority: 0,
        },
        {
          id: '2',
          title: 'Full Reminder',
          isCompleted: true,
          list: 'Work',
          notes: 'Important note',
          dueDate: undefined,
          url: undefined,
          priority: 0,
        },
      ];
      mockReminderRepository.findReminders.mockResolvedValue(mockReminders);

      const result = await handleReadReminders({ action: 'read' });
      const content = getTextContent(result.content);

      expect(content).toContain('### Reminders (Total: 2)');
      expect(content).toContain('- [ ] Basic Reminder');
      expect(content).toContain('- [x] Full Reminder');
      expect(content).toContain('- List: Personal');
      expect(content).toContain('- List: Work');
      expect(content).toContain('- Due: 2024-01-15T10:00:00Z');
      expect(content).toContain('- URL: https://example.com');
      expect(content).toContain('Notes: Line 1\n    Line 2');
    });

    it('displays all priority levels (0, 1, 2, 3) with label and value in read output', async () => {
      const mockReminders = [
        {
          id: 'a',
          title: 'P0',
          isCompleted: false,
          list: 'L',
          priority: 0,
        },
        {
          id: 'b',
          title: 'P1',
          isCompleted: false,
          list: 'L',
          priority: 1,
        },
        {
          id: 'c',
          title: 'P2',
          isCompleted: false,
          list: 'L',
          priority: 2,
        },
        {
          id: 'd',
          title: 'P3',
          isCompleted: false,
          list: 'L',
          priority: 3,
        },
      ];
      mockReminderRepository.findReminders.mockResolvedValue(mockReminders);

      const result = await handleReadReminders({ action: 'read' });
      const content = getTextContent(result.content);

      expect(content).toContain('Priority: none (0)');
      expect(content).toContain('Priority: high (1)');
      expect(content).toContain('Priority: medium (2)');
      expect(content).toContain('Priority: low (3)');
    });

    it('renders single reminder details including metadata and completion state', async () => {
      const mockReminder = {
        id: '456',
        title: 'Completed Task',
        isCompleted: true,
        list: 'Done',
        notes: 'Some notes',
        dueDate: '2024-12-25',
        url: 'https://example.com',
        priority: 0,
      };
      mockReminderRepository.findReminderById.mockResolvedValue(mockReminder);

      const result = await handleReadReminders({
        action: 'read',
        id: '456',
      });
      const content = getTextContent(result.content);

      expect(content).toContain('### Reminder');
      expect(content).toContain('- [x] Completed Task');
      expect(content).toContain('- List: Done');
      expect(content).toContain('- ID: 456');
      expect(content).toContain('- Notes: Some notes');
      expect(content).toContain('- Due: 2024-12-25');
      expect(content).toContain('- URL: https://example.com');
    });

    it('returns empty state messaging when no reminders match', async () => {
      mockReminderRepository.findReminders.mockResolvedValue([]);

      const result = await handleReadReminders({ action: 'read' });
      const content = getTextContent(result.content);

      expect(content).toContain('### Reminders (Total: 0)');
      expect(content).toContain('No reminders found matching the criteria.');
    });
  });

  describe('handleCreateReminder', () => {
    it('should return a Markdown success message with ID', async () => {
      const newReminder = {
        id: 'rem-123',
        title: 'New Task',
        isCompleted: false,
        list: 'Inbox',
        notes: null,
        url: null,
        dueDate: null,
        priority: 0,
        recurrence: null,
        locationTrigger: null,
      };
      mockReminderRepository.createReminder.mockResolvedValue(newReminder);
      const result = await handleCreateReminder({
        action: 'create',
        title: 'New Task',
      });
      const content = getTextContent(result.content);
      expect(content).toContain('Successfully created reminder "New Task"');
      expect(content).toContain('- ID: rem-123');
    });

    it('rejects invalid subtask titles during creation', async () => {
      const result = await handleCreateReminder({
        action: 'create',
        title: 'New Task',
        subtasks: [''],
      });

      expect(result.isError).toBe(true);
      const content = getTextContent(result.content);
      expect(content).toContain('Input validation failed');
    });
  });

  describe('handleUpdateReminder', () => {
    it('should return a Markdown success message with ID', async () => {
      const updatedReminder = {
        id: 'rem-456',
        title: 'Updated Task',
        isCompleted: true,
        list: 'Inbox',
        notes: null,
        url: null,
        dueDate: null,
        priority: 0,
        recurrence: null,
        locationTrigger: null,
      };
      mockReminderRepository.updateReminder.mockResolvedValue(updatedReminder);
      const result = await handleUpdateReminder({
        action: 'update',
        id: 'rem-456',
        title: 'Updated Task',
      });
      const content = getTextContent(result.content);
      expect(content).toContain('Successfully updated reminder "Updated Task"');
      expect(content).toContain('- ID: rem-456');
    });

    it('preserves existing subtasks when adding tags with a new note', async () => {
      const existingNotes =
        '[#work]\nOriginal note\n\n---SUBTASKS---\n[ ] {abc12345} First subtask\n---END SUBTASKS---';
      const mockReminder: Reminder = {
        id: 'rem-789',
        title: 'Tagged Task',
        isCompleted: false,
        list: 'Inbox',
        notes: existingNotes,
        priority: 0,
      };
      const mockReminderJSON = {
        ...mockReminder,
        url: null,
        dueDate: null,
        recurrence: null,
        locationTrigger: null,
        notes: existingNotes,
      };
      mockReminderRepository.findReminderById.mockResolvedValue(mockReminder);
      mockReminderRepository.updateReminder.mockResolvedValue(mockReminderJSON);

      await handleUpdateReminder({
        action: 'update',
        id: 'rem-789',
        addTags: ['urgent'],
        note: 'New note',
      });

      const updateArgs = mockReminderRepository.updateReminder.mock.calls[0][0];
      expect(updateArgs.notes).toContain('[#work]');
      expect(updateArgs.notes).toContain('[#urgent]');
      expect(updateArgs.notes).toContain('New note');
      expect(updateArgs.notes).toContain('---SUBTASKS---');
      expect(updateArgs.notes).not.toContain('Original note');
    });

    it('preserves existing tags and subtasks when updating note only', async () => {
      const existingNotes =
        '[#work]\nOriginal note\n\n---SUBTASKS---\n[ ] {abc12345} First subtask\n---END SUBTASKS---';
      const mockReminder: Reminder = {
        id: 'rem-654',
        title: 'Tagged Task',
        isCompleted: false,
        list: 'Inbox',
        notes: existingNotes,
        priority: 0,
      };
      const mockReminderJSON = {
        ...mockReminder,
        url: null,
        dueDate: null,
        recurrence: null,
        locationTrigger: null,
        notes: existingNotes,
      };
      mockReminderRepository.findReminderById.mockResolvedValue(mockReminder);
      mockReminderRepository.updateReminder.mockResolvedValue(mockReminderJSON);

      await handleUpdateReminder({
        action: 'update',
        id: 'rem-654',
        note: 'Updated note',
      });

      const updateArgs = mockReminderRepository.updateReminder.mock.calls[0][0];
      expect(updateArgs.notes).toContain('[#work]');
      expect(updateArgs.notes).toContain('Updated note');
      expect(updateArgs.notes).toContain('---SUBTASKS---');
      expect(updateArgs.notes).not.toContain('Original note');
    });

    it('preserves existing notes and subtasks when replacing tags', async () => {
      const existingNotes =
        '[#old]\nKeep this note\n\n---SUBTASKS---\n[ ] {def67890} Another subtask\n---END SUBTASKS---';
      const mockReminder: Reminder = {
        id: 'rem-321',
        title: 'Retagged Task',
        isCompleted: false,
        list: 'Inbox',
        notes: existingNotes,
        priority: 0,
      };
      const mockReminderJSON = {
        ...mockReminder,
        url: null,
        dueDate: null,
        recurrence: null,
        locationTrigger: null,
        notes: existingNotes,
      };
      mockReminderRepository.findReminderById.mockResolvedValue(mockReminder);
      mockReminderRepository.updateReminder.mockResolvedValue(mockReminderJSON);

      await handleUpdateReminder({
        action: 'update',
        id: 'rem-321',
        tags: ['home'],
      });

      const updateArgs = mockReminderRepository.updateReminder.mock.calls[0][0];
      expect(updateArgs.notes).toContain('[#home]');
      expect(updateArgs.notes).toContain('Keep this note');
      expect(updateArgs.notes).toContain('---SUBTASKS---');
      expect(updateArgs.notes).not.toContain('[#old]');
    });
  });

  describe('handleDeleteReminder', () => {
    it('should return a Markdown success message', async () => {
      mockReminderRepository.deleteReminder.mockResolvedValue(undefined);
      const result = await handleDeleteReminder({
        action: 'delete',
        id: 'rem-789',
      });
      const content = getTextContent(result.content);
      expect(content).toBe('Successfully deleted reminder with ID: rem-789');
    });
  });

  // --- List Handlers ---

  describe('handleReadReminderLists', () => {
    it('should return lists formatted as Markdown', async () => {
      const mockLists = [{ id: 'list-1', title: 'Inbox' }];
      mockReminderRepository.findAllLists.mockResolvedValue(mockLists);
      const result = await handleReadReminderLists();
      const content = getTextContent(result.content);
      expect(content).toContain('### Reminder Lists (Total: 1)');
      expect(content).toContain('- Inbox (ID: list-1)');
    });

    it('should return empty list message when no lists found', async () => {
      mockReminderRepository.findAllLists.mockResolvedValue([]);
      const result = await handleReadReminderLists();
      const content = getTextContent(result.content);
      expect(content).toContain('### Reminder Lists (Total: 0)');
      expect(content).toContain('No reminder lists found.');
    });
  });

  describe('handleCreateReminderList', () => {
    it('should return a Markdown success message with ID', async () => {
      const newList = { id: 'list-abc', title: 'New List' };
      mockReminderRepository.createReminderList.mockResolvedValue(newList);
      const result = await handleCreateReminderList({
        action: 'create',
        name: 'New List',
      });
      const content = getTextContent(result.content);
      expect(content).toContain('Successfully created list "New List"');
      expect(content).toContain('- ID: list-abc');
    });
  });

  describe('handleUpdateReminderList', () => {
    it('should return a Markdown success message with ID', async () => {
      const updatedList = { id: 'list-def', title: 'Updated Name' };
      mockReminderRepository.updateReminderList.mockResolvedValue(updatedList);
      const result = await handleUpdateReminderList({
        action: 'update',
        name: 'Old Name',
        newName: 'Updated Name',
      });
      const content = getTextContent(result.content);
      expect(content).toContain('Successfully updated list to "Updated Name"');
      expect(content).toContain('- ID: list-def');
    });
  });

  describe('handleDeleteReminderList', () => {
    it('should return a Markdown success message', async () => {
      mockReminderRepository.deleteReminderList.mockResolvedValue(undefined);
      const result = await handleDeleteReminderList({
        action: 'delete',
        name: 'Old List',
      });
      const content = getTextContent(result.content);
      expect(content).toBe('Successfully deleted list "Old List".');
    });
  });

  // --- Calendar Event Handlers ---

  describe('handleCreateCalendarEvent', () => {
    it('should return a success message with event ID', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'New Event',
        startDate: '2025-11-04T14:00:00+08:00',
        endDate: '2025-11-04T16:00:00+08:00',
        calendar: 'Work',
        notes: null,
        location: null,
        url: null,
        isAllDay: false,
      };
      mockCalendarRepository.createEvent.mockResolvedValue(mockEvent);
      const result = await handleCreateCalendarEvent({
        action: 'create',
        title: 'New Event',
        startDate: '2025-11-04 14:00:00',
        endDate: '2025-11-04 16:00:00',
        targetCalendar: 'Work',
      });
      const content = getTextContent(result.content);
      expect(content).toContain('Successfully created event "New Event"');
      expect(content).toContain('- ID: event-123');
    });
  });

  describe('handleUpdateCalendarEvent', () => {
    it('should return a success message with event ID', async () => {
      const mockEvent = {
        id: 'event-456',
        title: 'Updated Event',
        startDate: '2025-11-04T15:00:00+08:00',
        endDate: '2025-11-04T17:00:00+08:00',
        calendar: 'Work',
        notes: null,
        location: null,
        url: null,
        isAllDay: false,
      };
      mockCalendarRepository.updateEvent.mockResolvedValue(mockEvent);
      const result = await handleUpdateCalendarEvent({
        action: 'update',
        id: 'event-456',
        title: 'Updated Event',
      });
      const content = getTextContent(result.content);
      expect(content).toContain('Successfully updated event "Updated Event"');
      expect(content).toContain('- ID: event-456');
    });
  });

  describe('handleDeleteCalendarEvent', () => {
    it('should return a success message', async () => {
      mockCalendarRepository.deleteEvent.mockResolvedValue(undefined);
      const result = await handleDeleteCalendarEvent({
        action: 'delete',
        id: 'event-789',
      });
      const content = getTextContent(result.content);
      expect(content).toBe('Successfully deleted event with ID "event-789".');
    });
  });

  describe('formatDeleteMessage', () => {
    it('should format message with default options', () => {
      const { formatDeleteMessage } = require('./handlers/shared.js');

      const result = formatDeleteMessage('reminder', '123');

      expect(result).toBe('Successfully deleted reminder with ID: "123".');
    });

    it('should format message without quotes', () => {
      const { formatDeleteMessage } = require('./handlers/shared.js');

      const result = formatDeleteMessage('event', 'event-456', {
        useQuotes: false,
      });

      expect(result).toBe('Successfully deleted event with ID: event-456.');
    });

    it('should format message without ID prefix', () => {
      const { formatDeleteMessage } = require('./handlers/shared.js');

      const result = formatDeleteMessage('list', 'My List', {
        useIdPrefix: false,
      });

      expect(result).toBe('Successfully deleted list "My List".');
    });

    it('should format message without period', () => {
      const { formatDeleteMessage } = require('./handlers/shared.js');

      const result = formatDeleteMessage('task', 'task-789', {
        usePeriod: false,
      });

      expect(result).toBe('Successfully deleted task with ID: "task-789"');
    });

    it('should format message with space separator instead of colon', () => {
      const { formatDeleteMessage } = require('./handlers/shared.js');

      const result = formatDeleteMessage('reminder', '123', {
        useColon: false,
      });

      expect(result).toBe('Successfully deleted reminder with ID "123".');
    });

    it('should format message with all options disabled', () => {
      const { formatDeleteMessage } = require('./handlers/shared.js');

      const result = formatDeleteMessage('item', 'identifier', {
        useQuotes: false,
        useIdPrefix: false,
        usePeriod: false,
        useColon: false,
      });

      expect(result).toBe('Successfully deleted item identifier');
    });
  });

  describe('handleReadCalendarEvents', () => {
    it('formats event collections with optional metadata', async () => {
      const mockEvents = [
        {
          id: 'evt-1',
          title: 'Minimal Event',
          calendar: 'Personal',
          startDate: '2025-11-15T08:00:00Z',
          endDate: '2025-11-15T09:00:00Z',
          isAllDay: false,
        },
        {
          id: 'evt-2',
          title: 'Full Event',
          calendar: 'Work',
          startDate: '2025-11-15T09:00:00Z',
          endDate: '2025-11-15T10:00:00Z',
          isAllDay: true,
          location: 'Conference Room',
          notes: 'Meeting notes',
          url: 'https://zoom.us/meeting',
        },
      ];
      mockCalendarRepository.findEvents.mockResolvedValue(mockEvents);

      const result = await handleReadCalendarEvents({ action: 'read' });
      const content = getTextContent(result.content);

      expect(content).toContain('### Calendar Events (Total: 2)');
      expect(content).toContain('- Minimal Event');
      expect(content).toContain('- Full Event');
      expect(content).toContain('- Calendar: Work');
      expect(content).toContain('- Start: 2025-11-15T09:00:00Z');
      expect(content).toContain('- End: 2025-11-15T10:00:00Z');
      expect(content).toContain('- All Day: true');
      expect(content).toContain('- Location: Conference Room');
      expect(content).toContain('- Notes: Meeting notes');
      expect(content).toContain('- URL: https://zoom.us/meeting');
      expect(mockCalendarRepository.findAllCalendars).not.toHaveBeenCalled();
    });

    it('should return single event when id is provided', async () => {
      const mockEvent = {
        id: 'event-123',
        title: 'Single Event',
        startDate: '2025-11-04T14:00:00+08:00',
        endDate: '2025-11-04T16:00:00+08:00',
        calendar: 'Work',
        notes: 'Some notes',
        location: 'Office',
        url: 'https://example.com',
        isAllDay: false,
      };
      mockCalendarRepository.findEventById.mockResolvedValue(mockEvent);
      const result = await handleReadCalendarEvents({
        action: 'read',
        id: 'event-123',
      });
      const content = getTextContent(result.content);
      expect(content).toContain('- Single Event');
      expect(content).toContain('- Calendar: Work');
      expect(content).toContain('- ID: event-123');
      expect(content).toContain('- Notes: Some notes');
      expect(content).toContain('- Location: Office');
      expect(content).toContain('- URL: https://example.com');
    });

    it('should return empty message when no events found', async () => {
      mockCalendarRepository.findEvents.mockResolvedValue([]);
      const result = await handleReadCalendarEvents({ action: 'read' });
      const content = getTextContent(result.content);
      expect(content).toContain('### Calendar Events (Total: 0)');
      expect(content).toContain('No calendar events found.');
      expect(mockCalendarRepository.findAllCalendars).not.toHaveBeenCalled();
    });

    it('should pass filterAccount to findEvents', async () => {
      mockCalendarRepository.findEvents.mockResolvedValue([]);
      await handleReadCalendarEvents({
        action: 'read',
        filterAccount: 'Google',
      });
      expect(mockCalendarRepository.findEvents).toHaveBeenCalledWith(
        expect.objectContaining({ accountName: 'Google' }),
      );
    });
  });

  describe('handleReadCalendars', () => {
    it('should return calendars formatted as Markdown', async () => {
      const mockCalendars = [
        {
          id: 'cal-1',
          title: 'Work',
          account: 'Google',
          accountType: 'caldav',
        },
        {
          id: 'cal-2',
          title: 'Personal',
          account: 'iCloud',
          accountType: 'caldav',
        },
      ];
      mockCalendarRepository.findCalendars.mockResolvedValue(mockCalendars);
      const result = await handleReadCalendars({ action: 'read' });
      const content = getTextContent(result.content);
      expect(content).toContain('### Calendars (Total: 2)');
      expect(content).toContain('- Work (Google) (ID: cal-1)');
      expect(content).toContain('- Personal (iCloud) (ID: cal-2)');
    });

    it('should support being called without args', async () => {
      mockCalendarRepository.findCalendars.mockResolvedValue([]);
      const result = await handleReadCalendars();
      const content = getTextContent(result.content);
      expect(content).toContain('### Calendars (Total: 0)');
      expect(content).toContain('No calendars found.');
    });

    it('should support date-scoped calendar discovery', async () => {
      mockCalendarRepository.findCalendars.mockResolvedValue([
        {
          id: 'cal-1',
          title: 'Activity',
          account: 'Google',
          accountType: 'caldav',
          eventCount: 7,
        },
      ]);

      const result = await handleReadCalendars({
        action: 'read',
        startDate: '2026-05-04',
        endDate: '2026-05-11',
        filterAccount: 'Google',
      });
      const content = getTextContent(result.content);

      expect(mockCalendarRepository.findCalendars).toHaveBeenCalledWith({
        startDate: '2026-05-04',
        endDate: '2026-05-11',
        accountName: 'Google',
      });
      expect(content).toContain('- Activity (Google) (ID: cal-1) - 7 events');
    });
  });
});
