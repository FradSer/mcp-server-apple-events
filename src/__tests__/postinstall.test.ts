import { readFileSync } from 'node:fs';
import path from 'node:path';

const postinstallScriptPath = path.resolve(
  process.cwd(),
  'scripts/postinstall.mjs',
);

describe('postinstall.mjs skip-if-prebuilt check', () => {
  const postinstallScript = readFileSync(postinstallScriptPath, 'utf8');

  it('checks for pre-built, executable bin/event and bin/event-disclaim before attempting a build', () => {
    expect(postinstallScript).toMatch(
      /path\.join\(\s*projectRoot\s*,\s*'bin'\s*,\s*'event'\s*\)/,
    );
    expect(postinstallScript).toMatch(
      /path\.join\(\s*projectRoot\s*,\s*'bin'\s*,\s*'event-disclaim'\s*\)/,
    );
    expect(postinstallScript).toMatch(/fs\.access\([\s\S]*?constants\.X_OK/);
  });

  it('exits immediately when the pre-built binaries are found (npm install path)', () => {
    expect(postinstallScript).toMatch(
      /Pre-built `event` binaries found, skipping source build\./,
    );
    expect(postinstallScript).toMatch(/process\.exit\(0\)/);
  });

  it('falls through to a source build only when a binary is missing', () => {
    expect(postinstallScript).toMatch(/await buildEvent\(\)/);
  });
});

describe('postinstall.mjs platform guard', () => {
  const postinstallScript = readFileSync(postinstallScriptPath, 'utf8');

  it('skips the build entirely on non-macOS platforms', () => {
    expect(postinstallScript).toMatch(/process\.platform\s*!==\s*'darwin'/);
    expect(postinstallScript).toMatch(/non-macOS platform/);
  });
});

describe('postinstall.mjs source-build fallback guidance', () => {
  const postinstallScript = readFileSync(postinstallScriptPath, 'utf8');

  it('spawns build-event.mjs via execFile with an argv array', () => {
    expect(postinstallScript).toMatch(/execFile/);
    expect(postinstallScript).toMatch(/build-event\.mjs/);
  });

  it('tells git-clone users how to initialize the vendor/event submodule on failure', () => {
    expect(postinstallScript).toMatch(
      /git submodule update --init --recursive/,
    );
  });

  it('exits gracefully (code 0) even when the build fails, so install never hard-fails', () => {
    expect(postinstallScript).toMatch(
      /catch\(\(error\)\s*=>\s*\{[\s\S]*?process\.exit\(0\)/,
    );
  });
});
