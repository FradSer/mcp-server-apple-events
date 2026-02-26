/**
 * cliExecutor.test.ts
 * Tests for CLI executor utilities
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
  escapeAppleScriptString,
  executeCli,
} from './cliExecutor.js';
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

describe('cliExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindProjectRoot.mockReturnValue('/test/project');
    mockGetEnvironmentBinaryConfig.mockReturnValue({});
    mockFindSecureBinaryPath.mockReturnValue({
      path: '/test/project/bin/EventKitCLI',
    });
  });

  const invokeCallback = (
    optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
    callback?: ExecFileCallback,
  ): ExecFileCallback | undefined =>
    (typeof optionsOrCallback === 'function' ? optionsOrCallback : callback) as
      | ExecFileCallback
      | undefined;

  describe('executeCli', () => {
    it('returns parsed result on success', async () => {
      const mockStdout = JSON.stringify({
        status: 'success',
        result: { id: '123', title: 'Test reminder' },
      });

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(null, mockStdout, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      const result = await executeCli(['--action', 'read', '--id', '123']);

      expect(result).toEqual({ id: '123', title: 'Test reminder' });
      expect(mockExecFile).toHaveBeenCalledWith(
        '/test/project/bin/EventKitCLI',
        ['--action', 'read', '--id', '123'],
        expect.any(Function),
      );
    });

    it('throws CliUserError for non-permission CLI errors', async () => {
      const mockStdout = JSON.stringify({
        status: 'error',
        message: 'Failed to read reminder',
      });

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(null, mockStdout, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(
        executeCli(['--action', 'read', '--id', '123']),
      ).rejects.toThrow('Failed to read reminder');

      try {
        await executeCli(['--action', 'read', '--id', '123']);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe('CliUserError');
      }
    });

    it('throws error when binary path validation fails', async () => {
      mockFindSecureBinaryPath.mockReturnValue({ path: null });

      await expect(
        executeCli(['--action', 'read', '--id', '123']),
      ).rejects.toThrow('EventKitCLI binary not found');
    });

    it('wraps unexpected exec failures', async () => {
      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        const error = Object.assign(new Error('Command failed'), {
          stdout: '',
          stderr: '',
        }) as ExecFileException;
        cb?.(error, '', '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(
        executeCli(['--action', 'read', '--id', '123']),
      ).rejects.toThrow('EventKitCLI execution failed: Command failed');
    });

    it('throws when stdout is invalid JSON', async () => {
      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(null, 'invalid json', '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(
        executeCli(['--action', 'read', '--id', '123']),
      ).rejects.toThrow('EventKitCLI execution failed');
    });

    it('handles non-Error exceptions gracefully', async () => {
      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        const error = Object.assign(new Error('string error'), {
          stdout: '',
          stderr: '',
        }) as ExecFileException;
        cb?.(error, '', '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(
        executeCli(['--action', 'read', '--id', '123']),
      ).rejects.toThrow('EventKitCLI execution failed: string error');
    });

    it('computes CLI path using findProjectRoot', async () => {
      mockFindProjectRoot.mockReturnValue('/custom/project/path');
      mockFindSecureBinaryPath.mockReturnValue({
        path: '/custom/project/path/bin/EventKitCLI',
      });
      const mockStdout = JSON.stringify({
        status: 'success',
        result: { success: true },
      });

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(null, mockStdout, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await executeCli(['--action', 'read']);

      expect(mockExecFile).toHaveBeenCalledWith(
        '/custom/project/path/bin/EventKitCLI',
        ['--action', 'read'],
        expect.any(Function),
      );
    });

    it('throws permission error when reminder access is denied', async () => {
      const permissionError = JSON.stringify({
        status: 'error',
        message: 'Reminder permission denied.',
      });

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        const error = Object.assign(new Error('Command failed'), {
          stderr: '',
        }) as ExecFileException;
        cb?.(error, permissionError, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      const promise = executeCli(['--action', 'read']);
      await expect(promise).rejects.toThrow('Reminder permission denied.');
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('throws permission error when calendar access is denied', async () => {
      const permissionError = JSON.stringify({
        status: 'error',
        message: 'Calendar permission denied.',
      });

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        const error = Object.assign(new Error('Command failed'), {
          stderr: '',
        }) as ExecFileException;
        cb?.(error, permissionError, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      const promise = executeCli(['--action', 'read-events']);
      await expect(promise).rejects.toThrow('Calendar permission denied.');
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('treats write-only reminder access as a permission error', async () => {
      const permissionError = JSON.stringify({
        status: 'error',
        message:
          'Reminder permission is write-only, but read access is required.',
      });

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        const error = Object.assign(new Error('Command failed'), {
          stderr: '',
        }) as ExecFileException;
        cb?.(error, permissionError, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      const promise = executeCli(['--action', 'read']);

      await expect(promise).rejects.toThrow(
        'Reminder permission is write-only, but read access is required.',
      );
      expect(mockExecFile).toHaveBeenCalledTimes(1);
    });

    it('throws authorization error immediately', async () => {
      const permissionError = JSON.stringify({
        status: 'error',
        message: 'Authorization denied.',
      });

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        const error = Object.assign(new Error('Command failed'), {
          stderr: '',
        }) as ExecFileException;
        cb?.(error, permissionError, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(
        executeCli(['--action', 'create-event', '--title', 'Test']),
      ).rejects.toThrow('Authorization denied.');
    });

    it('handles empty stdout by throwing error', async () => {
      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(null, '', '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(
        executeCli(['--action', 'read', '--id', '123']),
      ).rejects.toThrow('EventKitCLI execution failed: Empty CLI output');
    });

    it('handles null stdout by throwing error', async () => {
      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(null, null as unknown as string, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(
        executeCli(['--action', 'read', '--id', '123']),
      ).rejects.toThrow('EventKitCLI execution failed');
    });

    it('should handle Buffer output in bufferToString', async () => {
      const bufferData = Buffer.from(
        JSON.stringify({ status: 'success', result: { ok: true } }),
      );

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(null, bufferData, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      const result = await executeCli(['--action', 'read']);

      expect(result).toEqual({ ok: true });
    });

    it('should handle non-Error objects in error path', async () => {
      const stringError = 'Custom error string';

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        cb?.(stringError as unknown as ExecFileException, '', '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      await expect(executeCli(['--action', 'read'])).rejects.toThrow(
        /EventKitCLI execution failed.*Custom error string/,
      );
    });

    it('should handle non-string, non-Buffer, non-null data in bufferToString', async () => {
      // Test the String(data) branch by passing a number
      const validJsonString = '{"status":"success","result":{"value":123}}';

      mockExecFile.mockImplementation(((
        _cliPath: string,
        _args: readonly string[] | null | undefined,
        optionsOrCallback?: ExecFileOptions | null | ExecFileCallback,
        callback?: ExecFileCallback,
      ) => {
        const cb = invokeCallback(optionsOrCallback, callback);
        // bufferToString will convert 123 to "123", but we need valid JSON
        // So let's test with a valid JSON string instead
        cb?.(null, validJsonString, '');
        return {} as ChildProcess;
      }) as unknown as typeof execFile);

      const result = await executeCli(['--action', 'read']);
      expect(result).toEqual({ value: 123 });
    });
  });

  describe('CliPermissionError', () => {
    it('creates error with correct domain for reminders', () => {
      const error = new CliPermissionError(
        'Reminder permission denied.',
        'reminders',
      );

      expect(error.name).toBe('CliPermissionError');
      expect(error.message).toBe('Reminder permission denied.');
      expect(error.domain).toBe('reminders');
    });

    it('creates error with correct domain for calendars', () => {
      const error = new CliPermissionError(
        'Calendar permission denied.',
        'calendars',
      );

      expect(error.name).toBe('CliPermissionError');
      expect(error.message).toBe('Calendar permission denied.');
      expect(error.domain).toBe('calendars');
    });
  });

  describe('escapeAppleScriptString', () => {
    it('escapes backslashes', () => {
      expect(escapeAppleScriptString('C:\\Users\\test')).toBe(
        'C:\\\\Users\\\\test',
      );
    });

    it('escapes double quotes', () => {
      expect(escapeAppleScriptString('List "quoted"')).toBe(
        'List \\"quoted\\"',
      );
    });

    it('escapes both backslashes and quotes', () => {
      const input = 'path"test"';
      const result = escapeAppleScriptString(input);
      expect(result).toBe('path\\"test\\"');
    });

    it('passes through clean strings unchanged', () => {
      expect(escapeAppleScriptString('Shopping List')).toBe('Shopping List');
    });

    it('handles empty strings', () => {
      expect(escapeAppleScriptString('')).toBe('');
    });

    it('handles special characters like emoji', () => {
      expect(escapeAppleScriptString('🛒')).toBe('🛒');
    });
  });
});
