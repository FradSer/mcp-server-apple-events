/**
 * appleScriptAttendees.integration.test.ts
 *
 * Drives the real Calendar.app. Gated on APPLESCRIPT_E2E=1 because it requires
 * a GUI session and a TCC Automation grant, and because adding an attendee to a
 * real event causes iCloud to send a real invitation. The repo's existing
 * src/e2e.test.ts is ungated and hits real EventKit on every `pnpm test`; that
 * precedent is deliberately not extended to anything that sends mail.
 *
 * Expects two events titled ZZ-AS-INTEG-DELETE-ME on 2026-10-03 in "Calendar".
 */

import {
  AmbiguousEventError,
  addAttendeesToEvent,
  EventNotFoundError,
} from './appleScriptAttendees.js';

const live = process.env.APPLESCRIPT_E2E === '1' ? describe : describe.skip;

live('live Calendar.app', () => {
  const base = {
    calendarName: 'Calendar',
    date: '2026-10-03',
    attendees: [{ email: 'sam.gobrail@upstage.ai', name: 'Sam Gobrail' }],
  };

  it('refuses to guess when two events share a title and date', async () => {
    await expect(
      addAttendeesToEvent({ ...base, summary: 'ZZ-AS-INTEG-DELETE-ME' }),
    ).rejects.toBeInstanceOf(AmbiguousEventError);
  }, 30000);

  it('reports not-found for a title that does not exist', async () => {
    await expect(
      addAttendeesToEvent({ ...base, summary: 'ZZ-NO-SUCH-EVENT-XYZ' }),
    ).rejects.toBeInstanceOf(EventNotFoundError);
  }, 30000);
});
