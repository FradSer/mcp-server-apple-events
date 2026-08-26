/**
 * calendarRepositoryAttendees.test.ts
 *
 * Attendee writes take a different route than every other field — Calendar.app
 * scripting rather than the `event` CLI — so the contract worth pinning is the
 * translation: an id-addressed request becomes a title-and-date lookup.
 */

import { addAttendeesToEvent } from './appleScriptAttendees.js';
import { calendarRepository } from './calendarRepository.js';
import { executeEventCliJson } from './eventCli.js';

jest.mock('./eventCli.js');
jest.mock('./appleScriptAttendees.js');

const mockCli = executeEventCliJson as jest.MockedFunction<
  typeof executeEventCliJson
>;
const mockApple = addAttendeesToEvent as jest.MockedFunction<
  typeof addAttendeesToEvent
>;

const EVENT = {
  id: 'CAL:EVT',
  title: 'MKTG 300 — Class 1',
  startDate: '2026-08-31T12:55:00-04:00',
  endDate: '2026-08-31T14:10:00-04:00',
  calendar: 'Work / Projects',
  isAllDay: false,
};

beforeEach(() => {
  mockCli.mockReset();
  mockApple.mockReset();
});

describe('calendarRepository.addAttendees', () => {
  it('resolves the event by id, then addresses Calendar.app by title and date', async () => {
    mockCli.mockResolvedValue([EVENT] as never);
    mockApple.mockResolvedValue({ updated: 1 });

    await calendarRepository.addAttendees('CAL:EVT', ['a@b.com']);

    expect(mockApple).toHaveBeenCalledWith({
      calendarName: 'Work / Projects',
      summary: 'MKTG 300 — Class 1',
      date: '2026-08-31',
      attendees: [{ email: 'a@b.com' }],
    });
  });

  it('passes the date as a bare day, not the full timestamp', async () => {
    mockCli.mockResolvedValue([EVENT] as never);
    mockApple.mockResolvedValue({ updated: 1 });
    await calendarRepository.addAttendees('CAL:EVT', ['a@b.com']);
    expect(mockApple.mock.calls[0]?.[0].date).toBe('2026-08-31');
  });

  it('forwards every address', async () => {
    mockCli.mockResolvedValue([EVENT] as never);
    mockApple.mockResolvedValue({ updated: 1 });
    await calendarRepository.addAttendees('CAL:EVT', ['a@b.com', 'c@d.com']);
    expect(mockApple.mock.calls[0]?.[0].attendees).toEqual([
      { email: 'a@b.com' },
      { email: 'c@d.com' },
    ]);
  });

  it('returns the resolved event alongside the count', async () => {
    mockCli.mockResolvedValue([EVENT] as never);
    mockApple.mockResolvedValue({ updated: 1 });
    const result = await calendarRepository.addAttendees('CAL:EVT', [
      'a@b.com',
    ]);
    expect(result.event.title).toBe('MKTG 300 — Class 1');
    expect(result.updated).toBe(1);
  });

  it('never issues a CLI write for an attendee-only change', async () => {
    mockCli.mockResolvedValue([EVENT] as never);
    mockApple.mockResolvedValue({ updated: 1 });
    await calendarRepository.addAttendees('CAL:EVT', ['a@b.com']);
    const writes = mockCli.mock.calls.filter(
      (call) => (call[0] as string[])[1] === 'update',
    );
    expect(writes).toHaveLength(0);
  });

  it('propagates a not-found event rather than inventing a target', async () => {
    mockCli.mockResolvedValue([] as never);
    await expect(
      calendarRepository.addAttendees('CAL:MISSING', ['a@b.com']),
    ).rejects.toThrow(/not found/i);
    expect(mockApple).not.toHaveBeenCalled();
  });
});

/**
 * Regression from PR review: span and occurrenceDate are contradictory, and
 * routing on occurrenceDate silently dropped span.
 */
describe('handleDeleteCalendarEvent — span vs occurrenceDate', () => {
  it('refuses a call carrying both rather than ignoring span', async () => {
    const { handleDeleteCalendarEvent } = await import(
      '../tools/handlers/calendarHandlers.js'
    );
    const result = await handleDeleteCalendarEvent({
      action: 'delete',
      id: 'CAL:EVT',
      span: 'future-events',
      occurrenceDate: '2026-09-21T09:00:00',
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(
      /either span or occurrenceDate/i,
    );
  });
});
