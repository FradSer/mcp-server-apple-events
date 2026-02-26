/**
 * reminderRepository.test.ts
 * Tests for reminder repository
 */

import type { Reminder, ReminderList } from '../types/index.js';
import { getListEmblems, setListEmblem } from './applescriptList.js';
import { executeCli } from './cliExecutor.js';
import type { ReminderFilters } from './dateFiltering.js';
import { applyReminderFilters } from './dateFiltering.js';
import { reminderRepository } from './reminderRepository.js';

// Mock dependencies
jest.mock('./cliExecutor.js');
jest.mock('./dateFiltering.js');
jest.mock('./applescriptList.js');

const mockExecuteCli = executeCli as jest.MockedFunction<typeof executeCli>;
const mockApplyReminderFilters = applyReminderFilters as jest.MockedFunction<
  typeof applyReminderFilters
>;
const mockSetListEmblem = setListEmblem as jest.MockedFunction<
  typeof setListEmblem
>;
const mockGetListEmblems = getListEmblems as jest.MockedFunction<
  typeof getListEmblems
>;

describe('ReminderRepository', () => {
  const repository = reminderRepository;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('findReminderById', () => {
    it('should return reminder when found', async () => {
      const mockReminder: Partial<Reminder> = {
        id: '2',
        title: 'Test 2',
        isCompleted: true,
        list: 'Work',
      };

      mockExecuteCli.mockResolvedValue(mockReminder);

      const result = await repository.findReminderById('2');

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read-by-id',
        '--id',
        '2',
      ]);

      expect(result).toEqual({
        id: '2',
        title: 'Test 2',
        isCompleted: true,
        list: 'Work',
        notes: undefined,
        url: undefined,
        dueDate: undefined,
      });
    });

    it('should throw error when reminder not found', async () => {
      mockExecuteCli.mockRejectedValue(
        new Error("Reminder with ID '999' not found."),
      );

      await expect(repository.findReminderById('999')).rejects.toThrow(
        "Reminder with ID '999' not found.",
      );
    });

    it('should handle reminders with notes and url', async () => {
      const mockReminder: Partial<Reminder> = {
        id: '1',
        title: 'Test',
        isCompleted: false,
        list: 'Default',
        notes: 'Some notes',
        url: 'https://example.com',
        dueDate: '2024-01-15',
      };

      mockExecuteCli.mockResolvedValue(mockReminder);

      const result = await repository.findReminderById('1');

      expect(result.notes).toBe('Some notes');
      expect(result.url).toBe('https://example.com');
      expect(result.dueDate).toBe('2024-01-15');
    });

    it('should handle null notes and url as undefined', async () => {
      const mockReminder: Partial<Reminder> = {
        id: '1',
        title: 'Test',
        isCompleted: false,
        list: 'Default',
        notes: undefined,
        url: undefined,
        dueDate: undefined,
      };

      mockExecuteCli.mockResolvedValue(mockReminder);

      const result = await repository.findReminderById('1');

      expect(result.notes).toBeUndefined();
      expect(result.url).toBeUndefined();
      expect(result.dueDate).toBeUndefined();
    });

    it('should pass through due dates from Swift CLI without normalization', async () => {
      const mockReminder: Partial<Reminder> = {
        id: 'ad-1',
        title: 'AdSense Fix',
        isCompleted: false,
        list: 'Work',
        dueDate: '2025-11-15T08:30:00Z',
      };

      mockExecuteCli.mockResolvedValue(mockReminder);

      const result = await repository.findReminderById('ad-1');

      expect(result.dueDate).toBe('2025-11-15T08:30:00Z');
    });
  });

  describe('findReminders', () => {
    it('should pass showCompleted=false to CLI and clear it for JS filtering', async () => {
      const mockReminders: Partial<Reminder>[] = [
        { id: '1', title: 'Test 1', isCompleted: false, list: 'Default' },
      ];
      const filters: ReminderFilters = { showCompleted: false };
      const filteredReminders: Reminder[] = [
        {
          id: '1',
          title: 'Test 1',
          isCompleted: false,
          list: 'Default',
          priority: 0,
        },
      ];

      mockExecuteCli.mockResolvedValue({
        reminders: mockReminders,
      });
      mockApplyReminderFilters.mockReturnValue(filteredReminders);

      const result = await repository.findReminders(filters);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read',
        '--showCompleted',
        'false',
      ]);
      expect(mockApplyReminderFilters).toHaveBeenCalledWith(expect.any(Array), {
        ...filters,
        showCompleted: undefined,
      });
      expect(result).toBe(filteredReminders);
    });

    it('should pass CLI-supported filters to Swift and clear them for JS filtering', async () => {
      const mockReminders: Partial<Reminder>[] = [
        { id: '1', title: 'Test 1', isCompleted: false, list: 'Work' },
      ];
      const filters: ReminderFilters = {
        showCompleted: true,
        list: 'Work',
        search: 'test',
        dueWithin: 'today',
        priority: 'high',
      };

      mockExecuteCli.mockResolvedValue({ reminders: mockReminders });
      mockApplyReminderFilters.mockImplementation((reminders) => reminders);

      await repository.findReminders(filters);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read',
        '--showCompleted',
        'true',
        '--filterList',
        'Work',
        '--search',
        'test',
        '--dueWithin',
        'today',
      ]);
      expect(mockApplyReminderFilters).toHaveBeenCalledWith(expect.any(Array), {
        ...filters,
        showCompleted: undefined,
        list: undefined,
        search: undefined,
        dueWithin: undefined,
      });
    });

    it('should default showCompleted to true when not specified', async () => {
      const mockReminders: Partial<Reminder>[] = [
        { id: '1', title: 'Test', isCompleted: false, list: 'Default' },
      ];

      mockExecuteCli.mockResolvedValue({
        reminders: mockReminders,
      });
      mockApplyReminderFilters.mockImplementation((reminders) => reminders);

      await repository.findReminders();

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'read',
        '--showCompleted',
        'true',
      ]);
    });

    it('should convert JSON reminders to proper Reminder objects', async () => {
      const mockReminders: Partial<Reminder>[] = [
        {
          id: '1',
          title: 'Test',
          isCompleted: false,
          list: 'Default',
          notes: 'Notes',
          url: 'https://example.com',
          dueDate: '2024-01-15',
        },
      ];

      mockExecuteCli.mockResolvedValue({
        reminders: mockReminders,
      });
      mockApplyReminderFilters.mockImplementation((reminders) => reminders);

      const result = await repository.findReminders();

      expect(result[0]).toEqual({
        id: '1',
        title: 'Test',
        isCompleted: false,
        list: 'Default',
        notes: 'Notes',
        url: 'https://example.com',
        dueDate: '2024-01-15',
      });
    });

    it('should handle empty filters', async () => {
      const mockReminders: Partial<Reminder>[] = [
        { id: '1', title: 'Test', isCompleted: false, list: 'Default' },
      ];

      mockExecuteCli.mockResolvedValue({
        reminders: mockReminders,
      });
      mockApplyReminderFilters.mockImplementation((reminders) => reminders);

      const result = await repository.findReminders();

      expect(result).toHaveLength(1);
    });

    it('should pass through due dates from Swift CLI when listing reminders', async () => {
      const mockReminders: Partial<Reminder>[] = [
        {
          id: '99',
          title: 'Pass Through Date',
          isCompleted: false,
          list: 'Default',
          dueDate: '2025-11-20T02:00:00Z',
        },
      ];

      mockExecuteCli.mockResolvedValue({
        reminders: mockReminders,
      });
      mockApplyReminderFilters.mockImplementation((reminders) => reminders);

      const result = await repository.findReminders();

      expect(result[0].dueDate).toBe('2025-11-20T02:00:00Z');
    });

    it('should preserve alarmType when mapping alarms from Swift CLI', async () => {
      const mockReminders = [
        {
          id: 'alarm-1',
          title: 'Alarm Type Reminder',
          isCompleted: false,
          list: 'Default',
          priority: 0,
          alarms: [{ relativeOffset: -900, alarmType: 'display' }],
        },
      ];

      mockExecuteCli.mockResolvedValue({
        reminders: mockReminders,
      });
      mockApplyReminderFilters.mockImplementation((reminders) => reminders);

      const result = await repository.findReminders();

      expect(result[0].alarms).toEqual([
        { relativeOffset: -900, alarmType: 'display' },
      ]);
    });
  });

  describe('findAllLists', () => {
    it('should return all reminder lists using read-lists action', async () => {
      const mockLists: ReminderList[] = [
        { id: '1', title: 'Default' },
        { id: '2', title: 'Work' },
      ];

      mockExecuteCli.mockResolvedValue(mockLists);
      mockGetListEmblems.mockResolvedValue(new Map());

      const result = await repository.findAllLists();

      expect(mockExecuteCli).toHaveBeenCalledWith(['--action', 'read-lists']);
      expect(result).toEqual(mockLists);
    });

    it('should return empty array when no lists', async () => {
      mockExecuteCli.mockResolvedValue([]);
      mockGetListEmblems.mockResolvedValue(new Map());

      const result = await repository.findAllLists();

      expect(result).toEqual([]);
    });
  });

  describe('createReminder', () => {
    it('should create reminder with all fields', async () => {
      const data = {
        title: 'New Reminder',
        list: 'Work',
        notes: 'Some notes',
        url: 'https://example.com',
        dueDate: '2024-01-15',
      };
      const mockResult: Reminder = {
        id: '123',
        title: 'New Reminder',
        isCompleted: false,
        list: 'Default',
        priority: 0,
      };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.createReminder(data);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'create',
        '--title',
        'New Reminder',
        '--targetList',
        'Work',
        '--note',
        'Some notes',
        '--url',
        'https://example.com',
        '--dueDate',
        '2024-01-15',
      ]);
      expect(result).toBe(mockResult);
    });

    it('should create reminder with minimal fields', async () => {
      const data = {
        title: 'Simple Reminder',
      };
      const mockResult: Reminder = {
        id: '123',
        title: 'Simple Reminder',
        isCompleted: false,
        list: 'Default',
        priority: 0,
      };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.createReminder(data);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'create',
        '--title',
        'Simple Reminder',
      ]);
      expect(result).toBe(mockResult);
    });

    it('should handle optional fields correctly', async () => {
      const data = {
        title: 'Test',
        list: 'Work',
        // notes, url, dueDate omitted
      };
      const mockResult: Reminder = {
        id: '123',
        title: 'Test',
        isCompleted: false,
        list: 'Default',
        priority: 0,
      };

      mockExecuteCli.mockResolvedValue(mockResult);

      await repository.createReminder(data);

      const args = mockExecuteCli.mock.calls[0][0];
      expect(args).not.toContain('--note');
      expect(args).not.toContain('--url');
      expect(args).not.toContain('--dueDate');
    });

    it('should create reminder with completed status', async () => {
      const data = {
        title: 'Already Done',
        isCompleted: true,
      };
      const mockResult: Reminder = {
        id: '123',
        title: 'Already Done',
        isCompleted: true,
        list: 'Default',
        priority: 0,
      };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.createReminder(data);

      const args = mockExecuteCli.mock.calls[0][0];
      expect(args).toContain('--isCompleted');
      expect(args).toContain('true');
      expect(result).toBe(mockResult);
    });

    it('should skip isCompleted when undefined', async () => {
      const data = {
        title: 'Test',
        // isCompleted not provided
      };
      const mockResult: Reminder = {
        id: '123',
        title: 'Test',
        isCompleted: false,
        list: 'Default',
        priority: 0,
      };

      mockExecuteCli.mockResolvedValue(mockResult);

      await repository.createReminder(data);

      const args = mockExecuteCli.mock.calls[0][0];
      expect(args).not.toContain('--isCompleted');
    });
  });

  describe('updateReminder', () => {
    it('should update reminder with all fields', async () => {
      const data = {
        id: '123',
        newTitle: 'Updated Title',
        list: 'Work',
        notes: 'Updated notes',
        url: 'https://updated.com',
        isCompleted: true,
        dueDate: '2024-01-20',
      };
      const mockResult: Reminder = {
        id: '123',
        title: 'Updated Title',
        isCompleted: false,
        list: 'Default',
        priority: 0,
      };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.updateReminder(data);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'update',
        '--id',
        '123',
        '--title',
        'Updated Title',
        '--targetList',
        'Work',
        '--note',
        'Updated notes',
        '--url',
        'https://updated.com',
        '--dueDate',
        '2024-01-20',
        '--isCompleted',
        'true',
      ]);
      expect(result).toBe(mockResult);
    });

    it('should allow empty notes when updating reminder', async () => {
      const data = {
        id: '123',
        notes: '',
      };
      const mockResult: { id: string } = { id: '123' };

      mockExecuteCli.mockResolvedValue(mockResult);

      await repository.updateReminder(data);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'update',
        '--id',
        '123',
        '--note',
        '',
      ]);
    });

    it('should update reminder with minimal fields', async () => {
      const data = {
        id: '123',
      };
      const mockResult: { id: string } = { id: '123' };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.updateReminder(data);

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'update',
        '--id',
        '123',
      ]);
      expect(result).toBe(mockResult);
    });

    it('should handle optional isCompleted field', async () => {
      const data = {
        id: '123',
        isCompleted: false,
      };

      mockExecuteCli.mockResolvedValue({ id: '123' });

      await repository.updateReminder(data);

      const args = mockExecuteCli.mock.calls[0][0];
      expect(args).toContain('--isCompleted');
      expect(args).toContain('false');
    });

    it('should skip isCompleted when undefined', async () => {
      const data = {
        id: '123',
        newTitle: 'Updated',
        // isCompleted not provided
      };

      mockExecuteCli.mockResolvedValue({ id: '123' });

      await repository.updateReminder(data);

      const args = mockExecuteCli.mock.calls[0][0];
      expect(args).not.toContain('--isCompleted');
    });
  });

  describe('deleteReminder', () => {
    it('should delete reminder by id', async () => {
      mockExecuteCli.mockResolvedValue(undefined);

      await repository.deleteReminder('123');

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'delete',
        '--id',
        '123',
      ]);
    });
  });

  describe('createReminderList', () => {
    it('should create reminder list', async () => {
      const mockResult: ReminderList = { id: '456', title: 'New List' };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.createReminderList('New List');

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'create-list',
        '--name',
        'New List',
      ]);
      expect(result).toEqual(mockResult);
    });

    it('should create list with special characters', async () => {
      const mockResult: ReminderList = {
        id: '789',
        title: 'Shopping List! @#$',
      };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.createReminderList('Shopping List! @#$');

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'create-list',
        '--name',
        'Shopping List! @#$',
      ]);
      expect(result).toEqual(mockResult);
    });

    it('should propagate CLI errors', async () => {
      const mockError = new Error('No calendar source available');

      mockExecuteCli.mockRejectedValue(mockError);

      await expect(repository.createReminderList('New List')).rejects.toThrow(
        'No calendar source available',
      );
    });

    it('should return emblem when set successfully', async () => {
      const mockResult: ReminderList = { id: '456', title: 'New List' };
      mockSetListEmblem.mockResolvedValue(undefined);

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.createReminderList(
        'New List',
        undefined,
        '🛒',
      );

      expect(result.emblem).toBe('🛒');
      expect(mockSetListEmblem).toHaveBeenCalledWith('New List', '🛒');
    });

    it('should return undefined emblem when setting fails', async () => {
      const mockResult: ReminderList = { id: '456', title: 'New List' };
      mockSetListEmblem.mockRejectedValue(new Error('List not found'));

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.createReminderList(
        'New List',
        undefined,
        '🛒',
      );

      expect(result.emblem).toBeUndefined();
      expect(mockSetListEmblem).toHaveBeenCalledWith('New List', '🛒');
    });
  });

  describe('updateReminderList', () => {
    it('should update reminder list', async () => {
      const mockResult: ReminderList = { id: '456', title: 'Updated List' };

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.updateReminderList(
        'Old Name',
        'New Name',
      );

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'update-list',
        '--name',
        'Old Name',
        '--newName',
        'New Name',
      ]);
      expect(result).toEqual(mockResult);
    });

    it('should return emblem when set successfully', async () => {
      const mockResult: ReminderList = { id: '456', title: 'New List' };
      mockSetListEmblem.mockResolvedValue(undefined);

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.updateReminderList(
        'Old Name',
        'New Name',
        undefined,
        '🛒',
      );

      expect(result.emblem).toBe('🛒');
      expect(mockSetListEmblem).toHaveBeenCalledWith('New Name', '🛒');
    });

    it('should return undefined emblem when setting fails', async () => {
      const mockResult: ReminderList = { id: '456', title: 'New List' };
      mockSetListEmblem.mockRejectedValue(new Error('List not found'));

      mockExecuteCli.mockResolvedValue(mockResult);

      const result = await repository.updateReminderList(
        'Old Name',
        'New Name',
        undefined,
        '🛒',
      );

      expect(result.emblem).toBeUndefined();
      expect(mockSetListEmblem).toHaveBeenCalledWith('New Name', '🛒');
    });
  });

  describe('deleteReminderList', () => {
    it('should delete reminder list', async () => {
      mockExecuteCli.mockResolvedValue(undefined);

      await repository.deleteReminderList('Test List');

      expect(mockExecuteCli).toHaveBeenCalledWith([
        '--action',
        'delete-list',
        '--name',
        'Test List',
      ]);
    });
  });
});
