import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve(process.cwd(), 'check-permissions.sh');

it('checks EventKit directly even when a legacy shim is executable', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'event-permissions-'));
  const bin = path.join(directory, 'bin');
  const log = path.join(directory, 'calls.log');
  mkdirSync(bin);
  try {
    writeFileSync(
      path.join(bin, 'event'),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$EVENT_TEST_LOG"\necho "[]"\n',
      { mode: 0o755 },
    );
    writeFileSync(
      path.join(bin, 'event-disclaim'),
      '#!/bin/sh\necho "legacy shim executed" >&2\nexit 99\n',
      { mode: 0o755 },
    );
    // Never access real Automation or EventKit data in this regression test.
    writeFileSync(
      path.join(bin, 'osascript'),
      '#!/bin/sh\necho "Test list"\n',
      { mode: 0o755 },
    );

    execFileSync('/bin/bash', [script], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        EVENT_TEST_LOG: log,
      },
      stdio: 'pipe',
    });

    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      'reminders list --json',
      'calendar list --json',
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
