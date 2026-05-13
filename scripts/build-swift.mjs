import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

// macOS 26+ SDKs ship a Foundation.swiftinterface that older swiftc cannot parse,
// surfacing as `could not build module 'Foundation'` / `SDK is not supported by
// the compiler`. See: https://github.com/FradSer/mcp-server-apple-events/issues/85
const MIN_SWIFT_MAJOR_FOR_MACOS_26 = 6;
const MIN_SWIFT_MINOR_FOR_MACOS_26 = 3;

async function getSwiftVersion() {
  try {
    const { stdout } = await execAsync('xcrun swiftc --version');
    const match = stdout.match(/Apple Swift version (\d+)\.(\d+)(?:\.(\d+))?/);
    if (!match) return null;
    return {
      major: Number.parseInt(match[1], 10),
      minor: Number.parseInt(match[2], 10),
      patch: match[3] ? Number.parseInt(match[3], 10) : 0,
      raw: match[0].replace(/^Apple Swift version /, ''),
    };
  } catch {
    return null;
  }
}

async function getSdkVersion() {
  try {
    const { stdout } = await execAsync('xcrun --show-sdk-version');
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

function swiftArchForHost() {
  // Swift target triples use `arm64` and `x86_64`; Node reports `arm64` and `x64`.
  return process.arch === 'arm64' ? 'arm64' : 'x86_64';
}

async function main() {
  console.log('Building Swift binary for Apple Reminders MCP Server...');

  if (process.platform !== 'darwin') {
    console.error(
      'Error: This project requires macOS to compile Swift binaries.',
    );
    process.exit(1);
  }

  try {
    await execAsync('xcrun --find swiftc');
  } catch (_error) {
    console.error('Error: Swift compiler (swiftc) not found via xcrun.');
    console.error(
      'Please install Xcode or Xcode Command Line Tools: xcode-select --install',
    );
    process.exit(1);
  }

  const swift = await getSwiftVersion();
  const sdk = await getSdkVersion();
  if (isSdkTooNewForSwift(swift, sdk)) {
    printIncompatibilityRemediation(swift, sdk);
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

  // Pin deployment target to macOS 13.0 — the lowest the Swift source supports
  // via its `requestAccess(to: .reminder)` legacy branch. Pinning keeps the
  // build deterministic across SDK versions and avoids defaulting to the host
  // SDK's target, which on macOS 26 makes the macOS-14 fallback path appear
  // unreachable. Use `xcrun -sdk macosx swiftc` so the toolchain and SDK that
  // `xcode-select` resolves are used consistently.
  const target = `${swiftArchForHost()}-apple-macosx13.0`;
  // Use -Xlinker to embed Info.plist into the binary
  // This is required for macOS to show permission dialogs for EventKit access
  const compileCommand = `xcrun -sdk macosx swiftc -target ${target} -o "${outputFile}" "${sourceFile}" -framework EventKit -framework Foundation -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "${infoPlistFile}"`;

  console.log(`Compiling ${sourceFile} (target ${target})...`);

  try {
    const { stdout, stderr } = await execAsync(compileCommand);
    if (stderr) {
      console.warn(`Swift compiler warnings:\n${stderr}`);
    }
    if (stdout) {
      console.log(stdout);
    }

    console.log(`Compilation successful! Binary saved to ${outputFile}`);

    await fs.chmod(outputFile, '755');
    console.log('Binary is now executable.');

    // --options runtime enables Hardened Runtime, required on macOS 26+ for
    // the TCC system to show calendar permission dialogs when the binary
    // runs as a subprocess of a GUI application (e.g. Claude Desktop).
    const codesignCommand = `codesign --force --sign - --options runtime --entitlements "${entitlementsFile}" "${outputFile}"`;
    const { stdout: csOut, stderr: csErr } = await execAsync(codesignCommand);
    if (csErr) {
      console.warn(`codesign warnings:\n${csErr}`);
    }
    if (csOut) {
      console.log(csOut);
    }
    console.log('Binary signed with hardened runtime and entitlements.');
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
