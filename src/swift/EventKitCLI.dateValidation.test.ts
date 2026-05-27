import { readFileSync } from 'node:fs';
import path from 'node:path';

const swiftPath = path.resolve(process.cwd(), 'src/swift/EventKitCLI.swift');
const swiftSource = readFileSync(swiftPath, 'utf8');

describe('EventKitCLI date validation safeguards', () => {
  it('rejects malformed read-events date bounds before EventKit receives nil bounds', () => {
    expect(swiftSource).toContain('Invalid startDate format.');
    expect(swiftSource).toContain('Invalid endDate format.');
    expect(swiftSource).toMatch(
      /let startDate = startDateStr != nil \? manager\.parseDate\(from: startDateStr!\) : nil[\s\S]*?Invalid startDate format\./,
    );
    expect(swiftSource).toMatch(
      /let endDate = endDateStr != nil \? manager\.parseDate\(from: endDateStr!\) : nil[\s\S]*?Invalid endDate format\./,
    );
  });
});
