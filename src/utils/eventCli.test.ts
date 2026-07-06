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
    mockFindSecureBinaryPath.mockReturnValue({
      path: '/test/project/bin/event',
    });
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
        { maxBuffer: 10 * 1024 * 1024 },
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
      mockFindSecureBinaryPath.mockReturnValue({
        path: '/custom/project/bin/event',
      });
      respondWith({ stdout: JSON.stringify({ ok: true }) });

      await executeEventCliJson(['reminders', 'lists', 'list', '--json']);

      expect(mockExecFile).toHaveBeenCalledWith(
        '/custom/project/bin/event',
        ['reminders', 'lists', 'list', '--json'],
        { maxBuffer: 10 * 1024 * 1024 },
        expect.any(Function),
      );
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
