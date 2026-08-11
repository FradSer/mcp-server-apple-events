/**
 * subtaskUtils.test.ts
 * Tests for subtask parsing and manipulation utilities
 */

import type { Subtask } from '../types/index.js';
import {
  addSubtask,
  combineSubtasksAndNotes,
  createSubtasksFromTitles,
  generateSubtaskId,
  getSubtaskProgress,
  parseSubtasks,
  removeSubtask,
  reorderSubtasks,
  serializeSubtasks,
  stripSubtasks,
  toggleSubtask,
  updateSubtask,
} from './subtaskUtils.js';

describe('subtaskUtils', () => {
  describe('generateSubtaskId', () => {
    it('should generate an 8-character hex string', () => {
      const id = generateSubtaskId();
      expect(id).toHaveLength(8);
      expect(/^[a-f0-9]{8}$/.test(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSubtaskId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('parseSubtasks', () => {
    it('should return empty array for null/undefined notes', () => {
      expect(parseSubtasks(null)).toEqual([]);
      expect(parseSubtasks(undefined)).toEqual([]);
      expect(parseSubtasks('')).toEqual([]);
    });

    it('should return empty array for notes without subtask section', () => {
      expect(parseSubtasks('Just some regular notes')).toEqual([]);
      expect(
        parseSubtasks('Notes with\nmultiple lines\nbut no subtasks'),
      ).toEqual([]);
    });

    it('should parse a single incomplete subtask', () => {
      const notes =
        'Some notes\n---SUBTASKS---\n[ ] {abc12345} First subtask\n---END SUBTASKS---';
      const result = parseSubtasks(notes);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'abc12345',
        title: 'First subtask',
        isCompleted: false,
      });
    });

    it('should parse a single completed subtask', () => {
      const notes =
        '---SUBTASKS---\n[x] {def67890} Completed task\n---END SUBTASKS---';
      const result = parseSubtasks(notes);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: 'def67890',
        title: 'Completed task',
        isCompleted: true,
      });
    });

    it('should parse multiple subtasks with mixed completion status', () => {
      const notes = `---SUBTASKS---
[ ] {aaa11111} First task
[x] {bbb22222} Second task
[ ] {ccc33333} Third task
---END SUBTASKS---`;
      const result = parseSubtasks(notes);

      expect(result).toHaveLength(3);
      expect(result[0]!.isCompleted).toBe(false);
      expect(result[1]!.isCompleted).toBe(true);
      expect(result[2]!.isCompleted).toBe(false);
    });

    it('should ignore malformed subtask lines', () => {
      const notes = `---SUBTASKS---
[ ] {abc12345} Valid task
Invalid line
[x] Missing ID
[ ] {def67890} Another valid
---END SUBTASKS---`;
      const result = parseSubtasks(notes);

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('abc12345');
      expect(result[1]!.id).toBe('def67890');
    });

    it('should handle extra whitespace in subtask lines', () => {
      const notes =
        '---SUBTASKS---\n[ ]   {abc12345}   Task with spaces  \n---END SUBTASKS---';
      const result = parseSubtasks(notes);

      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe('Task with spaces');
    });

    it('should handle empty subtask section', () => {
      const notes = '---SUBTASKS---\n\n---END SUBTASKS---';
      const result = parseSubtasks(notes);

      expect(result).toEqual([]);
    });
  });

  describe('serializeSubtasks', () => {
    it('should return empty string for empty array', () => {
      expect(serializeSubtasks([])).toBe('');
      expect(serializeSubtasks(null as unknown as Subtask[])).toBe('');
    });

    it('should serialize a single incomplete subtask', () => {
      const subtasks: Subtask[] = [
        { id: 'abc12345', title: 'Task one', isCompleted: false },
      ];
      const result = serializeSubtasks(subtasks);

      expect(result).toBe(
        '---SUBTASKS---\n[ ] {abc12345} Task one\n---END SUBTASKS---',
      );
    });

    it('should serialize a single completed subtask', () => {
      const subtasks: Subtask[] = [
        { id: 'def67890', title: 'Task done', isCompleted: true },
      ];
      const result = serializeSubtasks(subtasks);

      expect(result).toContain('[x] {def67890} Task done');
    });

    it('should serialize multiple subtasks', () => {
      const subtasks: Subtask[] = [
        { id: 'aaa11111', title: 'First', isCompleted: false },
        { id: 'bbb22222', title: 'Second', isCompleted: true },
        { id: 'ccc33333', title: 'Third', isCompleted: false },
      ];
      const result = serializeSubtasks(subtasks);

      expect(result).toContain('[ ] {aaa11111} First');
      expect(result).toContain('[x] {bbb22222} Second');
      expect(result).toContain('[ ] {ccc33333} Third');
    });
  });

  describe('stripSubtasks', () => {
    it('should return empty string for null/undefined notes', () => {
      expect(stripSubtasks(null)).toBe('');
      expect(stripSubtasks(undefined)).toBe('');
    });

    it('should return notes unchanged if no subtask section', () => {
      expect(stripSubtasks('Just notes')).toBe('Just notes');
    });

    it('should remove subtask section from notes', () => {
      const notes =
        'My notes\n---SUBTASKS---\n[ ] {abc12345} Task\n---END SUBTASKS---';
      const result = stripSubtasks(notes);

      expect(result).toBe('My notes');
    });

    it('should collapse multiple newlines after stripping', () => {
      const notes =
        'Notes\n\n\n---SUBTASKS---\n[ ] {abc12345} Task\n---END SUBTASKS---\n\n';
      const result = stripSubtasks(notes);

      expect(result).toBe('Notes');
    });
  });

  describe('combineSubtasksAndNotes', () => {
    it('should return only notes if no subtasks', () => {
      const result = combineSubtasksAndNotes([], 'My notes');
      expect(result).toBe('My notes');
    });

    it('should return only subtasks if no notes', () => {
      const subtasks: Subtask[] = [
        { id: 'abc12345', title: 'Task', isCompleted: false },
      ];
      const result = combineSubtasksAndNotes(subtasks, undefined);

      expect(result).toContain('---SUBTASKS---');
      expect(result).toContain('Task');
    });

    it('should combine notes and subtasks', () => {
      const subtasks: Subtask[] = [
        { id: 'abc12345', title: 'Task', isCompleted: false },
      ];
      const result = combineSubtasksAndNotes(subtasks, 'My notes');

      expect(result).toContain('My notes');
      expect(result).toContain('---SUBTASKS---');
    });

    it('should replace existing subtask section', () => {
      const existingNotes =
        'My notes\n---SUBTASKS---\n[ ] {old1234} Old task\n---END SUBTASKS---';
      const newSubtasks: Subtask[] = [
        { id: 'new56789', title: 'New task', isCompleted: false },
      ];
      const result = combineSubtasksAndNotes(newSubtasks, existingNotes);

      expect(result).toContain('My notes');
      expect(result).toContain('New task');
      expect(result).not.toContain('Old task');
    });
  });

  describe('addSubtask', () => {
    it('should add a subtask to notes without existing subtasks', () => {
      const result = addSubtask('New task', 'My notes');

      expect(result.subtask.title).toBe('New task');
      expect(result.subtask.isCompleted).toBe(false);
      expect(result.subtask.id).toHaveLength(8);
      expect(result.notes).toContain('My notes');
      expect(result.notes).toContain('New task');
    });

    it('should add a subtask to notes with existing subtasks', () => {
      const existingNotes =
        'Notes\n---SUBTASKS---\n[ ] {abc12345} First\n---END SUBTASKS---';
      const result = addSubtask('Second', existingNotes);

      expect(result.notes).toContain('First');
      expect(result.notes).toContain('Second');
    });

    it('should trim whitespace from title', () => {
      const result = addSubtask('  Trimmed title  ', 'Notes');

      expect(result.subtask.title).toBe('Trimmed title');
    });
  });

  describe('updateSubtask', () => {
    const existingNotes =
      'Notes\n---SUBTASKS---\n[ ] {abc12345} Original title\n---END SUBTASKS---';

    it('should update subtask title', () => {
      const result = updateSubtask(
        'abc12345',
        { title: 'New title' },
        existingNotes,
      );

      expect(result).toContain('New title');
      expect(result).not.toContain('Original title');
    });

    it('should update subtask completion status', () => {
      const result = updateSubtask(
        'abc12345',
        { isCompleted: true },
        existingNotes,
      );

      expect(result).toContain('[x] {abc12345}');
    });

    it('should update both title and completion', () => {
      const result = updateSubtask(
        'abc12345',
        { title: 'Updated', isCompleted: true },
        existingNotes,
      );

      expect(result).toContain('[x] {abc12345} Updated');
    });

    it('should throw error if subtask not found', () => {
      expect(() =>
        updateSubtask('nonexistent', { title: 'New' }, existingNotes),
      ).toThrow("Subtask with ID 'nonexistent' not found.");
    });

    it('should preserve other subtasks', () => {
      const notes =
        '---SUBTASKS---\n[ ] {abc12345} First\n[ ] {def67890} Second\n---END SUBTASKS---';
      const result = updateSubtask('abc12345', { isCompleted: true }, notes);

      expect(result).toContain('[x] {abc12345} First');
      expect(result).toContain('[ ] {def67890} Second');
    });
  });

  describe('removeSubtask', () => {
    const existingNotes =
      'Notes\n---SUBTASKS---\n[ ] {abc12345} First\n[ ] {def67890} Second\n---END SUBTASKS---';

    it('should remove a subtask by ID', () => {
      const result = removeSubtask('abc12345', existingNotes);

      expect(result).not.toContain('First');
      expect(result).toContain('Second');
    });

    it('should throw error if subtask not found', () => {
      expect(() => removeSubtask('nonexistent', existingNotes)).toThrow(
        "Subtask with ID 'nonexistent' not found.",
      );
    });

    it('should remove entire subtask section if last subtask removed', () => {
      const singleNotes =
        'Notes\n---SUBTASKS---\n[ ] {abc12345} Only task\n---END SUBTASKS---';
      const result = removeSubtask('abc12345', singleNotes);

      expect(result).not.toContain('---SUBTASKS---');
      expect(result).toBe('Notes');
    });
  });

  describe('toggleSubtask', () => {
    const existingNotes =
      '---SUBTASKS---\n[ ] {abc12345} Incomplete task\n---END SUBTASKS---';

    it('should toggle incomplete to complete', () => {
      const result = toggleSubtask('abc12345', existingNotes);

      expect(result.subtask.isCompleted).toBe(true);
      expect(result.notes).toContain('[x] {abc12345}');
    });

    const completedNotes =
      '---SUBTASKS---\n[x] {abc12345} Completed task\n---END SUBTASKS---';

    it('should toggle complete to incomplete', () => {
      const result = toggleSubtask('abc12345', completedNotes);

      expect(result.subtask.isCompleted).toBe(false);
      expect(result.notes).toContain('[ ] {abc12345}');
    });

    it('should throw error if subtask not found', () => {
      expect(() => toggleSubtask('nonexistent', existingNotes)).toThrow(
        "Subtask with ID 'nonexistent' not found.",
      );
    });
  });

  describe('reorderSubtasks', () => {
    const existingNotes =
      '---SUBTASKS---\n[ ] {aaa11111} First\n[ ] {bbb22222} Second\n[ ] {ccc33333} Third\n---END SUBTASKS---';

    it('should reorder subtasks according to provided order', () => {
      const result = reorderSubtasks(
        ['ccc33333', 'aaa11111', 'bbb22222'],
        existingNotes,
      );

      const lines = result.split('\n').filter((l) => l.startsWith('['));
      expect(lines[0]).toContain('Third');
      expect(lines[1]).toContain('First');
      expect(lines[2]).toContain('Second');
    });

    it('should throw error if ID in order does not exist', () => {
      expect(() =>
        reorderSubtasks(['nonexistent', 'aaa11111', 'bbb22222'], existingNotes),
      ).toThrow("Subtask with ID 'nonexistent' not found.");
    });

    it('should throw error if subtask ID is missing from order', () => {
      expect(() =>
        reorderSubtasks(['aaa11111', 'bbb22222'], existingNotes),
      ).toThrow("Reorder array is missing subtask ID 'ccc33333'");
    });

    it('should handle single subtask', () => {
      const singleNotes =
        '---SUBTASKS---\n[ ] {aaa11111} Only\n---END SUBTASKS---';
      const result = reorderSubtasks(['aaa11111'], singleNotes);

      expect(result).toContain('Only');
    });
  });

  describe('createSubtasksFromTitles', () => {
    it('should create subtasks from title array', () => {
      const titles = ['Task 1', 'Task 2', 'Task 3'];
      const result = createSubtasksFromTitles(titles);

      expect(result).toHaveLength(3);
      expect(result[0]!.title).toBe('Task 1');
      expect(result[1]!.title).toBe('Task 2');
      expect(result[2]!.title).toBe('Task 3');
    });

    it('should create all subtasks as incomplete', () => {
      const result = createSubtasksFromTitles(['Task']);

      expect(result[0]!.isCompleted).toBe(false);
    });

    it('should generate unique IDs for each subtask', () => {
      const result = createSubtasksFromTitles(['A', 'B', 'C']);
      const ids = result.map((s) => s.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(3);
    });

    it('should trim whitespace from titles', () => {
      const result = createSubtasksFromTitles(['  Trimmed  ']);

      expect(result[0]!.title).toBe('Trimmed');
    });

    it('should return empty array for empty input', () => {
      expect(createSubtasksFromTitles([])).toEqual([]);
    });
  });

  describe('getSubtaskProgress', () => {
    it('should return 0/0/100 for empty array', () => {
      const result = getSubtaskProgress([]);

      expect(result).toEqual({ completed: 0, total: 0, percentage: 100 });
    });

    it('should return 0/0/100 for null input', () => {
      const result = getSubtaskProgress(null as unknown as Subtask[]);

      expect(result).toEqual({ completed: 0, total: 0, percentage: 100 });
    });

    it('should calculate progress for all incomplete', () => {
      const subtasks: Subtask[] = [
        { id: '1', title: 'A', isCompleted: false },
        { id: '2', title: 'B', isCompleted: false },
        { id: '3', title: 'C', isCompleted: false },
      ];
      const result = getSubtaskProgress(subtasks);

      expect(result).toEqual({ completed: 0, total: 3, percentage: 0 });
    });

    it('should calculate progress for all complete', () => {
      const subtasks: Subtask[] = [
        { id: '1', title: 'A', isCompleted: true },
        { id: '2', title: 'B', isCompleted: true },
      ];
      const result = getSubtaskProgress(subtasks);

      expect(result).toEqual({ completed: 2, total: 2, percentage: 100 });
    });

    it('should calculate progress for mixed completion', () => {
      const subtasks: Subtask[] = [
        { id: '1', title: 'A', isCompleted: true },
        { id: '2', title: 'B', isCompleted: false },
        { id: '3', title: 'C', isCompleted: true },
        { id: '4', title: 'D', isCompleted: false },
      ];
      const result = getSubtaskProgress(subtasks);

      expect(result).toEqual({ completed: 2, total: 4, percentage: 50 });
    });

    it('should round percentage correctly', () => {
      const subtasks: Subtask[] = [
        { id: '1', title: 'A', isCompleted: true },
        { id: '2', title: 'B', isCompleted: false },
        { id: '3', title: 'C', isCompleted: false },
      ];
      const result = getSubtaskProgress(subtasks);

      expect(result.percentage).toBe(33); // 1/3 = 33.33... -> 33
    });
  });

  describe('edge cases', () => {
    it('should handle notes with only subtask section', () => {
      const notes = '---SUBTASKS---\n[ ] {abc12345} Task\n---END SUBTASKS---';
      const subtasks = parseSubtasks(notes);

      expect(subtasks).toHaveLength(1);
    });

    it('should handle subtask title with special characters', () => {
      const result = addSubtask('Task with "quotes" and <brackets>', 'Notes');

      expect(result.subtask.title).toBe('Task with "quotes" and <brackets>');
    });

    it('should handle very long subtask titles', () => {
      const longTitle = 'A'.repeat(500);
      const result = addSubtask(longTitle, 'Notes');

      expect(result.subtask.title).toBe(longTitle);
      expect(result.notes).toContain(longTitle);
    });

    it('should handle notes with multiple consecutive newlines', () => {
      const notes =
        'Line 1\n\n\n\nLine 2\n---SUBTASKS---\n[ ] {abc12345} Task\n---END SUBTASKS---';
      const subtasks = parseSubtasks(notes);

      expect(subtasks).toHaveLength(1);
    });
  });
});
