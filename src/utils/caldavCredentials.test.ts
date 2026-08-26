import { execFile } from 'node:child_process';
import {
  MissingCalDavCredentialsError,
  resolveCalDavCredentials,
} from './caldavCredentials.js';

jest.mock('node:child_process');
const mockExecFile = execFile as unknown as jest.Mock;

const keychainReturns = (value: string | null) => {
  mockExecFile.mockImplementation((_c: string, _a: string[], cb: unknown) => {
    (cb as (e: Error | null, o: string) => void)(
      value === null ? new Error('not found') : null,
      value ?? '',
    );
  });
};

const ORIGINAL = { ...process.env };
beforeEach(() => {
  mockExecFile.mockReset();
  process.env.ICLOUD_APPLE_ID = undefined;
  process.env.ICLOUD_APP_PASSWORD = undefined;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('resolveCalDavCredentials', () => {
  it('prefers the environment when both are set', async () => {
    process.env.ICLOUD_APPLE_ID = 'a@b.com';
    process.env.ICLOUD_APP_PASSWORD = 'from-env';
    await expect(resolveCalDavCredentials()).resolves.toEqual({
      appleId: 'a@b.com',
      password: 'from-env',
    });
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('falls back to the Keychain when only the id is set', async () => {
    process.env.ICLOUD_APPLE_ID = 'a@b.com';
    keychainReturns('from-keychain\n');
    await expect(resolveCalDavCredentials()).resolves.toEqual({
      appleId: 'a@b.com',
      password: 'from-keychain',
    });
  });

  it('throws with actionable setup guidance when nothing is available', async () => {
    process.env.ICLOUD_APPLE_ID = 'a@b.com';
    keychainReturns(null);
    await expect(resolveCalDavCredentials()).rejects.toBeInstanceOf(
      MissingCalDavCredentialsError,
    );
    await expect(resolveCalDavCredentials()).rejects.toThrow(
      /add-generic-password/,
    );
  });

  it('throws when no apple id is configured at all', async () => {
    await expect(resolveCalDavCredentials()).rejects.toBeInstanceOf(
      MissingCalDavCredentialsError,
    );
  });

  it('never puts the password into the error message', async () => {
    process.env.ICLOUD_APPLE_ID = 'a@b.com';
    keychainReturns(null);
    await expect(resolveCalDavCredentials()).rejects.toThrow(
      expect.not.stringContaining('from-keychain') as unknown as string,
    );
  });
});
