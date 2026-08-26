/**
 * caldavCredentials.ts
 * Resolves iCloud CalDAV credentials without ever holding them in config.
 *
 * Environment first so a deployment can inject them; macOS Keychain second so
 * an interactive machine needs no environment at all. The password is returned
 * to the caller and never logged, never embedded in an error, and never written
 * to disk by this module.
 */

import { execFile } from 'node:child_process';
import type { CalDavCredentials } from './caldavClient.js';
import { CliUserError } from './errorHandling.js';

export const KEYCHAIN_SERVICE = 'icloud-caldav-mcp';

const fromKeychain = (appleId: string): Promise<string | undefined> =>
  new Promise((resolve) => {
    execFile(
      'security',
      ['find-generic-password', '-a', appleId, '-s', KEYCHAIN_SERVICE, '-w'],
      (error, stdout) => {
        resolve(error ? undefined : String(stdout).trim() || undefined);
      },
    );
  });

export class MissingCalDavCredentialsError extends CliUserError {
  constructor(appleId?: string) {
    super(
      'iCloud CalDAV credentials not found. Set ICLOUD_APPLE_ID and ' +
        'ICLOUD_APP_PASSWORD, or store an app-specific password in the ' +
        `Keychain: security add-generic-password -a "${appleId ?? '<apple-id>'}" ` +
        `-s "${KEYCHAIN_SERVICE}" -w`,
    );
  }
}

export const resolveCalDavCredentials =
  async (): Promise<CalDavCredentials> => {
    const appleId = process.env.ICLOUD_APPLE_ID;
    if (!appleId) throw new MissingCalDavCredentialsError();

    const password =
      process.env.ICLOUD_APP_PASSWORD || (await fromKeychain(appleId));
    if (!password) throw new MissingCalDavCredentialsError(appleId);

    return { appleId, password };
  };
