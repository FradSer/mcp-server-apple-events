import {
  addTagsToNotes,
  combineTagsAndNotes,
  extractTags,
  formatTags,
  hasAllTags,
  removeTagsFromNotes,
  stripTags,
} from './tagUtils.js';

describe('tagUtils', () => {
  describe('extractTags', () => {
    it('extracts tags in [#tag] bracket format', () => {
      expect(extractTags('[#work] [#urgent] Some notes')).toEqual([
        'work',
        'urgent',
      ]);
    });

    it('extracts bare #tag format (Apple Reminders native)', () => {
      expect(extractTags('#social #work Some notes')).toEqual([
        'social',
        'work',
      ]);
    });

    it('extracts bare #tag at start of line', () => {
      expect(extractTags('Some text\n#errands to do')).toEqual(['errands']);
    });

    it('does not extract pure numeric bare hashtags like #42', () => {
      expect(extractTags('See issue #42 for details')).toEqual([]);
    });

    it('does not extract hashtags mid-word like foo#bar', () => {
      expect(extractTags('foo#bar baz')).toEqual([]);
    });

    it('extracts mixed bracket and bare formats without duplicates', () => {
      expect(extractTags('[#work] #social #work Some notes')).toEqual([
        'work',
        'social',
      ]);
    });

    it('handles bare tags with underscores and hyphens', () => {
      expect(extractTags('#my-tag #my_tag notes')).toEqual([
        'my-tag',
        'my_tag',
      ]);
    });

    it('normalizes bare tags to lowercase', () => {
      expect(extractTags('#Social #WORK')).toEqual(['social', 'work']);
    });

    it('returns empty for null/undefined', () => {
      expect(extractTags(null)).toEqual([]);
      expect(extractTags(undefined)).toEqual([]);
    });

    it('returns empty for notes without tags', () => {
      expect(extractTags('Just plain notes')).toEqual([]);
    });

    it('extracts bare tag followed by punctuation', () => {
      expect(extractTags('#social, #work.')).toEqual(['social', 'work']);
    });

    it('does not extract bare hashtags starting with digit', () => {
      expect(extractTags('color: #123abc')).toEqual([]);
    });
  });

  describe('stripTags', () => {
    it('strips [#tag] bracket format', () => {
      expect(stripTags('[#work] [#urgent] Some notes')).toBe('Some notes');
    });

    it('strips bare #tag format', () => {
      expect(stripTags('#social #work Some notes')).toBe('Some notes');
    });

    it('strips mixed formats', () => {
      expect(stripTags('[#work] #social Some notes')).toBe('Some notes');
    });

    it('preserves non-tag hash references like #42', () => {
      expect(stripTags('See issue #42 for details')).toBe(
        'See issue #42 for details',
      );
    });

    it('preserves mid-word hashes', () => {
      expect(stripTags('C#programming')).toBe('C#programming');
    });
  });

  describe('combineTagsAndNotes', () => {
    it('deduplicates tags after normalization', () => {
      const result = combineTagsAndNotes(['Work', '#work'], 'Hello');
      expect(result).toBe('[#work]\nHello');
    });

    it('does not duplicate existing normalized tags', () => {
      const result = combineTagsAndNotes(['Work'], '[#work] Hello');
      expect(result).toBe('[#work]\nHello');
    });

    it('picks up bare tags from existing notes', () => {
      const result = combineTagsAndNotes(['urgent'], '#social My note');
      expect(result).toBe('[#urgent] [#social]\nMy note');
    });
  });

  describe('hasAllTags', () => {
    it('returns true when reminder has all filter tags', () => {
      expect(hasAllTags(['social', 'work'], ['social'])).toBe(true);
    });

    it('returns false when reminder lacks a filter tag', () => {
      expect(hasAllTags(['social'], ['social', 'work'])).toBe(false);
    });

    it('returns true for empty filter tags', () => {
      expect(hasAllTags(['social'], [])).toBe(true);
    });

    it('returns false when reminder has no tags', () => {
      expect(hasAllTags(undefined, ['social'])).toBe(false);
    });
  });

  describe('formatTags', () => {
    it('formats tags in [#tag] bracket format', () => {
      expect(formatTags(['work', 'social'])).toBe('[#work] [#social]');
    });

    it('returns empty string for empty array', () => {
      expect(formatTags([])).toBe('');
    });
  });

  describe('addTagsToNotes', () => {
    it('adds tags to notes with bare existing tags', () => {
      const result = addTagsToNotes(['urgent'], '#social My note');
      expect(result).toBe('[#social] [#urgent]\nMy note');
    });
  });

  describe('removeTagsFromNotes', () => {
    it('removes tags from notes with bare existing tags', () => {
      const result = removeTagsFromNotes(['social'], '#social #work My note');
      expect(result).toBe('[#work]\nMy note');
    });
  });
});
