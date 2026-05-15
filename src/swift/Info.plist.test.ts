import { readFileSync } from 'node:fs';
import path from 'node:path';

const plistPath = path.resolve(process.cwd(), 'src/swift/Info.plist');

describe('Info.plist privacy declarations', () => {
  const plistContents = readFileSync(plistPath, 'utf8');

  const requiredKeys = [
    'NSRemindersUsageDescription',
    'NSRemindersFullAccessUsageDescription',
    'NSRemindersWriteOnlyAccessUsageDescription',
    'NSCalendarsUsageDescription',
    'NSCalendarsFullAccessUsageDescription',
    'NSCalendarsWriteOnlyAccessUsageDescription',
  ];

  it.each(requiredKeys)('defines %s with non-empty string', (key) => {
    const pattern = new RegExp(
      `<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`,
      'i',
    );
    const match = plistContents.match(pattern);
    expect(match).not.toBeNull();
    expect(match?.[1]?.trim().length).toBeGreaterThan(0);
  });
});
