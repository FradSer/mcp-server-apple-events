import { readFileSync } from 'node:fs';
import path from 'node:path';

const swiftPath = path.resolve(process.cwd(), 'src/swift/EventKitCLI.swift');
const swiftSource = readFileSync(swiftPath, 'utf8');

describe('EventKitCLI cross-list move fallback', () => {
  it('exposes a moveReminderAcrossLists helper that returns the moved EKReminder', () => {
    expect(swiftSource).toMatch(
      /private func moveReminderAcrossLists\(_ reminder: EKReminder, toListNamed targetListName: String\) throws -> EKReminder/,
    );
  });

  it('tries EventKit reassignment before falling back', () => {
    expect(swiftSource).toMatch(
      /reminder\.calendar = targetList\s+do \{\s+try eventStore\.save\(reminder, commit: true\)\s+return reminder/,
    );
  });

  it('falls back to AppleScript move on save error', () => {
    expect(swiftSource).toMatch(
      /try runAppleScriptMove\(reminderUUID: originalUUID, toListNamed: targetList\.title\)/,
    );
  });

  it('invokes osascript via Process using executableURL (non-deprecated API)', () => {
    expect(swiftSource).toMatch(
      /process\.executableURL = URL\(fileURLWithPath: "\/usr\/bin\/osascript"\)/,
    );
    expect(swiftSource).toMatch(/move src to list/);
  });

  it('discards AppleScript stdout via FileHandle.nullDevice to avoid pipe-buffer deadlock', () => {
    expect(swiftSource).toMatch(
      /process\.standardOutput = FileHandle\.nullDevice/,
    );
  });

  it('escapes backslashes and quotes in both the list name and the UUID', () => {
    // A shared `escape` closure replaces `\` → `\\` and `"` → `\"` for any
    // string interpolated into the AppleScript body. We assert the closure's
    // shape plus the fact that it is applied to both interpolated values.
    expect(swiftSource).toMatch(
      /\.replacingOccurrences\(of: "\\\\", with: "\\\\\\\\"\)[\s\S]*?\.replacingOccurrences\(of: "\\"", with: "\\\\\\""\)/,
    );
    expect(swiftSource).toMatch(/let escapedList = escape\(targetListName\)/);
    expect(swiftSource).toMatch(/let escapedUUID = escape\(reminderUUID\)/);
  });

  it('re-fetches the moved reminder by title and creationDate', () => {
    expect(swiftSource).toMatch(
      /private func findReminderInList\(_ list: EKCalendar, matchingTitle title: String, creationDate: Date\?\) -> EKReminder\?/,
    );
  });

  it('performs the move before any field mutations to keep the update atomic', () => {
    // The move must resolve before any `reminder.title =`, `reminder.notes =`, etc.
    const moveIndex = swiftSource.indexOf(
      'let reminder = needsMove ? try moveReminderAcrossLists',
    );
    const firstFieldMutationIndex = swiftSource.indexOf(
      'if let newTitle = newTitle { reminder.title = newTitle }',
    );
    expect(moveIndex).toBeGreaterThan(-1);
    expect(firstFieldMutationIndex).toBeGreaterThan(moveIndex);
  });

  it('treats empty or whitespace-only targetList as a no-op instead of routing through the default list', () => {
    expect(swiftSource).toMatch(
      /let trimmedListName = listName\?\.trimmingCharacters\(in: \.whitespacesAndNewlines\)\s+let needsMove = trimmedListName\.map \{ !\$0\.isEmpty && \$0 != original\.calendar\.title \} \?\? false/,
    );
  });

  it('prefers the original UUID when re-fetching the moved reminder, then falls back to title + creationDate', () => {
    const uuidLookupIndex = swiftSource.indexOf(
      'if let moved = findReminder(withId: originalUUID), moved.calendar.title == targetList.title',
    );
    const titleDateLookupIndex = swiftSource.indexOf(
      'if let moved = findReminderInList(targetList, matchingTitle: originalTitle, creationDate: originalCreationDate)',
    );
    expect(uuidLookupIndex).toBeGreaterThan(-1);
    expect(titleDateLookupIndex).toBeGreaterThan(uuidLookupIndex);
  });

  it('surfaces an actionable error when macOS Automation (TCC) blocks the osascript move', () => {
    // Primary signal is the typed process exit code; stderr match is a locale-safe fallback.
    expect(swiftSource).toMatch(/process\.terminationStatus == -1743/);
    expect(swiftSource).toMatch(/Privacy & Security/);
    expect(swiftSource).toMatch(/Automation/);
    expect(swiftSource).toMatch(/Reminders/);
  });

  it('flags a partial-failure when the field-update save fails after a successful cross-list move', () => {
    expect(swiftSource).toMatch(
      /Cross-list move to '\\\(trimmedListName!\)' succeeded but applying field updates failed/,
    );
  });
});
