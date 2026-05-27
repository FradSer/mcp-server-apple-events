import { readFileSync } from 'node:fs';
import path from 'node:path';

const buildScriptPath = path.resolve(process.cwd(), 'scripts/build-swift.mjs');

describe('build-swift.mjs code signing', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('signs binary with hardened runtime for macOS 26+ TCC compatibility', () => {
    expect(buildScript).toMatch(/'--options'\s*,\s*\n?\s*'runtime'/);
  });

  it('embeds Info.plist into binary via linker', () => {
    expect(buildScript).toMatch(/'__info_plist'/);
    expect(buildScript).toMatch(/infoPlistFile/);
  });

  it('applies entitlements during code signing', () => {
    expect(buildScript).toMatch(/'--entitlements'/);
    expect(buildScript).toMatch(/entitlementsFile/);
  });
});

describe('build-swift.mjs toolchain resolution', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('invokes swiftc via xcrun so SDK and toolchain stay consistent', () => {
    expect(buildScript).toMatch(/xcrun/);
    expect(buildScript).toMatch(/'-sdk'\s*,\s*\n?\s*'macosx'/);
    expect(buildScript).toMatch(/'swiftc'/);
  });
});

describe('build-swift.mjs toolchain/SDK compatibility (issue #85)', () => {
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

describe('build-swift.mjs code-signing identity', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('resolves signing identity from APPLE_SIGNING_IDENTITY env var', () => {
    expect(buildScript).toMatch(/APPLE_SIGNING_IDENTITY/);
  });

  it('auto-detects Developer ID Application and Apple Development certificates from keychain', () => {
    expect(buildScript).toMatch(/Developer ID Application/);
    expect(buildScript).toMatch(/Apple Development/);
    expect(buildScript).toMatch(/'find-identity'/);
  });

  it('falls back to ad-hoc signing when no Developer ID is found', () => {
    expect(buildScript).toMatch(/resolveSigningIdentity/);
    // ad-hoc sentinel
    expect(buildScript).toMatch(/return\s+['"]-['"]/);
  });

  it('includes secure timestamp flag for Developer ID signatures', () => {
    expect(buildScript).toMatch(/--timestamp/);
    expect(buildScript).toMatch(/isAdHoc/);
  });
});

describe('build-swift.mjs universal binary', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('builds arm64 slice with correct deployment target', () => {
    expect(buildScript).toMatch(/'arm64-apple-macos11\.0'/);
  });

  it('builds x86_64 slice with correct deployment target', () => {
    expect(buildScript).toMatch(/'x86_64-apple-macos10\.15'/);
  });

  it('merges slices into universal binary using lipo', () => {
    expect(buildScript).toMatch(/'lipo'/);
    expect(buildScript).toMatch(/'-create'/);
  });

  it('cleans up thin slice intermediates after lipo merge', () => {
    expect(buildScript).toMatch(/EventKitCLI-arm64/);
    expect(buildScript).toMatch(/EventKitCLI-x86_64/);
  });

  it('invokes external binaries via execFile (argv array, no shell interpolation)', () => {
    // execFile is used instead of exec, preventing shell injection through
    // signing-identity or path values.
    expect(buildScript).toMatch(/execFile/);
    expect(buildScript).not.toMatch(/\bpromisify\(exec\)/);
  });
});
