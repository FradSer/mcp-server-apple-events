import { request } from './caldavClient.js';
import {
  exceptOccurrenceViaCalDav,
  findCollectionHref,
  toICalStamp,
} from './caldavOccurrence.js';

jest.mock('./caldavClient.js');
const mockRequest = request as jest.MockedFunction<typeof request>;

const CREDS = { appleId: 'a@b.com', password: 'secret' };

const multistatus = (rows: Array<{ href: string; name?: string }>) =>
  `<d:multistatus xmlns:d="DAV:">${rows
    .map(
      (r) =>
        `<d:response><d:href>${r.href}</d:href>` +
        (r.name ? `<d:displayname>${r.name}</d:displayname>` : '') +
        '</d:response>',
    )
    .join('')}</d:multistatus>`;

// Real iCloud responses open each <response> with the resource's OWN href
// before the property-scoped one. A fixture with a single href per response
// cannot catch an extractor that grabs the first href it sees.
const principalReply =
  '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/</d:href>' +
  '<d:propstat><d:prop><d:current-user-principal>' +
  '<d:href>/123/principal/</d:href>' +
  '</d:current-user-principal></d:prop></d:propstat></d:response></d:multistatus>';

const homeReply =
  '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
  '<d:response><d:href>/123/principal/</d:href><d:propstat><d:prop>' +
  '<c:calendar-home-set>' +
  '<d:href>https://p1-caldav.icloud.com/123/calendars/</d:href>' +
  '</c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>';

const reply = (body: string, headers: Record<string, string> = {}) => ({
  status: 207,
  headers: new Headers(headers),
  body,
});

beforeEach(() => mockRequest.mockReset());

describe('toICalStamp', () => {
  // The occurrence of a TZID-qualified series is identified by local wall
  // clock. Converting through UTC yields a stamp that matches no instance, and
  // the EXDATE then excepts nothing while appearing to succeed.
  it('keeps the wall clock rather than converting an offset to UTC', () => {
    expect(toICalStamp('2026-09-21T09:00:00-07:00')).toBe('20260921T090000');
  });

  it('handles a bare local timestamp', () => {
    expect(toICalStamp('2026-09-21T09:00:00')).toBe('20260921T090000');
  });

  it('handles a UTC timestamp without shifting it', () => {
    expect(toICalStamp('2026-09-21T16:00:00Z')).toBe('20260921T160000');
  });

  it('accepts a space separator', () => {
    expect(toICalStamp('2026-09-21 09:00')).toBe('20260921T090000');
  });

  it('defaults missing seconds to zero', () => {
    expect(toICalStamp('2026-09-21T09:05')).toBe('20260921T090500');
  });

  it('rejects a value it cannot read', () => {
    expect(() => toICalStamp('next tuesday')).toThrow(/occurrence start/i);
  });
});

describe('findCollectionHref', () => {
  const wire = (calendars: Array<{ href: string; name?: string }>) => {
    mockRequest
      .mockResolvedValueOnce(reply(principalReply))
      .mockResolvedValueOnce(reply(homeReply))
      .mockResolvedValueOnce(reply(multistatus(calendars)));
  };

  it('resolves a collection by its display name', async () => {
    wire([
      { href: '/123/calendars/aaa/', name: 'Medical' },
      { href: '/123/calendars/bbb/', name: 'Work / Projects' },
    ]);
    await expect(
      findCollectionHref(CREDS, 'Work / Projects'),
    ).resolves.toContain('/123/calendars/bbb/');
  });

  it('does not match a different calendar with a similar name', async () => {
    wire([{ href: '/123/calendars/aaa/', name: 'Work' }]);
    await expect(findCollectionHref(CREDS, 'Work / Projects')).rejects.toThrow(
      /No CalDAV collection/i,
    );
  });

  it('reports clearly when the calendar does not exist', async () => {
    wire([{ href: '/123/calendars/aaa/', name: 'Medical' }]);
    await expect(findCollectionHref(CREDS, 'Nope')).rejects.toThrow(/"Nope"/);
  });
});

describe('exceptOccurrenceViaCalDav', () => {
  const SERIES = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:ABC',
    'DTSTAMP:20260823T000000Z',
    'DTSTART;TZID=America/Los_Angeles:20260907T090000',
    'RRULE:FREQ=WEEKLY;COUNT=6',
    'SEQUENCE:0',
    'SUMMARY:Weekly',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const wireAll = () => {
    mockRequest
      .mockResolvedValueOnce(reply(principalReply))
      .mockResolvedValueOnce(reply(homeReply))
      .mockResolvedValueOnce(
        reply(multistatus([{ href: '/123/calendars/bbb/', name: 'Cal' }])),
      )
      .mockResolvedValueOnce({
        status: 200,
        headers: new Headers({ etag: '"e1"', 'schedule-tag': '"s1"' }),
        body: SERIES,
      })
      .mockResolvedValueOnce({ status: 204, headers: new Headers(), body: '' });
  };

  it('constructs the resource href from the UID', async () => {
    wireAll();
    const result = await exceptOccurrenceViaCalDav({
      credentials: CREDS,
      calendarName: 'Cal',
      uid: 'ABC',
      occurrenceDate: '2026-09-21T09:00:00',
    });
    expect(result.href).toContain('/123/calendars/bbb/ABC.ics');
  });

  it('PUTs a body carrying the new EXDATE with the series TZID', async () => {
    wireAll();
    await exceptOccurrenceViaCalDav({
      credentials: CREDS,
      calendarName: 'Cal',
      uid: 'ABC',
      occurrenceDate: '2026-09-21T09:00:00',
    });
    const put = mockRequest.mock.calls.find((c) => c[0] === 'PUT');
    expect(put?.[3]?.body).toContain(
      'EXDATE;TZID=America/Los_Angeles:20260921T090000',
    );
  });

  it('carries the schedule tag through so an RSVP cannot cause a false conflict', async () => {
    wireAll();
    await exceptOccurrenceViaCalDav({
      credentials: CREDS,
      calendarName: 'Cal',
      uid: 'ABC',
      occurrenceDate: '2026-09-21T09:00:00',
    });
    const put = mockRequest.mock.calls.find((c) => c[0] === 'PUT');
    expect(put?.[3]?.scheduleTag).toBe('"s1"');
  });
});
