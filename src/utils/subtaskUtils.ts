/**
 * subtaskUtils.ts
 * Utilities for handling subtasks stored in reminder notes
 *
 * Subtasks are stored in the notes field with a human-readable format:
 * ---SUBTASKS---
 * [ ] {id} Task title
 * [x] {id} Completed task title
 * ---END SUBTASKS---
 *
 * This format:
 * - Is human-readable in the native Reminders app
 * - Allows programmatic parsing and manipulation
 * - Coexists with tags ([#tag] format) and user notes
 */

import { webcrypto } from 'node:crypto';
import type { Subtask, SubtaskProgress } from '../types/index.js';

// Subtask section markers
const SUBTASK_START = '---SUBTASKS---';
const SUBTASK_END = '---END SUBTASKS---';

// Regex to match the subtask section. Both markers are anchored to line
// boundaries so that user-supplied content that happens to contain the marker
// text mid-line cannot forge or truncate the structured section. `\r?\n`
// keeps the matcher tolerant of CRLF line endings that some tools (or a
// round-trip through AppleScript) can introduce.
const SUBTASK_SECTION_REGEX =
  /(?:^|\r?\n)---SUBTASKS---\r?\n([\s\S]*?)\r?\n---END SUBTASKS---(?=\r?\n|$)/;

// Regex to match individual subtask lines: [ ] {id} title or [x] {id} title.
// `\s*` at the end absorbs a trailing `\r` left behind when a CRLF-terminated
// block is split on `\n`.
const SUBTASK_LINE_REGEX = /^\[([ x])\]\s*\{([a-f0-9]+)\}\s*(.+?)\s*$/;

/**
 * Generates a short unique ID (8 hex characters)
 */
export function generateSubtaskId(): string {
  const bytes = new Uint8Array(4);
  webcrypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Parses subtasks from notes content
 * @param notes - The notes string that may contain subtasks
 * @returns Array of subtasks in order
 */
export function parseSubtasks(notes: string | null | undefined): Subtask[] {
  if (!notes) return [];

  const match = notes.match(SUBTASK_SECTION_REGEX);
  if (!match) return [];

  const subtaskContent = match[1];
  // Split on either `\n` or `\r\n` so CRLF-terminated input round-trips.
  const lines = subtaskContent.split(/\r?\n/).filter((line) => line.trim());
  const subtasks: Subtask[] = [];

  for (const line of lines) {
    const lineMatch = line.match(SUBTASK_LINE_REGEX);
    if (lineMatch) {
      subtasks.push({
        id: lineMatch[2],
        title: lineMatch[3].trim(),
        isCompleted: lineMatch[1] === 'x',
      });
    }
  }

  return subtasks;
}

/**
 * Serializes subtasks into the notes format
 * @param subtasks - Array of subtasks to serialize
 * @returns Formatted subtask section string (empty string if no subtasks)
 */
export function serializeSubtasks(subtasks: Subtask[]): string {
  if (!subtasks || subtasks.length === 0) return '';

  const lines = subtasks.map((subtask) => {
    const checkbox = subtask.isCompleted ? '[x]' : '[ ]';
    return `${checkbox} {${subtask.id}} ${subtask.title}`;
  });

  return `${SUBTASK_START}\n${lines.join('\n')}\n${SUBTASK_END}`;
}

/**
 * Removes the subtask section from notes, returning clean content
 * @param notes - The notes string with potential subtasks
 * @returns Notes content without subtask section
 */
export function stripSubtasks(notes: string | null | undefined): string {
  if (!notes) return '';

  return notes
    .replace(SUBTASK_SECTION_REGEX, '')
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();
}

/**
 * Combines subtasks with notes content
 * Tags are preserved and subtasks are appended at the end
 * @param subtasks - Array of subtasks
 * @param notes - Existing notes content (may have tags and/or existing subtasks)
 * @returns Combined notes with subtasks appended
 */
export function combineSubtasksAndNotes(
  subtasks: Subtask[],
  notes: string | undefined,
): string {
  // Remove existing subtasks section from notes
  const cleanNotes = stripSubtasks(notes);
  const subtaskSection = serializeSubtasks(subtasks);

  if (cleanNotes && subtaskSection) {
    return `${cleanNotes}\n\n${subtaskSection}`;
  } else if (subtaskSection) {
    return subtaskSection;
  } else {
    return cleanNotes;
  }
}

/**
 * Adds a subtask to existing notes
 * @param title - Title of the new subtask
 * @param notes - Existing notes content
 * @returns Updated notes with new subtask added
 */
export function addSubtask(
  title: string,
  notes: string | undefined,
): { notes: string; subtask: Subtask } {
  const existingSubtasks = parseSubtasks(notes);

  const newSubtask: Subtask = {
    id: generateSubtaskId(),
    title: title.trim(),
    isCompleted: false,
  };

  existingSubtasks.push(newSubtask);

  return {
    notes: combineSubtasksAndNotes(existingSubtasks, notes),
    subtask: newSubtask,
  };
}

/**
 * Updates a subtask in existing notes
 * @param subtaskId - ID of the subtask to update
 * @param updates - Partial subtask updates
 * @param notes - Existing notes content
 * @returns Updated notes with subtask modified
 */
export function updateSubtask(
  subtaskId: string,
  updates: { title?: string; isCompleted?: boolean },
  notes: string | undefined,
): string {
  const subtasks = parseSubtasks(notes);
  const index = subtasks.findIndex((s) => s.id === subtaskId);

  if (index === -1) {
    throw new Error(`Subtask with ID '${subtaskId}' not found.`);
  }

  if (updates.title !== undefined) {
    subtasks[index].title = updates.title.trim();
  }
  if (updates.isCompleted !== undefined) {
    subtasks[index].isCompleted = updates.isCompleted;
  }

  return combineSubtasksAndNotes(subtasks, notes);
}

/**
 * Removes a subtask from existing notes
 * @param subtaskId - ID of the subtask to remove
 * @param notes - Existing notes content
 * @returns Updated notes with subtask removed
 */
export function removeSubtask(
  subtaskId: string,
  notes: string | undefined,
): string {
  const subtasks = parseSubtasks(notes);
  const index = subtasks.findIndex((s) => s.id === subtaskId);

  if (index === -1) {
    throw new Error(`Subtask with ID '${subtaskId}' not found.`);
  }

  subtasks.splice(index, 1);
  return combineSubtasksAndNotes(subtasks, notes);
}

/**
 * Toggles a subtask's completion status
 * @param subtaskId - ID of the subtask to toggle
 * @param notes - Existing notes content
 * @returns Updated notes with subtask toggled
 */
export function toggleSubtask(
  subtaskId: string,
  notes: string | undefined,
): { notes: string; subtask: Subtask } {
  const subtasks = parseSubtasks(notes);
  const index = subtasks.findIndex((s) => s.id === subtaskId);

  if (index === -1) {
    throw new Error(`Subtask with ID '${subtaskId}' not found.`);
  }

  subtasks[index].isCompleted = !subtasks[index].isCompleted;

  return {
    notes: combineSubtasksAndNotes(subtasks, notes),
    subtask: subtasks[index],
  };
}

/**
 * Reorders subtasks based on provided ID order
 * @param order - Array of subtask IDs in desired order
 * @param notes - Existing notes content
 * @returns Updated notes with subtasks reordered
 */
export function reorderSubtasks(
  order: string[],
  notes: string | undefined,
): string {
  const subtasks = parseSubtasks(notes);

  // Create a map for quick lookup
  const subtaskMap = new Map(subtasks.map((s) => [s.id, s]));

  // Validate all IDs exist
  for (const id of order) {
    if (!subtaskMap.has(id)) {
      throw new Error(`Subtask with ID '${id}' not found.`);
    }
  }

  // Check for missing IDs (IDs in subtasks but not in order)
  const orderSet = new Set(order);
  for (const subtask of subtasks) {
    if (!orderSet.has(subtask.id)) {
      throw new Error(
        `Reorder array is missing subtask ID '${subtask.id}'. All subtask IDs must be included.`,
      );
    }
  }

  // Reorder
  const reorderedSubtasks = order.map((id) => {
    const subtask = subtaskMap.get(id);
    if (!subtask) {
      throw new Error(`Subtask with ID '${id}' not found.`);
    }
    return subtask;
  });

  return combineSubtasksAndNotes(reorderedSubtasks, notes);
}

/**
 * Creates subtasks from an array of titles
 * @param titles - Array of subtask titles
 * @returns Array of new subtasks
 */
export function createSubtasksFromTitles(titles: string[]): Subtask[] {
  return titles.map((title) => ({
    id: generateSubtaskId(),
    title: title.trim(),
    isCompleted: false,
  }));
}

/**
 * Calculates subtask completion progress
 * @param subtasks - Array of subtasks
 * @returns Progress object with completed count, total, and percentage
 */
export function getSubtaskProgress(subtasks: Subtask[]): SubtaskProgress {
  if (!subtasks || subtasks.length === 0) {
    return { completed: 0, total: 0, percentage: 100 };
  }

  const completed = subtasks.filter((s) => s.isCompleted).length;
  const total = subtasks.length;
  const percentage = Math.round((completed / total) * 100);

  return { completed, total, percentage };
}
