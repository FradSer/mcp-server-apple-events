import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('built CLI', () => {
  it.each([
    '--help',
    '-h',
  ])('prints %s and exits without a transport or warning', (arg) => {
    const result = spawnSync(process.execPath, ['dist/index.js', arg], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('default: off');
    expect(result.stderr).toBe('');
  });

  it.each([
    { args: ['--require-write-confirmation=false'] },
    { args: ['--unknown'] },
    { args: ['--no-require-write-confirmation'] },
    {
      args: ['--require-write-confirmation', '--no-require-write-confirmation'],
    },
    {
      args: ['--no-require-write-confirmation', '--require-write-confirmation'],
    },
    { args: ['--no-help'] },
  ])('rejects $args on stderr without starting MCP', ({ args }) => {
    const result = spawnSync(process.execPath, ['dist/index.js', ...args], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Invalid server options:');
    expect(result.stderr).not.toContain('write confirmation is disabled');
  });

  it.each([
    false,
    true,
  ])('passes requireWriteConfirmation=%s to the running server', async (required) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        'dist/index.js',
        ...(required ? ['--require-write-confirmation'] : []),
      ],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'cli-test', version: '1' });
    let diagnostic = '';
    transport.stderr?.on('data', (data: Buffer) => {
      diagnostic += data.toString();
    });
    try {
      await client.connect(transport);
      expect(client.getInstructions()).toContain(
        required
          ? 'Every write requires explicit user confirmation'
          : 'Server write confirmation is disabled',
      );
      // An invalid payload exercises the selected policy without account access.
      const result = await client.callTool({
        name: 'reminders_tasks',
        arguments: { action: 'create' },
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).toContain(
        required ? 'confirmation' : 'title',
      );
      expect(diagnostic.includes('write confirmation is disabled')).toBe(
        !required,
      );
    } finally {
      await client.close();
    }
  });
});
