import { readFileSync } from 'node:fs';
import path from 'node:path';

const entitlementsPath = path.resolve(
  process.cwd(),
  'src/swift/EventKitCLI.entitlements',
);

describe('EventKitCLI.entitlements permission declarations', () => {
  const entitlementsContents = readFileSync(entitlementsPath, 'utf8');

  const requiredKeys = [
    'com.apple.security.personal-information.calendars',
    'com.apple.security.personal-information.reminders',
  ];

  it.each(requiredKeys)('defines %s as true', (key) => {
    const pattern = new RegExp(
      `<key>${key.replace(/\./g, '\\.')}</key>\\s*<true/>`,
      'i',
    );
    expect(entitlementsContents).toMatch(pattern);
  });
});
