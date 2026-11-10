import { parseArgs } from 'node:util';

export const CLI_HELP = `Usage: mcp-server-apple-events [options]

Options:
  --require-write-confirmation  Require a fresh MCP form for every write (default: off).
  --url-via-shortcut            Set reminder URLs through the AdvancedReminderEdit
                                Shortcut so they appear in Reminders.app's URL field
                                (default: off).
  -h, --help                    Show this help and exit.

By default, writes including deletions and attendee invitations execute without
server confirmation, including on hosts without MCP form elicitation. This removes
the per-write confirmation barrier against prompt injection. Host authorization
and macOS permissions still apply. With --require-write-confirmation, rejected,
cancelled, failed or unavailable confirmation blocks the write.

The confirmation flag takes no value and has no --no- form.
No environment variable controls this policy.

EventKit's reminder URL property is not the URL field Reminders.app displays;
only Shortcuts can write that field. With --url-via-shortcut, reminder creates
and updates that include a url let the bundled \`event\` CLI run the
AdvancedReminderEdit Shortcut (https://www.icloud.com/shortcuts/b578334075754da9ba6e50b501515808),
which finds the reminder by title and list. If the Shortcut is missing or
fails, the CLI falls back to the EventKit URL property.
`;

export function parseServerOptions(args: string[]): {
  requireWriteConfirmation: boolean;
  urlViaShortcut: boolean;
  help: boolean;
} {
  const { values } = parseArgs({
    args,
    options: {
      'require-write-confirmation': { type: 'boolean', default: false },
      'url-via-shortcut': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
    allowNegative: false,
  });
  return {
    requireWriteConfirmation: values['require-write-confirmation'],
    urlViaShortcut: values['url-via-shortcut'],
    help: values.help,
  };
}
