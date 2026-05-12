import { readFileSync } from 'node:fs';
import path from 'node:path';

const buildScriptPath = path.resolve(process.cwd(), 'scripts/build-swift.mjs');

describe('build-swift.mjs code signing', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('signs binary with hardened runtime for macOS 26+ TCC compatibility', () => {
    expect(buildScript).toMatch(/codesign.*--options\s+runtime/);
  });

  it('embeds Info.plist into binary via linker', () => {
    expect(buildScript).toMatch(/-Xlinker.*__info_plist/);
  });

  it('applies entitlements during code signing', () => {
    expect(buildScript).toMatch(/codesign.*--entitlements/);
  });
});

describe('build-swift.mjs toolchain resolution', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('invokes swiftc via xcrun so SDK and toolchain stay consistent', () => {
    expect(buildScript).toMatch(/xcrun\s+(?:-sdk\s+macosx\s+)?swiftc/);
  });

  it('pins -target to macosx13.0 (lowest supported deployment)', () => {
    // Target triple may be built via a variable; just assert both the flag and
    // the deployment string are present in the script.
    expect(buildScript).toMatch(/-target/);
    expect(buildScript).toMatch(/apple-macosx13\.0/);
  });

  it('derives swift target arch from the host (process.arch)', () => {
    expect(buildScript).toMatch(/process\.arch/);
  });
});

describe('build-swift.mjs toolchain/SDK compatibility (issue #85)', () => {
  const buildScript = readFileSync(buildScriptPath, 'utf8');

  it('detects Swift toolchain older than macOS 26 SDK requires before compile', () => {
    // Pre-flight check must parse swiftc version and compare against SDK major.
    expect(buildScript).toMatch(/Apple Swift version/);
    expect(buildScript).toMatch(/--show-sdk-version/);
  });

  it('surfaces actionable remediation when SDK is too new for the toolchain', () => {
    // Error message must mention the path to fix (xcode-select / Xcode / CLT) and link to issue #85.
    expect(buildScript).toMatch(/issues\/85/);
    expect(buildScript).toMatch(/xcode-select|Xcode|Command Line Tools/);
  });

  it('augments compile-failure output when stderr matches known Foundation incompat patterns', () => {
    expect(buildScript).toMatch(
      /could not build module 'Foundation'|SDK is not supported by the compiler/,
    );
  });
});
