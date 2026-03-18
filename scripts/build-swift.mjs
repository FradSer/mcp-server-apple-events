import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function main() {
  console.log('Building Swift binary for Apple Reminders MCP Server...');

  if (process.platform !== 'darwin') {
    console.error(
      'Error: This project requires macOS to compile Swift binaries.',
    );
    process.exit(1);
  }

  try {
    await execAsync('which swiftc');
  } catch (_error) {
    console.error('Error: Swift compiler (swiftc) not found.');
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

  // Use -Xlinker to embed Info.plist into the binary
  // This is required for macOS to show permission dialogs for EventKit access
  const compileCommand = `swiftc -o "${outputFile}" "${sourceFile}" -framework EventKit -framework Foundation -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "${infoPlistFile}"`;

  console.log(`Compiling ${sourceFile}...`);

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

    const codesignCommand = `codesign --force --sign - --entitlements "${entitlementsFile}" "${outputFile}"`;
    const { stdout: csOut, stderr: csErr } = await execAsync(codesignCommand);
    if (csErr) {
      console.warn(`codesign warnings:\n${csErr}`);
    }
    if (csOut) {
      console.log(csOut);
    }
    console.log('Binary signed with entitlements.');
    console.log('Swift binary build complete!');
  } catch (error) {
    console.error('Compilation failed!');
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
