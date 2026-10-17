import { parseArgs } from 'node:util';

export const CLI_HELP = `Usage: mcp-server-apple-events [options]

Options:
  --require-write-confirmation  Require a fresh MCP form for every write (default: off).
  -h, --help                    Show this help and exit.

By default, writes including deletions and attendee invitations execute without
server confirmation, including on hosts without MCP form elicitation. This removes
the per-write confirmation barrier against prompt injection. Host authorization
and macOS permissions still apply. With --require-write-confirmation, rejected,
cancelled, failed or unavailable confirmation blocks the write.

The confirmation flag takes no value and has no --no- form.
No environment variable controls this policy.
`;

export function parseServerOptions(args: string[]): {
  requireWriteConfirmation: boolean;
  help: boolean;
} {
  const { values } = parseArgs({
    args,
    options: {
      'require-write-confirmation': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
    allowNegative: false,
  });
  return {
    requireWriteConfirmation: values['require-write-confirmation'],
    help: values.help,
  };
}
