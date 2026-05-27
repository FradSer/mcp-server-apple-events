import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// `exec`-style command-string building was sensitive to shell metacharacters in
// derived paths (spaces, `$`, backticks). `execFile` with an argv array spawns
// the tool directly, so paths and tokens are passed through unchanged.
async function run(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, options);
    return { stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (error) {
    error.stdout = error.stdout ?? '';
    error.stderr = error.stderr ?? '';
    throw error;
  }
}

// macOS 26+ SDKs ship a Foundation.swiftinterface that older swiftc cannot parse,
// surfacing as `could not build module 'Foundation'` / `SDK is not supported by
// the compiler`. See: https://github.com/FradSer/mcp-server-apple-events/issues/85
const MIN_SWIFT_MAJOR_FOR_MACOS_26 = 6;
const MIN_SWIFT_MINOR_FOR_MACOS_26 = 3;

async function getSwiftVersion() {
  try {
    const { stdout } = await run('xcrun', ['swiftc', '--version']);
    const match = stdout.match(/Apple Swift version (\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return null;
    return {
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      raw: match[0].replace(/^Apple Swift version /, ''),
    };
  } catch {
    return null;
  }
}

async function getSdkVersion() {
  try {
    const { stdout } = await run('xcrun', ['--show-sdk-version']);
    const trimmed = stdout.trim();
    const [maj, min] = trimmed.split('.');
    return {
      major: Number.parseInt(maj, 10),
      minor: Number.parseInt(min ?? '0', 10),
      raw: trimmed,
    };
  } catch {
    return null;
  }
}

function isSdkTooNewForSwift(swift, sdk) {
  if (!swift || !sdk) return false;
  if (sdk.major < 26) return false;
  if (swift.major > MIN_SWIFT_MAJOR_FOR_MACOS_26) return false;
  if (swift.major < MIN_SWIFT_MAJOR_FOR_MACOS_26) return true;
  return swift.minor < MIN_SWIFT_MINOR_FOR_MACOS_26;
}

function printIncompatibilityRemediation(swift, sdk) {
  const swiftStr = swift ? swift.raw : 'unknown';
  const sdkStr = sdk ? sdk.raw : 'unknown';
  console.error(
    [
      '',
      `Error: Swift toolchain ${swiftStr} cannot build against the macOS ${sdkStr} SDK.`,
      `The macOS 26+ SDK requires Swift ${MIN_SWIFT_MAJOR_FOR_MACOS_26}.${MIN_SWIFT_MINOR_FOR_MACOS_26} or newer; older swiftc fails with`,
      `"could not build module 'Foundation'" because the SDK's Foundation.swiftinterface`,
      'uses availability markers older compilers do not understand.',
      '',
      'See: https://github.com/FradSer/mcp-server-apple-events/issues/85',
      '',
      'Fixes (pick one):',
      '  1. Install Xcode 26.x from the App Store (ships Swift 6.3+).',
      '  2. Update Command Line Tools to a version that ships Swift 6.3+:',
      '       softwareupdate --list',
      '       sudo softwareupdate -i "Command Line Tools for Xcode-<latest>"',
      '  3. If both Xcode and Command Line Tools are installed, point xcode-select',
      '     at the full Xcode that has the matching toolchain:',
      '       sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer',
      '',
    ].join('\n'),
  );
}

function looksLikeFoundationModuleMismatch(stderr) {
  if (!stderr) return false;
  return (
    /could not build module 'Foundation'/.test(stderr) ||
    /SDK is not supported by the compiler/.test(stderr) ||
    /module compiled with Swift [\d.]+ cannot be imported/.test(stderr)
  );
}

/**
 * Resolves the code-signing identity to use.
 *
 * Priority order:
 *   1. APPLE_SIGNING_IDENTITY env var (explicit override)
 *   2. First "Developer ID Application:" cert found in the login keychain
 *   3. Ad-hoc ("-") with a warning
 *
 * A Developer ID signature makes EventKitCLI the TCC-responsible process
 * regardless of which parent process spawned it, fixing Calendar permission
 * dialogs on OCLP Sequoia and macOS 26+.
 */
async function resolveSigningIdentity() {
  if (process.env.APPLE_SIGNING_IDENTITY) {
    return process.env.APPLE_SIGNING_IDENTITY;
  }

  try {
    const { stdout } = await run('security', [
      'find-identity',
      '-v',
      '-p',
      'codesigning',
    ]);
    const lines = stdout.split('\n');

    // Prefer Developer ID Application (trusted on all Macs) over Apple Development
    // (trusted only on the developer's own machine, but sufficient for local use).
    for (const prefix of ['Developer ID Application:', 'Apple Development:']) {
      const matches = lines.filter((line) => line.includes(prefix));
      if (matches.length === 1) {
        const m = matches[0].match(/"([^"]+)"/);
        if (m) return m[1];
      }
      if (matches.length > 1) {
        console.warn(`Multiple "${prefix}" certificates found in keychain.`);
        console.warn(
          'Set APPLE_SIGNING_IDENTITY to the exact certificate name to avoid ambiguity.',
        );
        break;
      }
    }
  } catch {
    // security binary unavailable — fall through to ad-hoc
  }

  console.warn(
    'No Apple code-signing certificate found. Using ad-hoc signing (-).',
  );
  console.warn(
    'Calendar TCC permission dialogs may be suppressed on OCLP Sequoia and macOS 26+.',
  );
  console.warn(
    'To fix this, set APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)".',
  );
  return '-';
}

async function main() {
  console.log('Building Swift binary for Apple Reminders MCP Server...');

  if (process.platform !== 'darwin') {
    console.error(
      'Error: This project requires macOS to compile Swift binaries.',
    );
    process.exit(1);
  }

  const [swift, sdk] = await Promise.all([getSwiftVersion(), getSdkVersion()]);
  if (!swift) {
    console.error('Error: Swift compiler (swiftc) not found via xcrun.');
    console.error(
      'Please install Xcode or Xcode Command Line Tools: xcode-select --install',
    );
    process.exit(1);
  }
  if (isSdkTooNewForSwift(swift, sdk)) {
    printIncompatibilityRemediation(swift, sdk);
    process.exit(1);
  }

  try {
    await run('xcrun', ['--find', 'lipo']);
  } catch (_error) {
    console.error(
      'Error: lipo not found. Required for universal binary creation.',
    );
    console.error(
      'Please install Xcode or Xcode Command Line Tools: xcode-select --install',
    );
    process.exit(1);
  }

  // Resolve paths relative to script location, not process.cwd()
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const projectRoot = path.resolve(__dirname, '..');
  const scriptDir = path.join(projectRoot, 'src', 'swift');
  const sourceFile = path.join(scriptDir, 'EventKitCLI.swift');
  const infoPlistFile = path.join(scriptDir, 'Info.plist');
  const entitlementsFile = path.join(scriptDir, 'EventKitCLI.entitlements');
  const binDir = path.join(projectRoot, 'bin');
  const outputFile = path.join(binDir, 'EventKitCLI');
  const arm64File = path.join(binDir, 'EventKitCLI-arm64');
  const x86File = path.join(binDir, 'EventKitCLI-x86_64');

  try {
    await fs.access(sourceFile);
  } catch (_error) {
    console.error(`Error: Source file not found: ${sourceFile}`);
    process.exit(1);
  }

  try {
    await fs.access(infoPlistFile);
  } catch (_error) {
    console.error(`Error: Info.plist not found: ${infoPlistFile}`);
    console.error(
      'Info.plist is required for EventKit permissions to work properly.',
    );
    process.exit(1);
  }

  try {
    await fs.access(entitlementsFile);
  } catch (_error) {
    console.error(`Error: Entitlements file not found: ${entitlementsFile}`);
    console.error(
      'Entitlements file is required for TCC permission dialogs on macOS 26+.',
    );
    process.exit(1);
  }

  await fs.mkdir(binDir, { recursive: true });

  // Build a universal (fat) binary containing both arm64 and x86_64 slices.
  // Each slice is compiled separately with its appropriate deployment target,
  // then merged via lipo. This ensures the same npm package works on both
  // Apple Silicon (arm64, macOS 11+) and Intel (x86_64, macOS 10.15+) Macs.
  // `xcrun -sdk macosx swiftc` keeps the toolchain and SDK xcode-select resolves
  // consistent. -Xlinker embeds Info.plist so macOS shows EventKit prompts.
  const frameworkArgs = ['-framework', 'EventKit', '-framework', 'Foundation'];
  const linkerArgs = [
    '-Xlinker',
    '-sectcreate',
    '-Xlinker',
    '__TEXT',
    '-Xlinker',
    '__info_plist',
    '-Xlinker',
    infoPlistFile,
  ];

  const slices = [
    { file: arm64File, target: 'arm64-apple-macos11.0', label: 'arm64' },
    { file: x86File, target: 'x86_64-apple-macos10.15', label: 'x86_64' },
  ];

  console.log(`Compiling ${sourceFile} (arm64 + x86_64)...`);

  try {
    // Slices are independent — compile in parallel to roughly halve build time.
    // `xcrun -sdk macosx swiftc` keeps the toolchain and SDK xcode-select
    // resolves consistent across both slices.
    const results = await Promise.all(
      slices.map((s) =>
        run('xcrun', [
          '-sdk',
          'macosx',
          'swiftc',
          '-target',
          s.target,
          '-o',
          s.file,
          sourceFile,
          ...frameworkArgs,
          ...linkerArgs,
        ]),
      ),
    );
    results.forEach(({ stdout, stderr }, i) => {
      if (stderr)
        console.warn(`${slices[i].label} compiler warnings:\n${stderr}`);
      if (stdout) console.log(stdout);
    });

    await run('xcrun', [
      'lipo',
      '-create',
      '-output',
      outputFile,
      arm64File,
      x86File,
    ]);

    await Promise.all([fs.unlink(arm64File), fs.unlink(x86File)]);

    console.log(
      `Compilation successful! Universal binary saved to ${outputFile}`,
    );

    await fs.chmod(outputFile, '755');
    console.log('Binary is now executable.');

    const signingIdentity = await resolveSigningIdentity();
    const isAdHoc = signingIdentity === '-';

    console.log(
      isAdHoc
        ? 'Signing with ad-hoc identity...'
        : `Signing with Developer ID: ${signingIdentity}`,
    );

    // --options runtime: Hardened Runtime, required on macOS 26+ for the TCC
    //   system to show calendar permission dialogs when the binary runs as a
    //   subprocess of a GUI application (e.g. Claude Desktop).
    // --timestamp: secure timestamp from Apple CA; included for Developer ID
    //   signatures to ensure long-term validity; omitted for ad-hoc (no CA).
    const codesignArgs = [
      '--force',
      '--sign',
      signingIdentity,
      '--options',
      'runtime',
      ...(isAdHoc ? [] : ['--timestamp']),
      '--entitlements',
      entitlementsFile,
      outputFile,
    ];
    const { stdout: csOut, stderr: csErr } = await run(
      'codesign',
      codesignArgs,
    );
    if (csErr) {
      console.warn(`codesign warnings:\n${csErr}`);
    }
    if (csOut) {
      console.log(csOut);
    }
    console.log(
      isAdHoc
        ? 'Binary signed (ad-hoc) with hardened runtime and entitlements.'
        : 'Binary signed with Developer ID, hardened runtime, and entitlements.',
    );
    console.log('Swift binary build complete!');
  } catch (error) {
    console.error('Compilation failed!');
    const stderr = error?.stderr ?? '';
    if (looksLikeFoundationModuleMismatch(stderr)) {
      printIncompatibilityRemediation(swift, sdk);
    }
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(
    'An unexpected error occurred during the build process:',
    error,
  );
  process.exit(1);
});
