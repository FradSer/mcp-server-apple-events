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
