/**
 * helpers.test.ts
 * Tests for helper utility functions
 */

import {
  addArg,
  addOptionalArg,
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

  describe('addArg', () => {
    it('attaches the value to the flag', () => {
      const args: string[] = [];
      addArg(args, '--title', 'Hello');
      expect(args).toEqual(['--title=Hello']);
    });

    it('attaches a value that starts with a dash', () => {
      // Regression for issue #144: `--title "- buy milk"` fails with
      // "Missing value for '--title'" because ArgumentParser reads the value
      // as the next option.
      const args: string[] = [];
      addArg(args, '--title', '- buy milk');
      expect(args).toEqual(['--title=- buy milk']);
    });

    it('keeps the separated form for an empty value', () => {
      // `--title=` is a missing value to ArgumentParser; `--title ""`
      // delivers an empty string.
      const args: string[] = [];
      addArg(args, '--notes', '');
      expect(args).toEqual(['--notes', '']);
    });
  });

  describe('addOptionalArg', () => {
    it('attaches the value to the flag', () => {
      const args: string[] = [];
      addOptionalArg(args, '--title', 'Hello');
      expect(args).toEqual(['--title=Hello']);
    });

    it('attaches a value that names another option', () => {
      const args: string[] = [];
      addOptionalArg(args, '--title', '--completed');
      expect(args).toEqual(['--title=--completed']);
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

  describe('addOptionalNumberArg', () => {
    it('serializes a number as a string', () => {
      const args: string[] = [];
      addOptionalNumberArg(args, '--priority', 5);
      expect(args).toEqual(['--priority=5']);
    });

    it('preserves zero', () => {
      const args: string[] = [];
      addOptionalNumberArg(args, '--priority', 0);
      expect(args).toEqual(['--priority=0']);
    });

    it('is a no-op for undefined', () => {
      const args: string[] = [];
      addOptionalNumberArg(args, '--priority', undefined);
      expect(args).toEqual([]);
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
