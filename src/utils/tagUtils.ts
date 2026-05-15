/**
 * tagUtils.ts
 * Utilities for handling tags stored in reminder notes.
 *
 * Supports two tag formats:
 * - Bracket format: [#tagname]  (written by this MCP server)
 * - Bare format:    #tagname    (used by Apple Reminders native UI)
 *
 * Writing always uses bracket format for unambiguous round-tripping.
 * Reading parses both formats so native Apple Reminders tags are recognized.
 */

// Regex to match tags in [#tag] bracket format
const BRACKET_TAG_REGEX = /\[#([^\]]+)\]/g;

// Regex to match bare #tag format (Apple Reminders native).
// Must be preceded by start-of-string or whitespace.
// Uses negative lookahead to exclude purely numeric tags (e.g. #42)
// while allowing digit-starting mixed tags (e.g. #1st, #2024q1).
const BARE_TAG_REGEX = /(?:^|(?<=\s))#(?![0-9]+\b)([a-zA-Z0-9_-]+)/gm;

/**
 * Normalizes a tag by removing # prefix, trimming, and lowercasing
 * @param tag - Tag string to normalize
 * @returns Normalized tag string
 */
function normalizeTag(tag: string): string {
  return tag.replace(/^#/, '').trim().toLowerCase();
}

/**
 * Normalizes an array of tags
 * @param tags - Array of tags to normalize
 * @returns Array of normalized tags
 */
function normalizeTags(tags: string[]): string[] {
  return tags.map(normalizeTag);
}

/**
 * Extracts tags from notes content, supporting both [#tag] and bare #tag formats
 * @param notes - The notes string that may contain tags
 * @returns Array of tag names (without # prefix), deduplicated and lowercased
 */
export function extractTags(notes: string | null | undefined): string[] {
  if (!notes) return [];

  const tags = new Set<string>();

  // Extract bracket-format tags: [#tagname] — group 1 is mandatory.
  for (const match of notes.matchAll(BRACKET_TAG_REGEX)) {
    const tag = match[1]?.trim().toLowerCase();
    if (tag) tags.add(tag);
  }

  // Extract bare-format tags: #tagname (Apple Reminders native) — group 1 is mandatory.
  for (const match of notes.matchAll(BARE_TAG_REGEX)) {
    const tag = match[1]?.trim().toLowerCase();
    if (tag) tags.add(tag);
  }

  return Array.from(tags);
}

/**
 * Removes tag markers from notes, returning clean content.
 * Strips both [#tag] bracket format and bare #tag format.
 * @param notes - The notes string with potential tags
 * @returns Notes content without tag markers
 */
export function stripTags(notes: string | null | undefined): string {
  if (!notes) return '';

  return notes
    .replace(BRACKET_TAG_REGEX, '')
    .replace(BARE_TAG_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ') // Collapse multiple spaces
    .replace(/^\s+/, '') // Trim leading whitespace
    .replace(/\s+$/, '') // Trim trailing whitespace
    .replace(/\n{3,}/g, '\n\n'); // Collapse multiple newlines
}

/**
 * Formats tags into the [#tag] format for storage
 * @param tags - Array of tag names (with or without # prefix)
 * @returns Formatted tag string
 */
export function formatTags(tags: string[]): string {
  if (!tags || tags.length === 0) return '';

  return tags
    .map((tag) => {
      const cleanTag = normalizeTag(tag);
      return cleanTag ? `[#${cleanTag}]` : '';
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Combines tags with notes content
 * @param tags - Array of tag names
 * @param notes - Notes content (may already have tags)
 * @returns Combined notes with tags prepended
 */
export function combineTagsAndNotes(
  tags: string[] | undefined,
  notes: string | undefined,
): string {
  const existingTags = extractTags(notes);
  const cleanNotes = stripTags(notes);

  const mergedTags = tags ? [...tags, ...existingTags] : existingTags;
  const allTags = [...new Set(normalizeTags(mergedTags))];

  const formattedTags = formatTags(allTags);

  if (formattedTags && cleanNotes) {
    return `${formattedTags}\n${cleanNotes}`;
  } else if (formattedTags) {
    return formattedTags;
  } else {
    return cleanNotes;
  }
}

/**
 * Adds tags to existing notes
 * @param tagsToAdd - Tags to add
 * @param notes - Existing notes content
 * @returns Updated notes with added tags
 */
export function addTagsToNotes(
  tagsToAdd: string[],
  notes: string | undefined,
): string {
  const existingTags = extractTags(notes);
  const cleanNotes = stripTags(notes);

  const normalizedNewTags = normalizeTags(tagsToAdd);
  const allTags = [...new Set([...existingTags, ...normalizedNewTags])];

  const formattedTags = formatTags(allTags);

  if (formattedTags && cleanNotes) {
    return `${formattedTags}\n${cleanNotes}`;
  } else if (formattedTags) {
    return formattedTags;
  } else {
    return cleanNotes;
  }
}

/**
 * Removes tags from existing notes
 * @param tagsToRemove - Tags to remove
 * @param notes - Existing notes content
 * @returns Updated notes with specified tags removed
 */
export function removeTagsFromNotes(
  tagsToRemove: string[],
  notes: string | undefined,
): string {
  const existingTags = extractTags(notes);
  const cleanNotes = stripTags(notes);

  const normalizedRemove = normalizeTags(tagsToRemove);

  const remainingTags = existingTags.filter(
    (tag) => !normalizedRemove.includes(tag),
  );

  const formattedTags = formatTags(remainingTags);

  if (formattedTags && cleanNotes) {
    return `${formattedTags}\n${cleanNotes}`;
  } else if (formattedTags) {
    return formattedTags;
  } else {
    return cleanNotes;
  }
}

/**
 * Checks if a reminder has all specified tags
 * @param reminderTags - Tags the reminder has
 * @param filterTags - Tags to check for
 * @returns true if reminder has ALL filter tags
 */
export function hasAllTags(
  reminderTags: string[] | undefined,
  filterTags: string[],
): boolean {
  if (!filterTags || filterTags.length === 0) return true;
  if (!reminderTags || reminderTags.length === 0) return false;

  const normalizedReminderTags = normalizeTags(reminderTags);
  const normalizedFilterTags = normalizeTags(filterTags);

  return normalizedFilterTags.every((tag) =>
    normalizedReminderTags.includes(tag),
  );
}
