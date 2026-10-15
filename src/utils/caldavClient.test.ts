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
  CalDavError,
  request,
} from './caldavClient.js';

const CREDS = { appleId: 'user@example.com', password: 'app-specific-secret' };
const OK = 'https://p157-caldav.icloud.com/109907235/calendars/X/a.ics';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

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
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const responseWithDisposableBody = (init: {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}) => {
  const cancel = jest.fn();
  const text = jest.fn().mockResolvedValue(init.body ?? '');
  const response = {
    status: init.status,
    headers: new Headers(init.headers),
    body: { cancel } as unknown as ReadableStream<Uint8Array>,
    text,
  } as unknown as Response;
  return { response, cancel, text };
};

const streamedResponse = (init: {
  status?: number;
  headers?: Record<string, string>;
  chunks: Uint8Array[];
  close?: boolean;
}) => {
  const cancel = jest.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = init.chunks[index];
      if (chunk) {
        controller.enqueue(chunk);
        index += 1;
      } else if (init.close ?? true) {
        controller.close();
      }
    },
    cancel,
  });
  return {
    response: new Response(body, {
      status: init.status ?? 200,
      headers: init.headers,
    }) as unknown as Response,
    cancel,
  };
};

const hangingHeaderFetch = (signals: (AbortSignal | undefined)[]) =>
  jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal as AbortSignal | undefined;
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => {
      const fallbackTimer = setTimeout(
        () => reject(new Error('header wait elapsed')),
        30_000,
      );
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(fallbackTimer);
          reject(signal.reason ?? new Error('aborted'));
        },
        { once: true },
      );
    });
  });

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

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

  it('disposes a redirect response before following its location', async () => {
    const redirect = responseWithDisposableBody({
      status: 302,
      headers: { location: 'https://p2-caldav.icloud.com/moved.ics' },
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(redirect.response)
      .mockResolvedValueOnce(new Response('final', { status: 200 }));

    await request('GET', OK, CREDS);

    expect(redirect.cancel).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect that leaves the allowlist', async () => {
    const redirect = responseWithDisposableBody({
      status: 302,
      headers: { location: 'https://evil.example/steal' },
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(redirect.response);
    await expect(request('GET', OK, CREDS)).rejects.toThrow(/allow/i);
    expect(redirect.cancel).toHaveBeenCalledTimes(1);
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

  it('accepts a streamed response exactly at the 2 MiB boundary', async () => {
    const bytes = new Uint8Array(MAX_RESPONSE_BYTES).fill(65);
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(bytes, { status: 207 }) as unknown as Response,
      );

    const response = await request('REPORT', OK, CREDS);

    expect(response.body).toHaveLength(MAX_RESPONSE_BYTES);
  });

  it('rejects an oversized streamed response and cancels it without content', async () => {
    const secretBytes = new Uint8Array(MAX_RESPONSE_BYTES + 1).fill(65);
    const streamed = streamedResponse({ chunks: [secretBytes], close: false });
    jest.spyOn(global, 'fetch').mockResolvedValue(streamed.response);

    const error = await request('REPORT', OK, CREDS).catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    expect(error).toMatchObject({ message: expect.stringMatching(/2 MiB/i) });
    expect(error.message).not.toContain(CREDS.password);
    await flushMicrotasks();
    expect(streamed.cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects a declared oversized response before reading it', async () => {
    const oversized = responseWithDisposableBody({
      status: 207,
      headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) },
      body: CREDS.password,
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(oversized.response);

    const error = await request('REPORT', OK, CREDS).catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    expect(error).toMatchObject({ message: expect.stringMatching(/2 MiB/i) });
    expect(error.message).not.toContain(CREDS.password);
    expect(oversized.text).not.toHaveBeenCalled();
    expect(oversized.cancel).toHaveBeenCalledTimes(1);
    expect(
      (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal
        ?.aborted,
    ).toBe(true);
  });

  it('enforces the streamed cap when Content-Length is absent or lies', async () => {
    const streamed = streamedResponse({
      headers: { 'content-length': '1' },
      chunks: [new Uint8Array(MAX_RESPONSE_BYTES + 1)],
      close: false,
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(streamed.response);

    const error = await request('REPORT', OK, CREDS).catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    await flushMicrotasks();
    expect(streamed.cancel).toHaveBeenCalledTimes(1);
  });

  it('enforces the cap across multiple individually small chunks', async () => {
    const streamed = streamedResponse({
      chunks: [new Uint8Array(MAX_RESPONSE_BYTES - 1), new Uint8Array(2)],
      close: false,
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(streamed.response);

    const error = await request('REPORT', OK, CREDS).catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    expect(error.message).toMatch(/2 MiB/i);
    await flushMicrotasks();
    expect(streamed.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves UTF-8 characters split across stream chunks', async () => {
    const streamed = streamedResponse({
      chunks: [Uint8Array.from([0xc3]), Uint8Array.from([0xa9])],
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(streamed.response);

    const response = await request('REPORT', OK, CREDS);

    expect(response.body).toBe('é');
  });

  it.each([
    [401, CalDavAuthError],
    [403, CalDavAuthError],
    [412, CalDavConflictError],
  ] as const)('disposes HTTP %s error responses while preserving their error type', async (status, ErrorType) => {
    const failed = responseWithDisposableBody({
      status,
      body: CREDS.password,
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(failed.response);

    await expect(request('GET', OK, CREDS)).rejects.toBeInstanceOf(ErrorType);

    expect(failed.text).not.toHaveBeenCalled();
    expect(failed.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves a typed auth error when response cleanup rejects', async () => {
    const failed = responseWithDisposableBody({ status: 401 });
    failed.cancel.mockRejectedValueOnce(new Error('cleanup failed'));
    jest.spyOn(global, 'fetch').mockResolvedValue(failed.response);

    await expect(request('GET', OK, CREDS)).rejects.toBeInstanceOf(
      CalDavAuthError,
    );
    await flushMicrotasks();

    expect(failed.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves a size error when early cleanup rejects', async () => {
    const oversized = responseWithDisposableBody({
      status: 207,
      headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) },
    });
    oversized.cancel.mockRejectedValueOnce(new Error('cleanup failed'));
    jest.spyOn(global, 'fetch').mockResolvedValue(oversized.response);

    await expect(request('REPORT', OK, CREDS)).rejects.toMatchObject({
      message: expect.stringMatching(/2 MiB/i),
    });
    await flushMicrotasks();

    expect(oversized.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves a typed conflict error when cleanup fails synchronously', async () => {
    const failed = responseWithDisposableBody({ status: 412 });
    failed.cancel.mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    jest.spyOn(global, 'fetch').mockResolvedValue(failed.response);

    await expect(request('PUT', OK, CREDS)).rejects.toBeInstanceOf(
      CalDavConflictError,
    );
    expect(failed.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves a size error when reader cleanup rejects', async () => {
    const streamed = streamedResponse({
      chunks: [new Uint8Array(MAX_RESPONSE_BYTES + 1)],
      close: false,
    });
    streamed.cancel.mockRejectedValueOnce(new Error('cleanup failed'));
    jest.spyOn(global, 'fetch').mockResolvedValue(streamed.response);

    await expect(request('REPORT', OK, CREDS)).rejects.toMatchObject({
      message: expect.stringMatching(/2 MiB/i),
    });
    await flushMicrotasks();

    expect(streamed.cancel).toHaveBeenCalledTimes(1);
  });

  it('preserves a size error when reader cleanup fails synchronously', async () => {
    const reader = {
      read: jest.fn().mockResolvedValue({
        done: false,
        value: new Uint8Array(MAX_RESPONSE_BYTES + 1),
      }),
      cancel: jest.fn(() => {
        throw new Error('cleanup failed');
      }),
      releaseLock: jest.fn(),
    };
    const response = {
      status: 207,
      headers: new Headers(),
      body: {
        getReader: () => reader,
      } as unknown as ReadableStream<Uint8Array>,
    } as unknown as Response;
    jest.spyOn(global, 'fetch').mockResolvedValue(response);

    await expect(request('REPORT', OK, CREDS)).rejects.toMatchObject({
      message: expect.stringMatching(/2 MiB/i),
    });

    expect(reader.cancel).toHaveBeenCalledTimes(1);
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('turns a response stream read failure into a safe CalDavError', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('upstream body secret'));
      },
    });
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(body, { status: 207 }) as unknown as Response,
      );

    const error = await request('REPORT', OK, CREDS).catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    expect(error.message).toMatch(/unable to read/i);
    expect(error.message).not.toContain('upstream body secret');
  });

  it('disposes a late response after the overall deadline expires', async () => {
    jest.useFakeTimers();
    const late = responseWithDisposableBody({ status: 207 });
    jest.spyOn(global, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(late.response), 31_000);
        }),
    );

    const pending = request('REPORT', OK, CREDS);
    await flushMicrotasks();
    jest.advanceTimersByTime(31_000);
    const error = await pending.catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    expect(error.message).toMatch(/30 seconds|timed out/i);
    expect(late.cancel).toHaveBeenCalledTimes(1);
  });

  it('propagates a non-timeout fetch failure', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network failure'));

    await expect(request('GET', OK, CREDS)).rejects.toThrow('network failure');
  });

  it('times out while waiting for response headers and aborts the fetch', async () => {
    jest.useFakeTimers();
    const signals: (AbortSignal | undefined)[] = [];
    const fetchMock = hangingHeaderFetch(signals);
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

    const pending = request('GET', OK, CREDS);
    await flushMicrotasks();
    jest.advanceTimersByTime(30_000);
    const error = await pending.catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    expect(error.message).toMatch(/30 seconds|timed out/i);
    expect(error.message).not.toContain(CREDS.password);
    expect(signals[0]?.aborted).toBe(true);
  });

  it('uses one deadline and signal across a redirect chain', async () => {
    jest.useFakeTimers();
    const redirect = responseWithDisposableBody({
      status: 307,
      headers: { location: 'https://p2-caldav.icloud.com/moved.ics' },
    });
    const signals: (AbortSignal | undefined)[] = [];
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce((_input, init) => {
        signals.push(init?.signal as AbortSignal | undefined);
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(redirect.response), 15_000);
        });
      })
      .mockImplementationOnce((_input, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        signals.push(signal);
        return new Promise<Response>((_resolve, reject) => {
          const fallbackTimer = setTimeout(
            () => reject(new Error('redirect wait elapsed')),
            16_000,
          );
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(fallbackTimer);
              reject(signal.reason ?? new Error('aborted'));
            },
            { once: true },
          );
        });
      });

    const pending = request('GET', OK, CREDS);
    await flushMicrotasks();
    jest.advanceTimersByTime(15_000);
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(16_000);
    const error = await pending.catch((reason) => reason);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0]).toBe(signals[1]);
    expect(signals[0]?.aborted).toBe(true);
    expect(redirect.cancel).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(CalDavError);
    expect(error.message).toMatch(/30 seconds|timed out/i);
  });

  it('times out while reading a response body and cancels the stream', async () => {
    jest.useFakeTimers();
    let hanging: { response: Response; cancel: jest.Mock } | undefined;
    const cancel = jest.fn();
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('prefix'));
          fallbackTimer = setTimeout(
            () => controller.error(new Error('body wait elapsed')),
            30_000,
          );
        },
        cancel() {
          if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
          cancel();
        },
      });
      const response = new Response(body, {
        status: 207,
      }) as unknown as Response;
      hanging = { response, cancel };
      return Promise.resolve(response);
    });

    const pending = request('REPORT', OK, CREDS);
    await flushMicrotasks();
    jest.advanceTimersByTime(30_000);
    const error = await pending.catch((reason) => reason);

    expect(error).toBeInstanceOf(CalDavError);
    expect(error.message).toMatch(/30 seconds|timed out/i);
    expect(hanging).toBeDefined();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
