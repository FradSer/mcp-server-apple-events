/**
 * caldavOccurrence.ts
 * Excepts a single occurrence of a recurring series over CalDAV.
 *
 * Why this cannot go through the `event` CLI: every occurrence of a series
 * shares one EventKit identifier, and resolving it yields the master, whose
 * occurrence date is its own DTSTART. A delete with span=this-event therefore
 * excepts the series start and nothing else — aimed at any later occurrence it
 * writes nothing and still reports success. EXDATE names the instant directly.
 */

import {
  type CalDavCredentials,
  CalDavError,
  request,
} from './caldavClient.js';
import { exceptOccurrence, serialize, unfold } from './icalendar.js';

const ROOT = 'https://caldav.icloud.com';

/**
 * Extracts <response> elements from a DAV:multistatus body.
 *
 * A narrow, tag-scoped scan rather than a general XML parser: the repo ships
 * zero runtime dependencies, and the shapes consumed here are the two fixed
 * PROPFIND responses below rather than arbitrary documents.
 */
const responses = (xml: string): string[] =>
  xml.split(/<[^:>]*:?response[\s>]/i).slice(1);

const tagValue = (xml: string, localName: string): string | undefined => {
  const match = new RegExp(
    `<[^:>]*:?${localName}[^>]*>([\\s\\S]*?)</[^:>]*:?${localName}>`,
    'i',
  ).exec(xml);
  return match?.[1]?.trim();
};

/**
 * The href nested inside a named element.
 *
 * Every DAV:response opens with its own href before any property, so scanning
 * the whole response for the first href returns the resource being described
 * rather than the one a property points at — which silently yields the
 * principal where the calendar home was wanted.
 */
const hrefInside = (xml: string, localName: string): string | undefined => {
  const inner = tagValue(xml, localName);
  return inner === undefined ? undefined : tagValue(inner, 'href');
};

const propfind = async (
  url: string,
  credentials: CalDavCredentials,
  body: string,
  depth: '0' | '1',
): Promise<string> => {
  const response = await request('PROPFIND', url, credentials, { body, depth });
  return response.body;
};

const absolute = (href: string, base: string): string =>
  href.startsWith('http') ? href : new URL(href, base).toString();

/** Resolves the CalDAV collection href for a calendar's display name. */
export const findCollectionHref = async (
  credentials: CalDavCredentials,
  calendarName: string,
): Promise<string> => {
  const principalBody = await propfind(
    `${ROOT}/`,
    credentials,
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
    '0',
  );
  const principal = hrefInside(principalBody, 'current-user-principal');
  if (!principal) {
    throw new CalDavError('Could not resolve the CalDAV principal.');
  }

  const homeBody = await propfind(
    absolute(principal, ROOT),
    credentials,
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
      '<d:prop><c:calendar-home-set/></d:prop></d:propfind>',
    '0',
  );
  const home = hrefInside(homeBody, 'calendar-home-set');
  if (!home) {
    throw new CalDavError('Could not resolve the CalDAV calendar home.');
  }
  const homeUrl = absolute(home, ROOT);

  const listBody = await propfind(
    homeUrl,
    credentials,
    '<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:displayname/>' +
      '</d:prop></d:propfind>',
    '1',
  );

  for (const block of responses(listBody)) {
    const name = tagValue(block, 'displayname');
    const href = tagValue(block, 'href');
    if (name === calendarName && href) return absolute(href, homeUrl);
  }
  throw new CalDavError(`No CalDAV collection found named "${calendarName}".`);
};

/**
 * Converts an ISO timestamp to an iCalendar date-time.
 *
 * The wall-clock portion is used verbatim. An occurrence of a TZID-qualified
 * series is identified by local wall time, so converting through UTC would
 * produce a stamp that does not match the generated instance and the EXDATE
 * would silently fail to except anything.
 */
export const toICalStamp = (iso: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    iso,
  );
  if (!match) {
    throw new CalDavError(`Could not read an occurrence start from "${iso}".`);
  }
  const [, y, mo, d, h, mi, sec] = match;
  return `${y}${mo}${d}T${h}${mi}${sec ?? '00'}`;
};

export interface ExceptOccurrenceInput {
  credentials: CalDavCredentials;
  calendarName: string;
  /** iCalendar UID, which for iCloud is also the resource filename. */
  uid: string;
  /** ISO start of the occurrence to except. */
  occurrenceDate: string;
}

export const exceptOccurrenceViaCalDav = async (
  input: ExceptOccurrenceInput,
): Promise<{ href: string; excepted: string }> => {
  const collection = await findCollectionHref(
    input.credentials,
    input.calendarName,
  );
  const href = `${collection.replace(/\/$/, '')}/${input.uid}.ics`;

  const current = await request('GET', href, input.credentials);
  const etag = current.headers.get('etag') ?? undefined;
  const scheduleTag = current.headers.get('schedule-tag') ?? undefined;

  const stamp = toICalStamp(input.occurrenceDate);
  const updated = exceptOccurrence(unfold(current.body), stamp);

  await request('PUT', href, input.credentials, {
    body: serialize(updated),
    contentType: 'text/calendar; charset=utf-8',
    etag,
    scheduleTag,
  });

  return { href, excepted: stamp };
};
