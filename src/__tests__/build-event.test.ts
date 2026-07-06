import { readFileSync } from 'node:fs';
import path from 'node:path';

const buildScriptPath = path.resolve(process.cwd(), 'scripts/build-event.mjs');

describe('build-event.mjs build pipeline', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('builds the vendored event package via swift build -c release', () => {
    expect(buildScript).toMatch(
      /swift[\s\S]*?'build'[\s\S]*?'-c'[\s\S]*?'release'/,
    );
  });

  it('targets vendor/event via --package-path', () => {
    expect(buildScript).toMatch(/--package-path/);
    expect(buildScript).toMatch(/vendor[\s\S]{0,40}event/);
  });

  it('emits the binary at bin/event with executable permission', () => {
    expect(buildScript).toMatch(/path\.join\(\s*binDir\s*,\s*'event'\s*\)/);
    expect(buildScript).toMatch(/fs\.chmod\([\s\S]*?'755'/);
  });
});

describe('build-event.mjs code signing', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('signs binary with hardened runtime for macOS 26+ TCC compatibility', () => {
    expect(buildScript).toMatch(/codesign[\s\S]*?--options[\s\S]*?runtime/);
  });

  it('does not pass --entitlements (event has no embedded Info.plist)', () => {
    expect(buildScript).not.toMatch(/--entitlements/);
  });
});

describe('build-event.mjs toolchain/SDK compatibility (issue #85)', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('detects Swift toolchain older than macOS 26 SDK requires before compile', () => {
    expect(buildScript).toMatch(/Apple Swift version/);
    expect(buildScript).toMatch(/--show-sdk-version/);
  });

  it('surfaces actionable remediation when SDK is too new for the toolchain', () => {
    expect(buildScript).toMatch(/issues\/85/);
    expect(buildScript).toMatch(/xcode-select|Xcode|Command Line Tools/);
  });

  it('augments compile-failure output when stderr matches known Foundation incompat patterns', () => {
    expect(buildScript).toMatch(
      /could not build module 'Foundation'|SDK is not supported by the compiler/,
    );
  });
});

describe('build-event.mjs guardrails', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('refuses to run on non-macOS platforms', () => {
    expect(buildScript).toMatch(/process\.platform[\s\S]*?darwin/);
  });

  it('prompts to initialize submodules when Package.swift is missing', () => {
    expect(buildScript).toMatch(/git submodule update --init/);
  });
});

describe('build-event.mjs universal binary', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('builds both arm64 and x86_64 slices', () => {
    expect(buildScript).toMatch(/arm64-apple-macosx/);
    expect(buildScript).toMatch(/x86_64-apple-macosx/);
  });

  it('builds each slice with an isolated --scratch-path', () => {
    expect(buildScript).toMatch(/--scratch-path/);
  });

  it('merges the slices with lipo -create', () => {
    expect(buildScript).toMatch(/lipo[\s\S]*?-create/);
  });

  it('requires lipo to be available before compiling', () => {
    expect(buildScript).toMatch(/xcrun[\s\S]*?--find[\s\S]*?lipo/);
  });
});

describe('build-event.mjs code-signing identity resolution', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('prefers APPLE_SIGNING_IDENTITY when set', () => {
    expect(buildScript).toMatch(/APPLE_SIGNING_IDENTITY/);
  });

  it('looks up a Developer ID Application certificate in the keychain', () => {
    expect(buildScript).toMatch(/find-identity/);
    expect(buildScript).toMatch(/Developer ID Application:/);
  });

  it('falls back to ad-hoc signing with a warning when no certificate is found', () => {
    expect(buildScript).toMatch(/ad-hoc/i);
    expect(buildScript).toMatch(/console\.warn/);
  });
});

describe('build-event.mjs SSH-to-HTTPS git dependency workaround', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('rewrites SSH GitHub URLs to HTTPS scoped to the swift build child process', () => {
    expect(buildScript).toMatch(/GIT_CONFIG_COUNT/);
    expect(buildScript).toMatch(/GIT_CONFIG_KEY_0/);
    expect(buildScript).toMatch(/GIT_CONFIG_VALUE_0/);
    expect(buildScript).toMatch(/git@github\.com:/);
  });

  it('passes the git env override to the swift build invocations, not globally', () => {
    expect(buildScript).toMatch(/\{\s*env:\s*gitEnv\s*\}/);
    expect(buildScript).not.toMatch(/--global/);
  });
});
