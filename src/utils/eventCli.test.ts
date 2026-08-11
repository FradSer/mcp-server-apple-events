/**
 * eventCli.test.ts
 * Tests for the `event` CLI execution wrapper.
 */

import type {
  ChildProcess,
  ExecFileException,
  ExecFileOptions,
} from 'node:child_process';
import { execFile } from 'node:child_process';
import {
  findSecureBinaryPath,
  getEnvironmentBinaryConfig,
} from './binaryValidator.js';
import {
  CliPermissionError,
  clearEventBinaryPathCache,
  executeEventCliJson,
  executeEventCliPlain,
} from './eventCli.js';
import { findProjectRoot } from './projectUtils.js';

type ExecFileCallback =
  | ((
      error: ExecFileException | null,
      stdout: string | Buffer,
      stderr: string | Buffer,
    ) => void)
  | null
  | undefined;

jest.mock('node:child_process');
jest.mock('./projectUtils.js', () => ({
  findProjectRoot: jest.fn(),
}));
jest.mock('./binaryValidator.js', () => ({
  findSecureBinaryPath: jest.fn(),
  getEnvironmentBinaryConfig: jest.fn(),
}));

const mockExecFile = execFile as jest.MockedFunction<typeof execFile>;
const mockFindProjectRoot = findProjectRoot as jest.MockedFunction<
  typeof findProjectRoot
>;
const mockFindSecureBinaryPath = findSecureBinaryPath as jest.MockedFunction<
  typeof findSecureBinaryPath
>;
const mockGetEnvironmentBinaryConfig =
  getEnvironmentBinaryConfig as jest.MockedFunction<
    typeof getEnvironmentBinaryConfig
  >;

const invokeCallback = (
  optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
  callback?: ExecFileCallback,
): ExecFileCallback | undefined =>
  (typeof optionsOrCallback === 'function' ? optionsOrCallback : callback) as
    | ExecFileCallback
    | undefined;

// Stamps execFile mock with a configurable success/failure response.
const respondWith = (opts: {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  error?: ExecFileException | null;
}) => {
  mockExecFile.mockImplementation(((
    _cliPath: string,
    _args: readonly string[] | null | undefined,
    optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
    callback?: ExecFileCallback,
  ) => {
    const cb = invokeCallback(optionsOrCallback, callback);
    cb?.(opts.error ?? null, opts.stdout ?? '', opts.stderr ?? '');
    return {} as ChildProcess;
  }) as unknown as typeof execFile);
};

describe('eventCli', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEventBinaryPathCache();
    mockFindProjectRoot.mockReturnValue('/test/project');
    mockGetEnvironmentBinaryConfig.mockReturnValue({});
    // Default: the `event` binary resolves, the optional disclaim shim does
    // not — exercising the direct-spawn fallback most tests assert on.
    mockFindSecureBinaryPath.mockImplementation((paths: string[]) =>
      paths[0]?.endsWith('/bin/event') ? { path: paths[0] } : { path: null },
    );
    // Hermetic: a developer's shell-exported EVENTKIT_CLI_TIMEOUT_MS must
    // not change the expected default in assertions below.
    delete process.env.EVENTKIT_CLI_TIMEOUT_MS;
  });

  describe('executeEventCliJson — success', () => {
    it('parses raw JSON array from stdout (no envelope)', async () => {
      respondWith({
        stdout: JSON.stringify([
          { id: 'abc', title: 'Hello', isCompleted: false },
        ]),
      });

      const result = await executeEventCliJson<
        Array<{ id: string; title: string; isCompleted: boolean }>
      >(['reminders', 'list', '--json']);

      expect(result).toEqual([
        { id: 'abc', title: 'Hello', isCompleted: false },
      ]);
      expect(mockExecFile).toHaveBeenCalledWith(
        '/test/project/bin/event',
        ['reminders', 'list', '--json'],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
          killSignal: 'SIGKILL',
        },
        expect.any(Function),
      );
    });

    it('parses raw JSON object from stdout', async () => {
      respondWith({
        stdout: JSON.stringify({ id: 'xyz', title: 'Single' }),
      });

      const result = await executeEventCliJson<{ id: string; title: string }>([
        'reminders',
        'create',
        '--title',
        'Single',
        '--json',
      ]);

      expect(result).toEqual({ id: 'xyz', title: 'Single' });
    });

    it('decodes Buffer stdout via bufferToString', async () => {
      respondWith({
        stdout: Buffer.from(JSON.stringify({ ok: true })),
      });

      const result = await executeEventCliJson<{ ok: boolean }>([
        'reminders',
        'lists',
        'list',
        '--json',
      ]);

      expect(result).toEqual({ ok: true });
    });
  });

  describe('executeEventCliPlain — success', () => {
    it('returns trimmed stdout for plain-text commands', async () => {
      respondWith({ stdout: 'Reminder deleted successfully\n' });

      const result = await executeEventCliPlain([
        'reminders',
        'delete',
        '--id',
        'abc',
      ]);

      expect(result).toBe('Reminder deleted successfully');
    });
  });

  describe('error mapping', () => {
    it('maps "Permission denied: Reminders access was denied" to CliPermissionError(reminders)', async () => {
      const error = Object.assign(new Error('Command failed'), {
        code: 1,
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr:
          'Error: Permission denied: Reminders access was denied. Please grant access in System Settings > Privacy & Security > Reminders.\n',
        error,
      });

      try {
        await executeEventCliJson(['reminders', 'list', '--json']);
        throw new Error('expected throw');
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(CliPermissionError);
        expect((thrown as CliPermissionError).domain).toBe('reminders');
        expect((thrown as Error).message).toContain('Reminders access');
      }
    });

    it('maps "Permission denied: Calendar access was denied" to CliPermissionError(calendars)', async () => {
      const error = Object.assign(new Error('Command failed'), {
        code: 1,
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr:
          'Error: Permission denied: Calendar access was denied. Please grant access in System Settings > Privacy & Security > Calendars.\n',
        error,
      });

      try {
        await executeEventCliJson(['calendar', 'list', '--json']);
        throw new Error('expected throw');
      } catch (thrown) {
        expect(thrown).toBeInstanceOf(CliPermissionError);
        expect((thrown as CliPermissionError).domain).toBe('calendars');
      }
    });

    it('treats "Only write access to reminders" as a permission error', async () => {
      const error = Object.assign(new Error('Command failed'), {
        code: 1,
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr:
          'Error: Permission denied: Only write access to reminders. Full access is required.\n',
        error,
      });

      await expect(
        executeEventCliJson(['reminders', 'list', '--json']),
      ).rejects.toBeInstanceOf(CliPermissionError);
    });

    it('throws CliUserError for "Not found:" errors, stripping the "Error: " prefix', async () => {
      const error = Object.assign(new Error('Command failed'), {
        code: 1,
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr:
          "Error: Not found: Reminder with ID 'nonexistent-id-12345' not found\n",
        error,
      });

      const promise = executeEventCliJson([
        'reminders',
        'update',
        '--id',
        'nonexistent-id-12345',
        '--title',
        'x',
        '--json',
      ]);

      await expect(promise).rejects.toThrow(
        "Not found: Reminder with ID 'nonexistent-id-12345' not found",
      );
      await expect(promise).rejects.toMatchObject({ name: 'CliUserError' });
    });

    it('throws CliUserError for ArgumentParser usage errors (exit 64)', async () => {
      const error = Object.assign(new Error('Command failed'), {
        code: 64,
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr: "Error: Missing expected argument '--title <title>'\n",
        error,
      });

      await expect(
        executeEventCliJson(['reminders', 'create', '--json']),
      ).rejects.toThrow("Missing expected argument '--title <title>'");
    });

    it('falls back to the raw stderr when no "Error:" prefix is present', async () => {
      const error = Object.assign(new Error('Command failed'), {
        code: 1,
      }) as ExecFileException;
      respondWith({ stdout: '', stderr: 'something blew up\n', error });

      await expect(
        executeEventCliJson(['reminders', 'list', '--json']),
      ).rejects.toThrow(/event execution failed.*something blew up/);
    });

    it('throws when stdout is invalid JSON in JSON mode', async () => {
      respondWith({ stdout: 'not actually json' });

      await expect(
        executeEventCliJson(['reminders', 'list', '--json']),
      ).rejects.toThrow(/Invalid CLI output/);
    });

    it('throws when stdout is empty in JSON mode', async () => {
      respondWith({ stdout: '' });

      await expect(
        executeEventCliJson(['reminders', 'list', '--json']),
      ).rejects.toThrow(/Empty CLI output/);
    });
  });

  describe('binary resolution', () => {
    it('returns a helpful error when the binary cannot be located', async () => {
      mockFindSecureBinaryPath.mockReturnValue({ path: null });

      await expect(
        executeEventCliJson(['reminders', 'list', '--json']),
      ).rejects.toThrow(/event.*binary not found/i);
    });

    it('mentions the postinstall/build path in the not-found message', async () => {
      mockFindSecureBinaryPath.mockReturnValue({ path: null });

      await expect(
        executeEventCliJson(['reminders', 'list', '--json']),
      ).rejects.toThrow(/pnpm.*build/);
    });

    it('uses findProjectRoot to compute the canonical bin/event path', async () => {
      mockFindProjectRoot.mockReturnValue('/custom/project');
      respondWith({ stdout: JSON.stringify({ ok: true }) });

      await executeEventCliJson(['reminders', 'lists', 'list', '--json']);

      expect(mockExecFile).toHaveBeenCalledWith(
        '/custom/project/bin/event',
        ['reminders', 'lists', 'list', '--json'],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
          killSignal: 'SIGKILL',
        },
        expect.any(Function),
      );
    });
  });

  describe('CLI timeout (issue #113)', () => {
    // Given execFile's default timeout is 0 ("wait forever"), when the
    // `event` CLI blocks on an EventKit permission prompt that can never be
    // displayed (headless/launchd context), the MCP request would hang
    // forever and leak a child per call. A bounded timeout kills the child
    // and settles with a readable error instead.
    const withTimeoutEnv = async (
      value: string | undefined,
      run: () => Promise<void>,
    ) => {
      const previous = process.env.EVENTKIT_CLI_TIMEOUT_MS;
      if (value === undefined) {
        delete process.env.EVENTKIT_CLI_TIMEOUT_MS;
      } else {
        process.env.EVENTKIT_CLI_TIMEOUT_MS = value;
      }
      try {
        await run();
      } finally {
        if (previous === undefined) {
          delete process.env.EVENTKIT_CLI_TIMEOUT_MS;
        } else {
          process.env.EVENTKIT_CLI_TIMEOUT_MS = previous;
        }
      }
    };

    it('spawns with a bounded timeout and SIGKILL by default', async () => {
      respondWith({ stdout: JSON.stringify({ ok: true }) });

      await executeEventCliJson(['reminders', 'list', '--json']);

      expect(mockExecFile).toHaveBeenCalledWith(
        '/test/project/bin/event',
        ['reminders', 'list', '--json'],
        { maxBuffer: 10 * 1024 * 1024, timeout: 30_000, killSignal: 'SIGKILL' },
        expect.any(Function),
      );
    });

    it('honors EVENTKIT_CLI_TIMEOUT_MS when set', async () => {
      await withTimeoutEnv('5000', async () => {
        respondWith({ stdout: JSON.stringify({ ok: true }) });

        await executeEventCliJson(['reminders', 'list', '--json']);

        const options = mockExecFile.mock.calls[0]?.[2] as
          | { timeout?: number }
          | undefined;
        expect(options?.timeout).toBe(5000);
      });
    });

    it('falls back to the default when EVENTKIT_CLI_TIMEOUT_MS is invalid', async () => {
      await withTimeoutEnv('not-a-number', async () => {
        respondWith({ stdout: JSON.stringify({ ok: true }) });

        await executeEventCliJson(['reminders', 'list', '--json']);

        const options = mockExecFile.mock.calls[0]?.[2] as
          | { timeout?: number }
          | undefined;
        expect(options?.timeout).toBe(30_000);
      });
    });

    it('falls back to the default for zero (cannot disable the timeout)', async () => {
      await withTimeoutEnv('0', async () => {
        respondWith({ stdout: JSON.stringify({ ok: true }) });

        await executeEventCliJson(['reminders', 'list', '--json']);

        const options = mockExecFile.mock.calls[0]?.[2] as
          | { timeout?: number }
          | undefined;
        expect(options?.timeout).toBe(30_000);
      });
    });

    it('accepts numeric-separator syntax like the codebase literals', async () => {
      await withTimeoutEnv('120_000', async () => {
        respondWith({ stdout: JSON.stringify({ ok: true }) });

        await executeEventCliJson(['reminders', 'list', '--json']);

        const options = mockExecFile.mock.calls[0]?.[2] as
          | { timeout?: number }
          | undefined;
        expect(options?.timeout).toBe(120_000);
      });
    });

    it('rejects exponent and hex syntax instead of silently reinterpreting', async () => {
      for (const raw of ['1e3', '0x10']) {
        await withTimeoutEnv(raw, async () => {
          respondWith({ stdout: JSON.stringify({ ok: true }) });

          await executeEventCliJson(['reminders', 'list', '--json']);

          const options = mockExecFile.mock.calls[0]?.[2] as
            | { timeout?: number }
            | undefined;
          expect(options?.timeout).toBe(30_000);
        });
      }
    });

    it('clamps values above 2^31-1 ms to 2^31-1 ms instead of an instant kill', async () => {
      // Node's internal timer clamps at 2^31-1 ms (and warns); a safe
      // integer above that would otherwise SIGKILL ~instantly.
      await withTimeoutEnv('5000000000', async () => {
        respondWith({ stdout: JSON.stringify({ ok: true }) });

        await executeEventCliJson(['reminders', 'list', '--json']);

        const options = mockExecFile.mock.calls[0]?.[2] as
          | { timeout?: number }
          | undefined;
        expect(options?.timeout).toBe(2_147_483_647);
      });
    });

    it('falls back to the default for values beyond Number.MAX_SAFE_INTEGER', async () => {
      await withTimeoutEnv('99999999999999999999', async () => {
        respondWith({ stdout: JSON.stringify({ ok: true }) });

        await executeEventCliJson(['reminders', 'list', '--json']);

        const options = mockExecFile.mock.calls[0]?.[2] as
          | { timeout?: number }
          | undefined;
        expect(options?.timeout).toBe(30_000);
      });
    });

    it('settles a hung CLI with an actionable error instead of hanging', async () => {
      const timeoutError = Object.assign(new Error('Command failed'), {
        killed: true,
        signal: 'SIGKILL',
      }) as ExecFileException;
      respondWith({ stdout: '', stderr: '', error: timeoutError });

      const promise = executeEventCliJson(['reminders', 'list', '--json']);

      await expect(promise).rejects.toMatchObject({ name: 'CliUserError' });
      await expect(promise).rejects.toThrow(/timed out after 30000 ms/);
      await expect(promise).rejects.toThrow(/EVENTKIT_CLI_TIMEOUT_MS/);
    });

    it('does not let stderr flushed before the kill mask the timeout diagnosis', async () => {
      // Given the killed child flushed a line to stderr before blocking,
      // when the timeout fires, then the error still reports the kill (with
      // the stderr appended) instead of surfacing the stale line as the cause.
      const timeoutError = Object.assign(new Error('Command failed'), {
        killed: true,
        signal: 'SIGKILL',
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr: 'event: some warning before blocking\n',
        error: timeoutError,
      });

      const promise = executeEventCliJson(['reminders', 'list', '--json']);

      await expect(promise).rejects.toThrow(/timed out after 30000 ms/);
      await expect(promise).rejects.toThrow(
        /stderr before kill: event: some warning/,
      );
    });
  });

  describe('TCC disclaim shim routing (issue #93)', () => {
    // Given the build produced bin/event-disclaim next to bin/event,
    // when any event command runs, then it is spawned through the shim so
    // the TCC permission prompt is attributed to `event` itself instead of
    // the desktop MCP client that launched the server.
    const resolveBoth = () => {
      mockFindSecureBinaryPath.mockImplementation((paths: string[]) => ({
        path: paths[0] ?? null,
      }));
    };

    it('spawns event through bin/event-disclaim when the shim is present', async () => {
      resolveBoth();
      respondWith({ stdout: JSON.stringify({ ok: true }) });

      await executeEventCliJson(['reminders', 'list', '--json']);

      expect(mockExecFile).toHaveBeenCalledWith(
        '/test/project/bin/event-disclaim',
        ['/test/project/bin/event', 'reminders', 'list', '--json'],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
          killSignal: 'SIGKILL',
        },
        expect.any(Function),
      );
    });

    it('routes plain-text commands through the shim as well', async () => {
      resolveBoth();
      respondWith({ stdout: 'Reminder deleted successfully\n' });

      const result = await executeEventCliPlain([
        'reminders',
        'delete',
        '--id',
        'abc',
      ]);

      expect(result).toBe('Reminder deleted successfully');
      expect(mockExecFile).toHaveBeenCalledWith(
        '/test/project/bin/event-disclaim',
        ['/test/project/bin/event', 'reminders', 'delete', '--id', 'abc'],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
          killSignal: 'SIGKILL',
        },
        expect.any(Function),
      );
    });

    it('falls back to direct spawn when the shim is absent', async () => {
      // Default beforeEach mock resolves only bin/event.
      respondWith({ stdout: JSON.stringify({ ok: true }) });

      await executeEventCliJson(['reminders', 'list', '--json']);

      expect(mockExecFile).toHaveBeenCalledWith(
        '/test/project/bin/event',
        ['reminders', 'list', '--json'],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: 30_000,
          killSignal: 'SIGKILL',
        },
        expect.any(Function),
      );
    });

    it('does not apply the SWIFT_BINARY_HASH pin (meant for event) to the shim', async () => {
      // If the event hash pin leaked into the shim's validation config, the
      // shim could never validate on strict-mode installs and the server
      // would silently fall back to host-attributed spawning.
      mockGetEnvironmentBinaryConfig.mockReturnValue({
        expectedHash: 'pin-for-bin-event',
      });
      mockFindSecureBinaryPath.mockImplementation((paths: string[]) => ({
        path: paths[0] ?? null,
      }));
      respondWith({ stdout: JSON.stringify({ ok: true }) });

      await executeEventCliJson(['reminders', 'list', '--json']);

      const shimCall = mockFindSecureBinaryPath.mock.calls.find((call) =>
        (call[0] as string[])[0]?.endsWith('event-disclaim'),
      );
      expect(shimCall).toBeDefined();
      expect(
        (shimCall?.[1] as { expectedHash?: string }).expectedHash,
      ).toBeUndefined();
    });

    it('surfaces shim spawn failures verbatim as user-actionable errors', async () => {
      resolveBoth();
      const error = Object.assign(new Error('Command failed'), {
        code: 127,
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr:
          'event-disclaim: failed to exec /test/project/bin/event: No such file or directory\n',
        error,
      });

      const promise = executeEventCliJson(['reminders', 'list', '--json']);

      await expect(promise).rejects.toThrow(
        'event-disclaim: failed to exec /test/project/bin/event',
      );
      await expect(promise).rejects.toMatchObject({ name: 'CliUserError' });
    });

    it('warns on stderr once when the shim is unavailable', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const originalNodeEnv = process.env.NODE_ENV;
      // The warning is suppressed under NODE_ENV=test to keep suite output
      // clean; emulate a production resolve to observe it.
      process.env.NODE_ENV = 'production';
      try {
        // Default beforeEach mock resolves only bin/event.
        respondWith({ stdout: JSON.stringify({ ok: true }) });

        await executeEventCliJson(['reminders', 'list', '--json']);
        await executeEventCliJson(['reminders', 'list', '--json']);

        const shimWarnings = consoleError.mock.calls.filter((call) =>
          String(call[0]).includes('event-disclaim shim not found'),
        );
        expect(shimWarnings).toHaveLength(1);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        consoleError.mockRestore();
      }
    });

    it('maps permission errors identically when spawned through the shim', async () => {
      resolveBoth();
      const error = Object.assign(new Error('Command failed'), {
        code: 1,
      }) as ExecFileException;
      respondWith({
        stdout: '',
        stderr:
          'Error: Permission denied: Reminders access was denied. Please grant access in System Settings > Privacy & Security > Reminders.\n',
        error,
      });

      await expect(
        executeEventCliJson(['reminders', 'list', '--json']),
      ).rejects.toBeInstanceOf(CliPermissionError);
    });
  });

  describe('CliPermissionError', () => {
    it('carries the permission domain', () => {
      const reminders = new CliPermissionError(
        'Permission denied: Reminders access was denied.',
        'reminders',
      );
      const calendars = new CliPermissionError(
        'Permission denied: Calendar access was denied.',
        'calendars',
      );

      expect(reminders.domain).toBe('reminders');
      expect(reminders.name).toBe('CliPermissionError');
      expect(calendars.domain).toBe('calendars');
    });
  });
});
