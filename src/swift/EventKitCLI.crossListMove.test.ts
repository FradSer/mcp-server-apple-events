import { readFileSync } from 'node:fs';
import path from 'node:path';

const swiftPath = path.resolve(process.cwd(), 'src/swift/EventKitCLI.swift');
const swiftSource = readFileSync(swiftPath, 'utf8');

describe('EventKitCLI cross-list move fallback', () => {
  it('exposes a moveReminderAcrossLists helper', () => {
    expect(swiftSource).toMatch(
      /private func moveReminderAcrossLists\(_ reminder: EKReminder, toListNamed targetListName: String\) throws -> ReminderJSON/,
    );
  });

  it('tries EventKit reassignment before falling back', () => {
    expect(swiftSource).toMatch(
      /reminder\.calendar = targetList\s+do \{\s+try eventStore\.save\(reminder, commit: true\)/,
    );
  });

  it('falls back to AppleScript move on save error', () => {
    expect(swiftSource).toMatch(
      /try runAppleScriptMove\(reminderUUID: originalUUID, toListNamed: targetListName\)/,
    );
  });

  it('invokes osascript via Process for the AppleScript fallback', () => {
    expect(swiftSource).toMatch(
      /process\.launchPath = "\/usr\/bin\/osascript"/,
    );
    expect(swiftSource).toMatch(/move src to list/);
  });

  it('escapes backslashes and quotes in the target list name', () => {
    expect(swiftSource).toMatch(
      /replacingOccurrences\(of: "\\\\", with: "\\\\\\\\"\)\.replacingOccurrences\(of: "\\"", with: "\\\\\\""\)/,
    );
  });

  it('re-fetches the moved reminder by title and creationDate', () => {
    expect(swiftSource).toMatch(
      /private func findReminderInList\(_ list: EKCalendar, matchingTitle title: String, creationDate: Date\?\) -> EKReminder\?/,
    );
  });

  it('validates target list exists upfront to preserve update atomicity', () => {
    expect(swiftSource).toMatch(
      /\/\/ Validate target list exists upfront so a bad list name doesn't cause a[\s\S]*?if let targetListName = listName, targetListName != reminder\.calendar\.title \{\s+_ = try findList\(named: targetListName\)/,
    );
  });

  it('triggers the move path only when target list differs from current', () => {
    expect(swiftSource).toMatch(
      /if let targetListName = listName, targetListName != reminder\.calendar\.title \{\s+return try moveReminderAcrossLists\(reminder, toListNamed: targetListName\)/,
    );
  });
});
