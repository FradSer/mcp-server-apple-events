import { readFileSync } from 'node:fs';
import path from 'node:path';

const notarizeScriptPath = path.resolve(process.cwd(), 'scripts/notarize.mjs');

describe('notarize.mjs', () => {
  const notarizeScript = readFileSync(notarizeScriptPath, 'utf8');

  it('targets the event binary, not the retired EventKitCLI one', () => {
    expect(notarizeScript).toMatch(/path\.join\(\s*binDir\s*,\s*'event'\s*\)/);
    expect(notarizeScript).not.toMatch(/EventKitCLI/);
  });

  it('skips missing notarization env vars only outside CI', () => {
    expect(notarizeScript).toMatch(/APPLE_ID/);
    expect(notarizeScript).toMatch(/APPLE_APP_PASSWORD/);
    expect(notarizeScript).toMatch(/APPLE_TEAM_ID/);
    expect(notarizeScript).toMatch(/process\.env\.CI/);
    expect(notarizeScript).toMatch(/process\.exit\(0\)/);
    expect(notarizeScript).toMatch(/process\.exit\(1\)/);
  });

  it('uses ditto to create a zip archive for submission', () => {
    expect(notarizeScript).toMatch(/execFileAsync\(\s*'ditto'/);
    expect(notarizeScript).toMatch(/'--keepParent'/);
    expect(notarizeScript).toMatch(/event\.zip/);
  });

  it('submits via xcrun notarytool with --wait flag', () => {
    expect(notarizeScript).toMatch(/'notarytool'/);
    expect(notarizeScript).toMatch(/'submit'/);
    expect(notarizeScript).toMatch(/'--wait'/);
  });

  it('checks submission result for Accepted status', () => {
    expect(notarizeScript).toMatch(/status.*Accepted/i);
  });

  it('cleans up the zip file after submission', () => {
    expect(notarizeScript).toMatch(/unlink.*zip/i);
  });

  it('exits with error when notarization is not accepted', () => {
    expect(notarizeScript).toMatch(/process\.exit\(1\)/);
  });

  it('passes credentials via execFile argv (no shell interpolation)', () => {
    // Password must not be interpolated into a shell command string where it
    // would be exposed to word splitting or leak through shell tracing.
    expect(notarizeScript).toMatch(/execFile/);
    expect(notarizeScript).not.toMatch(/\bpromisify\(exec\)/);
  });
});
