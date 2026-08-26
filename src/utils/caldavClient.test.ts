/**
 * caldavClient.test.ts
 *
 * Mocks the transport at the fetch boundary and asserts on request shape — the
 * HTTP analogue of how calendarRepository.test.ts asserts on argv.
 *
 * Error-path and security coverage comes first, per AGENTS.md ("prioritize
 * schema and error-path coverage before happy paths"). This module is the first
 * outbound-network code in the repo and it carries an Authorization header, so
 * the origin checks are the part most worth pinning down.
 */

import {
  assertAllowedCalDavUrl,
  CalDavAuthError,
  CalDavConflictError,
  request,
} from './caldavClient.js';

const CREDS = { appleId: 'user@example.com', password: 'app-specific-secret' };
const OK = 'https://p157-caldav.icloud.com/109907235/calendars/X/a.ics';

const respondWith = (
  init: {
    status?: number;
    body?: string;
    headers?: Record<string, string>;
  } = {},
) => {
  const status = init.status ?? 200;
  // 204/304 are null-body statuses; the Response constructor rejects any body.
  const body = status === 204 || status === 304 ? null : (init.body ?? '');
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(body, {
      status,
      headers: init.headers ?? {},
    }) as unknown as Response,
  );
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('assertAllowedCalDavUrl', () => {
  it.each([
    'https://caldav.icloud.com/',
    'https://p157-caldav.icloud.com/109907235/calendars/',
    'https://p1-caldav.icloud.com/x',
  ])('accepts %s', (url) => {
    expect(() => assertAllowedCalDavUrl(url)).not.toThrow();
  });

  it('rejects plain http', () => {
    expect(() => assertAllowedCalDavUrl('http://caldav.icloud.com/')).toThrow(
      /https/i,
    );
  });

  it('rejects a host outside the allowlist', () => {
    expect(() => assertAllowedCalDavUrl('https://evil.example/x')).toThrow(
      /allow/i,
    );
  });

  it('rejects a look-alike suffix host', () => {
    expect(() =>
      assertAllowedCalDavUrl('https://caldav.icloud.com.evil.example/x'),
    ).toThrow(/allow/i);
  });

  // Regression: checking netloc.split(':') instead of hostname lets userinfo
  // redirect the request — and the Authorization header — to an arbitrary host.
  it('rejects userinfo smuggling a foreign host past the check', () => {
    expect(() =>
      assertAllowedCalDavUrl('https://caldav.icloud.com:443@evil.example/x'),
    ).toThrow(/userinfo|allow/i);
  });

  it('rejects a non-URL string without throwing a raw TypeError', () => {
    expect(() => assertAllowedCalDavUrl('not a url')).toThrow(/invalid url/i);
  });
});

describe('request — auth and transport', () => {
  it('sends HTTP Basic credentials', async () => {
    const f = respondWith({ status: 207, body: '<ok/>' });
    await request('PROPFIND', OK, CREDS, { body: '<x/>' });
    const headers = new Headers(f.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe(
      `Basic ${Buffer.from(`${CREDS.appleId}:${CREDS.password}`).toString('base64')}`,
    );
  });

  it('never lets redirects be followed automatically', async () => {
    const f = respondWith({ status: 207 });
    await request('GET', OK, CREDS);
    expect(f.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });

  it('follows a redirect that stays inside the allowlist', async () => {
    const f = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('', {
          status: 301,
          headers: { location: 'https://p2-caldav.icloud.com/moved.ics' },
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        new Response('final', { status: 200 }) as unknown as Response,
      );
    const res = await request('GET', OK, CREDS);
    expect(res.body).toBe('final');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('refuses a redirect that leaves the allowlist', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('', {
        status: 302,
        headers: { location: 'https://evil.example/steal' },
      }) as unknown as Response,
    );
    await expect(request('GET', OK, CREDS)).rejects.toThrow(/allow/i);
  });

  it('gives up rather than looping on repeated redirects', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('', {
        status: 307,
        headers: { location: 'https://p2-caldav.icloud.com/loop.ics' },
      }) as unknown as Response,
    );
    await expect(request('GET', OK, CREDS)).rejects.toThrow(/redirect/i);
  });

  it('raises a distinct auth error on 401 so it is not read as a capability failure', async () => {
    respondWith({ status: 401 });
    await expect(request('GET', OK, CREDS)).rejects.toBeInstanceOf(
      CalDavAuthError,
    );
  });

  it('raises a distinct conflict error on 412 (stale tag)', async () => {
    respondWith({ status: 412 });
    await expect(request('PUT', OK, CREDS)).rejects.toBeInstanceOf(
      CalDavConflictError,
    );
  });

  it('never puts the password in an error message', async () => {
    respondWith({ status: 500, body: 'server exploded' });
    await expect(request('GET', OK, CREDS)).rejects.toThrow(
      expect.not.stringContaining(CREDS.password) as unknown as string,
    );
  });

  it('prefers If-Schedule-Tag-Match over If-Match when a schedule tag is known', async () => {
    const f = respondWith({ status: 204 });
    await request('PUT', OK, CREDS, {
      etag: '"e1"',
      scheduleTag: '"s1"',
      body: 'x',
    });
    const headers = new Headers(f.mock.calls[0]?.[1]?.headers);
    expect(headers.get('if-schedule-tag-match')).toBe('"s1"');
    expect(headers.get('if-match')).toBeNull();
  });

  it('falls back to If-Match when no schedule tag is available', async () => {
    const f = respondWith({ status: 204 });
    await request('PUT', OK, CREDS, { etag: '"e1"', body: 'x' });
    const headers = new Headers(f.mock.calls[0]?.[1]?.headers);
    expect(headers.get('if-match')).toBe('"e1"');
  });
});
