/**
 * reminderRepository.test.ts
 * Tests for the reminder repository against the vendored `event` CLI.
 *
 * Scenarios are organized by the four shapes the repository exposes:
 *   - read     → `event reminders list [--list <name>] [--completed] --json`
 *               (id lookups derived via list-and-find since `event` has no
 *               read-by-id command).
 *   - mutate   → `event reminders create|update|delete` with the trimmed flag
 *               set (no alarms/recurrence/locationTrigger/location/etc.).
 *   - lists    → `event reminders lists list|create|update|delete` with
 *               name→id resolution for update/delete.
 *   - guards   → cross-list moves must surface a clean `CliUserError`
 *               instead of silently dropping the change (un-completing is
 *               supported by the CLI and passes straight through).
 */

import type { Reminder, ReminderList } from '../types/index.js';
import type { ListJSON, ReminderJSON } from '../types/repository.js';
import type { ReminderFilters } from './dateFiltering.js';
import {
  applyReminderFilters,
  prefilterReminderJsons,
} from './dateFiltering.js';
import { executeEventCliJson, executeEventCliPlain } from './eventCli.js';
import { reminderRepository } from './reminderRepository.js';

jest.mock('./eventCli.js');
jest.mock('./dateFiltering.js');

const mockJson = executeEventCliJson as jest.MockedFunction<
  typeof executeEventCliJson
>;
const mockPlain = executeEventCliPlain as jest.MockedFunction<
  typeof executeEventCliPlain
>;
const mockApplyReminderFilters = applyReminderFilters as jest.MockedFunction<
  typeof applyReminderFilters
>;
const mockPrefilterReminderJsons =
  prefilterReminderJsons as jest.MockedFunction<typeof prefilterReminderJsons>;

const reminderFixture = (overrides: Partial<ReminderJSON> = {}): ReminderJSON =>
  ({
    id: 'rem-1',
    title: 'Test',
    isCompleted: false,
    list: 'Default',
    notes: null,
    url: null,
    dueDate: null,
    priority: 0,
    locationTrigger: null,
    ...overrides,
  }) as ReminderJSON;

describe('ReminderRepository (event CLI backend)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApplyReminderFilters.mockImplementation(
      (reminders: Reminder[], _filters: ReminderFilters) => reminders,
    );
    mockPrefilterReminderJsons.mockImplementation(
      (reminders: ReminderJSON[], _filters: ReminderFilters) => reminders,
    );
  });

  describe('findReminderById', () => {
    it('looks up a reminder by listing and finding (event has no read-by-id)', async () => {
      const rem = reminderFixture({
        id: 'rem-2',
        title: 'Test 2',
        isCompleted: true,
        list: 'Work',
      });
      mockJson.mockResolvedValueOnce([reminderFixture(), rem]);

      const result = await reminderRepository.findReminderById('rem-2');

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'list',
        '--completed',
        '--json',
      ]);
      expect(result.id).toBe('rem-2');
      expect(result.title).toBe('Test 2');
      expect(result.list).toBe('Work');
      expect(result.isCompleted).toBe(true);
    });

    it('throws CliUserError when the id is not present in the listing', async () => {
      mockJson.mockResolvedValueOnce([reminderFixture()]);

      await expect(
        reminderRepository.findReminderById('missing'),
      ).rejects.toThrow("Reminder with ID 'missing' not found.");
    });

    it('coerces null notes/url/dueDate to undefined on the domain type', async () => {
      mockJson.mockResolvedValueOnce([
        reminderFixture({ id: 'rem-1', notes: null, url: null, dueDate: null }),
      ]);
      const result = await reminderRepository.findReminderById('rem-1');
      expect(result.notes).toBeUndefined();
      expect(result.url).toBeUndefined();
      expect(result.dueDate).toBeUndefined();
    });
  });

  describe('findReminders', () => {
    it('issues a plain `reminders list --json` when no filters are provided', async () => {
      mockJson.mockResolvedValueOnce([]);

      await reminderRepository.findReminders();

      expect(mockJson).toHaveBeenCalledWith(['reminders', 'list', '--json']);
    });

    it('passes --list and --completed when filters set them', async () => {
      mockJson.mockResolvedValueOnce([]);

      await reminderRepository.findReminders({
        list: 'Work',
        showCompleted: true,
      });

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'list',
        '--list',
        'Work',
        '--completed',
        '--json',
      ]);
    });

    it('passes --start/--end to the CLI when a full window is supplied', async () => {
      mockJson.mockResolvedValueOnce([]);

      await reminderRepository.findReminders({
        startDate: '2026-08-10',
        endDate: '2026-08-24',
      });

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'list',
        '--start',
        '2026-08-10',
        '--end',
        '2026-08-24',
        '--json',
      ]);
    });

    it('trims time components off window bounds before passing to the CLI', async () => {
      mockJson.mockResolvedValueOnce([]);

      await reminderRepository.findReminders({
        startDate: '2026-08-10 09:30:00',
        endDate: '2026-08-24 18:00:00',
      });

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'list',
        '--start',
        '2026-08-10',
        '--end',
        '2026-08-24',
        '--json',
      ]);
    });

    it('fills a missing end from a 14-day window when only startDate is given', async () => {
      mockJson.mockResolvedValueOnce([]);

      await reminderRepository.findReminders({ startDate: '2026-08-10' });

      // Start is passed through untouched; the end is today+14 as date-only.
      const call = mockJson.mock.calls[0]?.[0] as string[];
      expect(call).toEqual([
        'reminders',
        'list',
        '--start',
        '2026-08-10',
        '--end',
        expect.any(String),
        '--json',
      ]);
      const endDate = call[call.length - 2];
      expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('fills a missing start from a 14-day window when only endDate is given', async () => {
      mockJson.mockResolvedValueOnce([]);

      await reminderRepository.findReminders({ endDate: '2026-08-24' });

      // End is passed through untouched; the start is end-14 as date-only.
      const call = mockJson.mock.calls[0]?.[0] as string[];
      expect(call).toEqual([
        'reminders',
        'list',
        '--start',
        expect.any(String),
        '--end',
        '2026-08-24',
        '--json',
      ]);
      const startDate = call[call.length - 4];
      expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(startDate).not.toBe('2026-08-24');
    });

    it('falls back to today when an unparseable bound is used to size the window', async () => {
      mockJson.mockResolvedValueOnce([]);

      // `parseReminderDueDate` rejects this string, so the window is sized from
      // `new Date()`; the passed-through bound is still forwarded untouched.
      await reminderRepository.findReminders({
        startDate: 'not-a-real-date',
      });

      const call = mockJson.mock.calls[0]?.[0] as string[];
      expect(call).toEqual([
        'reminders',
        'list',
        '--start',
        'not-a-real-date',
        '--end',
        expect.any(String),
        '--json',
      ]);
    });

    it('pre-filters raw JSON for the structural filters (priority/recurring/locationBased) before mapReminder', async () => {
      mockJson.mockResolvedValueOnce([reminderFixture()]);
      const filters = {
        priority: 'high' as const,
        recurring: true,
        locationBased: true,
      };

      await reminderRepository.findReminders(filters);

      expect(mockPrefilterReminderJsons).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining(filters),
      );
    });

    it('routes notes-dependent filters (search/dueWithin/tags) through applyReminderFilters after mapping', async () => {
      mockJson.mockResolvedValueOnce([reminderFixture()]);
      const filters = {
        search: 'meeting',
        dueWithin: 'today' as const,
        priority: 'high' as const,
        recurring: true,
        locationBased: true,
        tags: ['urgent'],
      };

      await reminderRepository.findReminders(filters);

      expect(mockApplyReminderFilters).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          search: 'meeting',
          dueWithin: 'today',
          tags: ['urgent'],
          // Filters applied by prefilter (priority/recurring/locationBased)
          // are blanked so applyReminderFilters doesn't redo them.
          priority: undefined,
          recurring: undefined,
          locationBased: undefined,
          showCompleted: undefined,
          list: undefined,
        }),
      );
    });

    it('extracts tags from notes via tagUtils integration', async () => {
      mockJson.mockResolvedValueOnce([
        reminderFixture({ notes: 'Some text\n\n[#work] [#urgent]' }),
      ]);

      const [result] = await reminderRepository.findReminders();
      expect(result!.tags).toEqual(['work', 'urgent']);
    });

    it('parses subtasks from notes via subtaskUtils integration', async () => {
      const notes =
        'Some text\n\n---SUBTASKS---\n[ ] {abc12345} First\n[x] {def67890} Second\n---END SUBTASKS---';
      mockJson.mockResolvedValueOnce([reminderFixture({ notes })]);

      const [result] = await reminderRepository.findReminders();
      expect(result!.subtasks).toEqual([
        { id: 'abc12345', title: 'First', isCompleted: false },
        { id: 'def67890', title: 'Second', isCompleted: true },
      ]);
      expect(result!.subtaskProgress).toEqual({
        completed: 1,
        total: 2,
        percentage: 50,
      });
    });

    it("derives a top-level locationTrigger from the first alarm's location trigger", async () => {
      mockJson.mockResolvedValueOnce([
        reminderFixture({
          alarms: [
            {
              locationTrigger: {
                title: 'Office',
                latitude: 37.7749,
                longitude: -122.4194,
                radius: 100,
                proximity: 'enter',
              },
            },
          ],
        }),
      ]);

      const [result] = await reminderRepository.findReminders();
      expect(result!.locationTrigger).toEqual({
        title: 'Office',
        latitude: 37.7749,
        longitude: -122.4194,
        radius: 100,
        proximity: 'enter',
      });
    });
  });

  describe('findAllLists', () => {
    it('issues `reminders lists list --json` and normalizes color', async () => {
      const lists: ListJSON[] = [
        { id: 'list-1', title: 'Work', color: '#FF0000' },
        { id: 'list-2', title: 'Personal' },
      ];
      mockJson.mockResolvedValueOnce(lists);

      const result = await reminderRepository.findAllLists();

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'lists',
        'list',
        '--json',
      ]);
      expect(result).toEqual<ReminderList[]>([
        { id: 'list-1', title: 'Work', color: '#FF0000' },
        { id: 'list-2', title: 'Personal' },
      ]);
    });
  });

  describe('createReminder', () => {
    it('passes only the event-supported flag subset', async () => {
      mockJson.mockResolvedValueOnce(reminderFixture({ id: 'created' }));

      await reminderRepository.createReminder({
        title: 'Buy milk',
        list: 'Shopping',
        notes: 'whole milk',
        url: 'https://example.com',
        dueDate: '2024-03-25 18:00:00',
        priority: 1,
      });

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'create',
        '--title',
        'Buy milk',
        '--list',
        'Shopping',
        '--notes',
        'whole milk',
        '--url',
        'https://example.com',
        '--due',
        '2024-03-25 18:00:00',
        '--priority',
        '1',
        '--no-shortcuts',
        '--json',
      ]);
    });

    it('omits all optional flags when none are provided', async () => {
      mockJson.mockResolvedValueOnce(reminderFixture({ id: 'created' }));

      await reminderRepository.createReminder({ title: 'Bare' });

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'create',
        '--title',
        'Bare',
        '--no-shortcuts',
        '--json',
      ]);
    });
  });

  describe('updateReminder', () => {
    it('passes the supported flag subset and adds --completed <bool> when isCompleted is set', async () => {
      mockJson.mockResolvedValueOnce(reminderFixture({ id: 'rem-1' }));

      await reminderRepository.updateReminder({
        id: 'rem-1',
        newTitle: 'New Title',
        notes: 'updated notes',
        url: 'https://example.com',
        dueDate: '2024-03-26 09:00:00',
        startDate: '2024-03-26 08:00:00',
        priority: 5,
        isCompleted: true,
      });

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'update',
        '--id',
        'rem-1',
        '--title',
        'New Title',
        '--notes',
        'updated notes',
        '--url',
        'https://example.com',
        '--due',
        '2024-03-26 09:00:00',
        '--start',
        '2024-03-26 08:00:00',
        '--priority',
        '5',
        '--completed',
        'true',
        '--no-shortcuts',
        '--json',
      ]);
    });

    it('passes --completed false when isCompleted=false (un-complete)', async () => {
      mockJson.mockResolvedValueOnce(reminderFixture({ id: 'rem-uc' }));

      await reminderRepository.updateReminder({
        id: 'rem-uc',
        isCompleted: false,
      });

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'update',
        '--id',
        'rem-uc',
        '--completed',
        'false',
        '--no-shortcuts',
        '--json',
      ]);
    });

    it('omits --completed entirely when isCompleted is undefined', async () => {
      mockJson.mockResolvedValueOnce(reminderFixture({ id: 'rem-np' }));

      await reminderRepository.updateReminder({
        id: 'rem-np',
        newTitle: 'No completion change',
      });

      expect(mockJson).toHaveBeenCalled();
      const callArgs = mockJson.mock.calls[0]?.[0] ?? [];
      expect(callArgs).not.toContain('--completed');
    });

    // The cross-list move guard lives in handleUpdateReminder
    // (src/tools/handlers/reminderHandlers.ts) so the handler's existing
    // findReminderById fetch is shared with the notes-rebuild path; see
    // handlers.test.ts for coverage. Un-completing (`--completed false`) is
    // supported by the `event` CLI since v0.5.0 (commit 564bd4b) — the test
    // above pins the value-passing contract.
  });

  describe('deleteReminder', () => {
    it('issues `reminders delete --id <id>` via the plain executor', async () => {
      mockPlain.mockResolvedValueOnce('Reminder deleted successfully');

      await reminderRepository.deleteReminder('rem-99');

      expect(mockPlain).toHaveBeenCalledWith([
        'reminders',
        'delete',
        '--id',
        'rem-99',
      ]);
    });
  });

  describe('createReminderList', () => {
    it('issues `reminders lists create --name <name> --json`', async () => {
      const listJson: ListJSON = { id: 'list-1', title: 'New List' };
      mockJson.mockResolvedValueOnce(listJson);

      const result = await reminderRepository.createReminderList('New List');

      expect(mockJson).toHaveBeenCalledWith([
        'reminders',
        'lists',
        'create',
        '--name',
        'New List',
        '--json',
      ]);
      expect(result).toEqual({
        id: 'list-1',
        title: 'New List',
        color: undefined,
      });
    });
  });

  describe('updateReminderList', () => {
    it('resolves name→id then issues `lists update --id <id> --name <newName>`', async () => {
      const lists: ListJSON[] = [
        { id: 'list-1', title: 'Old Name' },
        { id: 'list-2', title: 'Other' },
      ];
      mockJson
        .mockResolvedValueOnce(lists)
        .mockResolvedValueOnce({ id: 'list-1', title: 'New Name' });

      const result = await reminderRepository.updateReminderList(
        'Old Name',
        'New Name',
      );

      expect(mockJson).toHaveBeenNthCalledWith(1, [
        'reminders',
        'lists',
        'list',
        '--json',
      ]);
      expect(mockJson).toHaveBeenNthCalledWith(2, [
        'reminders',
        'lists',
        'update',
        '--id',
        'list-1',
        '--name',
        'New Name',
        '--json',
      ]);
      expect(result.title).toBe('New Name');
    });

    it('throws CliUserError when the list name does not exist', async () => {
      mockJson.mockResolvedValueOnce([
        { id: 'list-1', title: 'Existing' },
      ] as ListJSON[]);

      await expect(
        reminderRepository.updateReminderList('Missing', 'New'),
      ).rejects.toThrow("List 'Missing' not found.");
    });
  });

  describe('deleteReminderList', () => {
    it('resolves name→id then issues `lists delete --id <id>` via plain executor', async () => {
      mockJson.mockResolvedValueOnce([
        { id: 'list-1', title: 'Trash Me' },
      ] as ListJSON[]);
      mockPlain.mockResolvedValueOnce('List deleted successfully');

      await reminderRepository.deleteReminderList('Trash Me');

      expect(mockPlain).toHaveBeenCalledWith([
        'reminders',
        'lists',
        'delete',
        '--id',
        'list-1',
      ]);
    });
  });
});
