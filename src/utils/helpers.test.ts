/**
 * helpers.test.ts
 * Tests for helper utility functions
 */

import {
  addOptionalArg,
  addOptionalBooleanArg,
  addOptionalJsonArg,
  addOptionalNumberArg,
  bufferToString,
  formatMultilineNotes,
  nullToUndefined,
} from './helpers.js';

describe('helpers', () => {
  describe('nullToUndefined', () => {
    it('should convert null values to undefined for specified fields', () => {
      const obj = {
        id: '123',
        title: 'Test',
        notes: null,
        url: null,
        dueDate: '2024-01-01',
      };

      const result = nullToUndefined(obj, ['notes', 'url']);

      expect(result.id).toBe('123');
      expect(result.title).toBe('Test');
      expect(result.notes).toBeUndefined();
      expect(result.url).toBeUndefined();
      expect(result.dueDate).toBe('2024-01-01');
    });

    it('should not modify non-null values', () => {
      const obj = {
        id: '123',
        notes: 'Some notes',
        url: 'https://example.com',
      };

      const result = nullToUndefined(obj, ['notes', 'url']);

      expect(result.notes).toBe('Some notes');
      expect(result.url).toBe('https://example.com');
    });

    it('should not modify fields not in the list', () => {
      const obj = {
        id: '123',
        notes: null,
        otherField: null,
      };

      const result = nullToUndefined(obj, ['notes']);

      expect(result.notes).toBeUndefined();
      expect(result.otherField).toBeNull();
    });

    it('should handle empty fields array', () => {
      const obj = {
        id: '123',
        notes: null,
      };

      const result = nullToUndefined(obj, []);

      expect(result.notes).toBeNull();
    });

    it('should create a new object and not mutate the original', () => {
      const obj = {
        id: '123',
        notes: null,
      };

      const result = nullToUndefined(obj, ['notes']);

      expect(result).not.toBe(obj);
      expect(obj.notes).toBeNull();
      expect(result.notes).toBeUndefined();
    });
  });

  describe('addOptionalArg', () => {
    it('appends flag and value when value is a string', () => {
      const args: string[] = [];
      addOptionalArg(args, '--title', 'Hello');
      expect(args).toEqual(['--title', 'Hello']);
    });

    it('appends an empty string as a literal value', () => {
      // Used by `updateEvent` to signal "clear structuredLocation" via `''`.
      const args: string[] = [];
      addOptionalArg(args, '--structuredLocation', '');
      expect(args).toEqual(['--structuredLocation', '']);
    });

    it('is a no-op when value is undefined', () => {
      const args: string[] = ['--action', 'create'];
      addOptionalArg(args, '--title', undefined);
      expect(args).toEqual(['--action', 'create']);
    });
  });

  describe('addOptionalBooleanArg', () => {
    it('serializes true and false as string values', () => {
      const args: string[] = [];
      addOptionalBooleanArg(args, '--isCompleted', true);
      addOptionalBooleanArg(args, '--clearAlarms', false);
      expect(args).toEqual(['--isCompleted', 'true', '--clearAlarms', 'false']);
    });

    it('is a no-op for undefined', () => {
      const args: string[] = [];
      addOptionalBooleanArg(args, '--isCompleted', undefined);
      expect(args).toEqual([]);
    });
  });

  describe('addOptionalNumberArg', () => {
    it('serializes a number as a string', () => {
      const args: string[] = [];
      addOptionalNumberArg(args, '--priority', 5);
      expect(args).toEqual(['--priority', '5']);
    });

    it('preserves zero', () => {
      const args: string[] = [];
      addOptionalNumberArg(args, '--priority', 0);
      expect(args).toEqual(['--priority', '0']);
    });

    it('is a no-op for undefined', () => {
      const args: string[] = [];
      addOptionalNumberArg(args, '--priority', undefined);
      expect(args).toEqual([]);
    });
  });

  describe('addOptionalJsonArg', () => {
    it('JSON-stringifies object payloads', () => {
      const args: string[] = [];
      addOptionalJsonArg(args, '--alarms', [{ relativeOffset: -60 }]);
      expect(args).toEqual([
        '--alarms',
        JSON.stringify([{ relativeOffset: -60 }]),
      ]);
    });

    it('is a no-op for undefined', () => {
      const args: string[] = [];
      addOptionalJsonArg(args, '--alarms', undefined);
      expect(args).toEqual([]);
    });

    it('serializes empty arrays/objects (the `if (value)` guard only skips undefined/null)', () => {
      // JS treats `[]` and `{}` as truthy, so the `if (value)` guard does not
      // suppress them; the CLI side is expected to interpret `[]` as "clear
      // all" if it ever receives it. Today, every caller goes through the
      // explicit `clearAlarms` / `clearRecurrence` booleans for that intent.
      const args: string[] = [];
      addOptionalJsonArg(args, '--alarms', [] as unknown as object);
      expect(args).toEqual(['--alarms', '[]']);
    });
  });

  describe('bufferToString', () => {
    it('returns strings unchanged', () => {
      expect(bufferToString('hello')).toBe('hello');
    });

    it('decodes a Buffer as utf-8', () => {
      expect(bufferToString(Buffer.from('héllo', 'utf8'))).toBe('héllo');
    });

    it('returns null for null/undefined input', () => {
      expect(bufferToString(null)).toBeNull();
      expect(bufferToString(undefined)).toBeNull();
    });
  });

  describe('formatMultilineNotes', () => {
    it('indents continuation lines for markdown alignment', () => {
      expect(formatMultilineNotes('line one\nline two')).toBe(
        'line one\n    line two',
      );
    });

    it('leaves single-line notes unchanged', () => {
      expect(formatMultilineNotes('single')).toBe('single');
    });
  });
});
