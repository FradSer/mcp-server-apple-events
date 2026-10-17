import { CLI_HELP, parseServerOptions } from './options.js';

describe('server startup options', () => {
  it('defaults to no server write confirmation', () => {
    expect(parseServerOptions([])).toEqual({
      requireWriteConfirmation: false,
      help: false,
    });
  });

  it('enables confirmation only with the explicit flag', () => {
    expect(parseServerOptions(['--require-write-confirmation'])).toEqual({
      requireWriteConfirmation: true,
      help: false,
    });
  });

  it.each([
    '--require-write-confirmation=false',
    '--require-write-confirmation=true',
    '--require-write-confirmation=1',
    '--no-require-write-confirmation',
    '--unknown',
    'false',
    '--help=false',
  ])('rejects invalid option %s', (arg) => {
    expect(() => parseServerOptions([arg])).toThrow();
  });

  it('rejects a separate value rather than silently interpreting it', () => {
    expect(() =>
      parseServerOptions(['--require-write-confirmation', 'false']),
    ).toThrow();
  });

  it.each([
    '--help',
    '-h',
  ])('supports %s without starting the server', (arg) => {
    expect(parseServerOptions([arg]).help).toBe(true);
    expect(CLI_HELP).toContain('--require-write-confirmation');
    expect(CLI_HELP).toContain('default: off');
    expect(CLI_HELP).toContain('invitations');
  });
});
