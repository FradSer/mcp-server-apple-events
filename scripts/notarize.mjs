import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const binDir = path.join(projectRoot, 'bin');
const outputFile = path.join(binDir, 'EventKitCLI');
const zipFile = path.join(binDir, 'EventKitCLI.zip');

async function main() {
  try {
    await fs.access(outputFile, fs.constants.F_OK);
  } catch {
    console.error(`Error: Binary not found at ${outputFile}`);
    console.error('Run `pnpm run build:swift` first.');
    process.exit(1);
  }

  const appleId = process.env.APPLE_ID;
  const appPassword = process.env.APPLE_APP_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appPassword || !teamId) {
    const message =
      'APPLE_ID, APPLE_APP_PASSWORD, and APPLE_TEAM_ID must all be set.';
    if (process.env.CI) {
      console.error(`Notarization failed: ${message}`);
      process.exit(1);
    }

    console.warn(`Notarization skipped: ${message}`);
    console.warn(
      'For local builds this is expected. Set these variables to enable notarization.',
    );
    process.exit(0);
  }

  try {
    await execFileAsync('xcrun', ['notarytool', '--version']);
  } catch {
    console.error(
      'Error: xcrun notarytool not found. Install Xcode 13+ or Xcode Command Line Tools.',
    );
    process.exit(1);
  }

  console.log('Creating zip archive for notarization...');
  await execFileAsync('ditto', [
    '-c',
    '-k',
    '--keepParent',
    outputFile,
    zipFile,
  ]);

  console.log(
    'Submitting to Apple notary service (this may take a few minutes)...',
  );
  // Pass credentials via argv array (not shell interpolation) so special
  // characters are safe and the password isn't parsed by any shell.
  // Note: argv is still visible via `ps` on the host — on an isolated CI
  // runner this is acceptable; for local use prefer `xcrun notarytool
  // store-credentials` + `--keychain-profile` instead.
  let submissionOutput = '';
  try {
    const { stdout } = await execFileAsync('xcrun', [
      'notarytool',
      'submit',
      zipFile,
      '--apple-id',
      appleId,
      '--password',
      appPassword,
      '--team-id',
      teamId,
      '--wait',
    ]);
    submissionOutput = stdout;
  } catch (error) {
    // notarytool exits non-zero when submission is rejected; capture the output
    const execError = error;
    submissionOutput = execError.stdout ?? '';
    if (!submissionOutput) {
      console.error('Notarization submission failed:', execError.message);
      throw error;
    }
  } finally {
    // Always clean up the zip regardless of outcome
    await fs.unlink(zipFile).catch(() => {});
  }

  console.log('Notarization response:\n', submissionOutput);

  if (/status:\s+Accepted/i.test(submissionOutput)) {
    console.log('Notarization accepted.');
    // Stapling is not supported for standalone binaries (only .app, .dmg, .pkg).
    // Gatekeeper performs an online check at first launch for non-stapled binaries.
    // npm-installed files carry no quarantine xattr, so the online check is a
    // no-op in practice, but the notarization ticket is still useful for any
    // future distribution channel that applies quarantine.
  } else {
    console.error(
      'Notarization was NOT accepted. See response above for details.',
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('An unexpected error occurred during notarization:', error);
  process.exit(1);
});
