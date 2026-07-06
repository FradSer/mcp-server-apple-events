import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Use `execFile` with an argv array so paths containing shell metacharacters
// (spaces, `$`, backticks) reach the tool intact.
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

// macOS 26+ SDKs ship a Foundation.swiftinterface that older swiftc cannot
// parse, surfacing as `could not build module 'Foundation'` /
// `SDK is not supported by the compiler` (see issue #85). The vendored
// `event` package requires Swift 6.2+ (swift-tools-version in its
// Package.swift) and is compiled by the host's swiftc, so we still need the
// same minimum-version guard.
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
 * A Developer ID signature makes `event` the TCC-responsible process
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

// `event`'s Package.swift declares an SSH dependency
// (git@github.com:FradSer/apple-sync-kit.git). Most build hosts have no SSH
// key registered with GitHub, so a plain `swift build` fails resolving that
// dependency. `event`'s own CI works around this by rewriting SSH GitHub
// URLs to HTTPS for the duration of the git-fetch child process (see
// FradSer/event@bf34a4c, "Configure git to fetch SSH dependencies via
// HTTPS"). Do the same here via `GIT_CONFIG_*` env vars scoped only to the
// `swift build` child processes below — this never touches the invoking
// user's global ~/.gitconfig.
const SSH_TO_HTTPS_GIT_ENV = {
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'url.https://github.com/.insteadOf',
  GIT_CONFIG_VALUE_0: 'git@github.com:',
};

async function main() {
  console.log(
    'Building vendored `event` CLI (FradSer/event) for Apple Reminders MCP Server...',
  );

  if (process.platform !== 'darwin') {
    console.error('Error: This project requires macOS to compile `event`.');
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
  const eventPackagePath = path.join(projectRoot, 'vendor', 'event');
  const eventPackageManifest = path.join(eventPackagePath, 'Package.swift');
  const binDir = path.join(projectRoot, 'bin');
  const outputFile = path.join(binDir, 'event');

  // Run the independent pre-flight checks (toolchain probe, manifest access,
  // bin dir creation) concurrently so `pnpm install`'s postinstall hook
  // doesn't serialise them.
  const [swift, sdk, manifestExists] = await Promise.all([
    getSwiftVersion(),
    getSdkVersion(),
    fs.access(eventPackageManifest).then(
      () => true,
      () => false,
    ),
    fs.mkdir(binDir, { recursive: true }),
  ]);

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
  if (!manifestExists) {
    console.error(
      `Error: vendor/event/Package.swift not found at ${eventPackageManifest}`,
    );
    console.error(
      'The `event` source tree is vendored as a git submodule. Run:',
    );
    console.error('  git submodule update --init --recursive');
    process.exit(1);
  }

  console.log(
    `Compiling vendor/event in release mode (swift ${swift.raw}, sdk ${sdk?.raw ?? 'unknown'})...`,
  );

  // Build a universal (fat) binary containing both arm64 and x86_64 slices.
  // Modern SwiftPM (as of this Swift toolchain) has no public `--arch` flag
  // that emits a universal Mach-O from a single `swift build` invocation, so
  // each slice is built separately — pinned to `event`'s own deployment
  // target (`platforms: [.macOS(.v14)]` in vendor/event/Package.swift) via
  // `--triple`, with a dedicated `--scratch-path` so the two builds don't
  // clobber each other's `.build` cache — then merged with `lipo`. This
  // mirrors what the old EventKitCLI build (`swiftc -target ...` per slice +
  // `lipo -create`) did for the same reason.
  const gitEnv = { ...process.env, ...SSH_TO_HTTPS_GIT_ENV };
  const slices = [
    {
      triple: 'arm64-apple-macosx14.0',
      scratchPath: path.join(eventPackagePath, '.build-arm64'),
      label: 'arm64',
    },
    {
      triple: 'x86_64-apple-macosx14.0',
      scratchPath: path.join(eventPackagePath, '.build-x86_64'),
      label: 'x86_64',
    },
  ];

  let builtBinaries;
  try {
    // Slices are independent — build in parallel to roughly halve build time.
    const results = await Promise.all(
      slices.map((s) =>
        run(
          'swift',
          [
            'build',
            '-c',
            'release',
            '--package-path',
            eventPackagePath,
            '--scratch-path',
            s.scratchPath,
            '--triple',
            s.triple,
          ],
          { env: gitEnv },
        ),
      ),
    );
    results.forEach(({ stdout, stderr }, i) => {
      if (stderr)
        console.warn(`${slices[i].label} build warnings:\n${stderr}`);
      if (stdout) console.log(stdout);
    });

    // Ask SwiftPM for the actual release output directory per slice instead
    // of assuming a `.build/<triple>/release` layout, since that convention
    // is not a stable public contract.
    builtBinaries = await Promise.all(
      slices.map(async (s) => {
        const { stdout: binPathOut } = await run(
          'swift',
          [
            'build',
            '--show-bin-path',
            '-c',
            'release',
            '--package-path',
            eventPackagePath,
            '--scratch-path',
            s.scratchPath,
            '--triple',
            s.triple,
          ],
          { env: gitEnv },
        );
        return path.join(binPathOut.trim(), 'event');
      }),
    );

    await run('xcrun', [
      'lipo',
      '-create',
      '-output',
      outputFile,
      ...builtBinaries,
    ]);

    console.log(
      `Compilation successful! Universal binary saved to ${outputFile}`,
    );
  } catch (error) {
    console.error('Compilation failed!');
    const stderr = error?.stderr ?? '';
    if (looksLikeFoundationModuleMismatch(stderr)) {
      printIncompatibilityRemediation(swift, sdk);
    }
    console.error(error);
    process.exit(1);
  }

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
  //   system to attribute Reminders/Calendar permission dialogs to the host
  //   GUI app (e.g. Claude Desktop) that spawned the binary as a subprocess.
  // --timestamp: secure timestamp from Apple CA; included for Developer ID
  //   signatures to ensure long-term validity; omitted for ad-hoc (no CA).
  // No entitlements file is passed: `event` carries no embedded Info.plist
  //   of its own; the host process supplies the usage-description strings.
  try {
    const codesignArgs = [
      '--force',
      '--sign',
      signingIdentity,
      '--options',
      'runtime',
      ...(isAdHoc ? [] : ['--timestamp']),
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
        ? 'Binary signed (ad-hoc) with hardened runtime.'
        : 'Binary signed with Developer ID and hardened runtime.',
    );
  } catch (error) {
    console.error('codesign failed!');
    console.error(error);
    process.exit(1);
  }

  console.log('event CLI build complete!');
}

main().catch((error) => {
  console.error(
    'An unexpected error occurred during the build process:',
    error,
  );
  process.exit(1);
});
