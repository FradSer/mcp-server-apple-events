import { toEventDateISO } from './eventDateTime.js';

describe('toEventDateISO', () => {
  it('resolves wall-clock time in the event zone across daylight saving time', () => {
    expect(toEventDateISO('2026-09-10 08:40:00', 'America/New_York')).toBe(
      '2026-09-10T12:40:00.000Z',
    );
  });

  it('converts an explicit offset to the equivalent UTC timestamp', () => {
    expect(toEventDateISO('2026-09-10T08:40:00-04:00', undefined)).toBe(
      '2026-09-10T12:40:00.000Z',
    );
  });

  it('returns no timestamp when the wall time is repeated or skipped', () => {
    expect(
      toEventDateISO('2026-11-01 01:30:00', 'America/New_York'),
    ).toBeUndefined();
    expect(
      toEventDateISO('2026-03-08 02:30:00', 'America/New_York'),
    ).toBeUndefined();
  });

  it('returns no timestamp when the time zone or date is not resolvable', () => {
    expect(toEventDateISO('2026-09-10 08:40:00', undefined)).toBeUndefined();
    expect(
      toEventDateISO('2026-09-10 08:40:00', 'not/a-time-zone'),
    ).toBeUndefined();
    expect(toEventDateISO('2026-02-30 08:40:00', 'GMT')).toBeUndefined();
    expect(toEventDateISO('2026-09-10', 'GMT')).toBeUndefined();
  });
});
