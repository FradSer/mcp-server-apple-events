/**
 * caldavClient.ts
 * Minimal CalDAV transport for attendee writes against iCloud.
 *
 * This is the first outbound-network code in the server, and every request
 * carries an HTTP Basic credential, so the origin check is the load-bearing
 * control rather than a formality. It follows the same shape as the binary-path
 * pinning in `eventCli.ts`: narrow the allowlist to exactly the hosts we mean,
 * and re-apply the check on every redirect hop rather than trusting the first
 * validation to hold.
 *
 * Attendee writes cannot go through EventKit — `EKCalendarItem.attendees` is
 * read-only at the SDK level, and Apple models invitation delivery as the
 * server's job (see the read-only `EKParticipantScheduleStatus` enum). CalDAV
 * with RFC 6638 scheduling is the supported path, and iCloud advertises
 * `calendar-auto-schedule`.
 */

import { CliUserError } from './errorHandling.js';

const ALLOWED_HOST = /^(caldav\.icloud\.com|p\d+-caldav\.icloud\.com)$/;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface CalDavCredentials {
  appleId: string;
  password: string;
}

export interface CalDavResponse {
  status: number;
  headers: Headers;
  body: string;
}

/**
 * Extends CliUserError so the message survives production error formatting.
 * Every message raised here is hand-written and carries no credential or
 * server payload, and each names a condition the caller resolves (bad
 * password, stale resource, unreachable collection).
 */
export class CalDavError extends CliUserError {}
/** 401/403 — a credential problem, never to be reported as "CalDAV is unsupported". */
export class CalDavAuthError extends CalDavError {}
/** 412 — the resource changed underneath us; re-read and retry. */
export class CalDavConflictError extends CalDavError {}

/**
 * Throws unless the URL is https and its host is an iCloud CalDAV host.
 *
 * Uses `URL.hostname`, never a string split on the authority: userinfo of the
 * form `https://caldav.icloud.com:443@evil.example/` makes a naive check read
 * the allowed host while the request — and the Authorization header — goes to
 * the attacker's. Userinfo is rejected outright rather than parsed around.
 */
export const assertAllowedCalDavUrl = (url: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CalDavError(`Invalid URL: ${url}`);
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new CalDavError('Refusing CalDAV URL containing userinfo.');
  }
  if (parsed.protocol !== 'https:') {
    throw new CalDavError(`Refusing non-https CalDAV URL: ${parsed.protocol}`);
  }
  if (!ALLOWED_HOST.test(parsed.hostname)) {
    throw new CalDavError(
      `Host ${parsed.hostname} is not in the CalDAV allowlist.`,
    );
  }
  return parsed;
};

export interface RequestOptions {
  body?: string;
  depth?: '0' | '1';
  contentType?: string;
  etag?: string;
  scheduleTag?: string;
}

const buildHeaders = (
  credentials: CalDavCredentials,
  method: string,
  options: RequestOptions,
): Headers => {
  const headers = new Headers({
    authorization: `Basic ${Buffer.from(
      `${credentials.appleId}:${credentials.password}`,
    ).toString('base64')}`,
    'user-agent': 'mcp-server-apple-events',
  });
  if (method === 'PROPFIND' || method === 'REPORT') {
    headers.set('depth', options.depth ?? '0');
  }
  if (options.body !== undefined) {
    headers.set(
      'content-type',
      options.contentType ?? 'application/xml; charset=utf-8',
    );
  }
  // RFC 6638 §3.2.10: once a resource has attendees, an inbound RSVP changes the
  // ETag without changing anything we care about, so If-Match produces spurious
  // 412s. Schedule-Tag only changes on scheduling-significant edits.
  if (options.scheduleTag) {
    headers.set('if-schedule-tag-match', options.scheduleTag);
  } else if (options.etag) {
    headers.set('if-match', options.etag);
  }
  return headers;
};

const timeoutError = (): CalDavError =>
  new CalDavError(
    'CalDAV request timed out after 30 seconds. Retry the request.',
  );

const responseLimitError = (): CalDavError =>
  new CalDavError(
    'CalDAV response exceeds the 2 MiB limit. Ask the server to return a smaller response.',
  );

/**
 * Releases a response body without letting a cleanup failure replace the
 * authentication, conflict, redirect, or size error being reported.
 */
const disposeResponseBody = (response: Response): void => {
  if (!response.body) return;
  try {
    void Promise.resolve(response.body.cancel()).catch(() => undefined);
  } catch {
    // A response body can already be disturbed or locked; the original error
    // remains the actionable failure in either case.
  }
};

const readResponseBody = async (
  response: Response,
  signal: AbortSignal,
  timedOut: () => boolean,
  abortRequest: () => void,
): Promise<string> => {
  if (!response.body) return '';
  if (signal.aborted) {
    disposeResponseBody(response);
    throw timeoutError();
  }

  const reader = response.body.getReader();
  let cancelled = false;
  const cancelReader = (): void => {
    if (cancelled) return;
    cancelled = true;
    try {
      void Promise.resolve(reader.cancel()).catch(() => undefined);
    } catch {
      // The reader may have completed or errored while the abort was handled.
    }
  };
  const onAbort = (): void => cancelReader();
  signal.addEventListener('abort', onAbort, { once: true });

  let byteCount = 0;
  let body = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const result = await reader.read();
      if (timedOut()) throw timeoutError();
      if (result.done) break;

      const chunk = result.value;
      byteCount += chunk.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        cancelReader();
        const error = responseLimitError();
        abortRequest();
        throw error;
      }
      body += decoder.decode(chunk, { stream: true });
    }
    if (timedOut()) throw timeoutError();
    body += decoder.decode();
    return body;
  } catch (error) {
    cancelReader();
    if (error instanceof CalDavError) throw error;
    if (timedOut()) throw timeoutError();
    throw new CalDavError(
      'Unable to read CalDAV response body. Retry the request.',
    );
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
};

export const request = async (
  method: string,
  url: string,
  credentials: CalDavCredentials,
  options: RequestOptions = {},
): Promise<CalDavResponse> => {
  let target = assertAllowedCalDavUrl(url);
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (controller.signal.aborted) throw timeoutError();
      let response: Response;
      try {
        response = await fetch(target.toString(), {
          method,
          headers: buildHeaders(credentials, method, options),
          body: options.body,
          redirect: 'manual',
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut) throw timeoutError();
        throw error;
      }
      if (timedOut) {
        disposeResponseBody(response);
        throw timeoutError();
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        disposeResponseBody(response);
        const location = response.headers.get('location');
        if (!location) break;
        // Resolve relative Locations against the current target before checking,
        // so a relative hop is validated rather than rejected as unparseable.
        target = assertAllowedCalDavUrl(new URL(location, target).toString());
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        disposeResponseBody(response);
        throw new CalDavAuthError(
          `CalDAV authentication failed (HTTP ${response.status}). ` +
            'Check the app-specific password, not the server capability.',
        );
      }
      if (response.status === 412) {
        disposeResponseBody(response);
        throw new CalDavConflictError(
          'CalDAV resource changed since it was read (HTTP 412). Re-read and retry.',
        );
      }
      if (response.status >= 400) {
        disposeResponseBody(response);
        throw new CalDavError(
          `CalDAV ${method} failed with HTTP ${response.status}.`,
        );
      }

      const contentLength = response.headers.get('content-length');
      const declaredLength =
        contentLength === null ? Number.NaN : Number(contentLength);
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_RESPONSE_BYTES
      ) {
        disposeResponseBody(response);
        controller.abort();
        throw responseLimitError();
      }

      const body = await readResponseBody(
        response,
        controller.signal,
        () => timedOut,
        () => controller.abort(),
      );
      return { status: response.status, headers: response.headers, body };
    }
    throw new CalDavError(
      `Too many CalDAV redirects (limit ${MAX_REDIRECTS}).`,
    );
  } catch (error) {
    if (error instanceof CalDavError) throw error;
    if (timedOut) throw timeoutError();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
