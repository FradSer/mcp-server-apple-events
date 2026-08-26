/**
 * appleScriptAttendees.ts
 * Adds attendees to an existing Calendar.app event, which causes iCloud to send
 * the invitation.
 *
 * Why not EventKit: `EKCalendarItem.attendees` is `readonly` in the macOS SDK
 * and there is no attendee-mutation or invitation API anywhere in the framework
 * — Apple models invitation delivery as the calendar server's job, which is why
 * EventKit exposes a read-only `EKParticipantScheduleStatus` to observe it. The
 * `event` CLI this server otherwise uses is a pure EventKit wrapper and
 * inherits that limitation.
 *
 * Calendar.app's scripting interface does allow it. The sdef marks attendee
 * properties `access="r"`, which governs mutating an existing attendee, but
 * `make new attendee ... with properties` is a creation and is permitted.
 * Writing the attendee locally makes iCloud's CalDAV server perform RFC 6638
 * scheduling and deliver the invitation.
 *
 * Trade-off accepted: this requires Calendar.app and a TCC Automation grant, so
 * it is unsuitable for headless contexts. It buys the absence of any credential
 * and, more importantly, lets Calendar.app own the read-modify-write. CalDAV's
 * only write primitive is whole-resource replacement, where dropping an
 * existing ATTENDEE reads as removal and makes the server send cancellations —
 * a class of failure that does not exist on this path.
 */

import { execFile } from 'node:child_process';
import { VALIDATION } from './constants.js';
import { CliUserError } from './errorHandling.js';

/**
 * Wraps execFile explicitly rather than with promisify. `child_process.execFile`
 * carries a `util.promisify.custom` implementation that resolves to
 * `{ stdout, stderr }`; a mocked module does not, so promisify would silently
 * resolve to the bare stdout string and the shape would differ between test and
 * production. An explicit wrapper keeps both identical.
 */
const runOsascript = (
  script: string,
): Promise<{ stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (error, stdout, stderr) => {
      if (error) {
        Object.assign(error, { stderr: String(stderr ?? '') });
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });

/**
 * Scans by code point rather than with a regex literal: a character class
 * containing literal control characters is itself flagged by the linter, and
 * escaping around that would obscure the intent. U+2028/U+2029 are included
 * because they terminate a line for parsing purposes even though they are not
 * C0 controls.
 */
const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint < 0x20 ||
      codePoint === 0x7f ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    ) {
      return true;
    }
  }
  return false;
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Deliberately permissive on the local part, strict on shape. This guards
// against a value that is obviously not an address reaching the script, not
// against every RFC 5322 edge case.
const EMAIL = VALIDATION.ATTENDEE_EMAIL_PATTERN;

/**
 * Extends CliUserError so the message survives production error formatting.
 * Every failure on this path is something the caller can act on — an invalid
 * address, a missing or ambiguous event, an ungranted Automation permission —
 * and a bare Error is sanitized to "System error occurred", which names none
 * of them.
 */
export class AppleScriptAttendeeError extends CliUserError {}
export class EventNotFoundError extends AppleScriptAttendeeError {}
export class AmbiguousEventError extends AppleScriptAttendeeError {}

export interface AttendeeInput {
  email: string;
  name?: string;
}

export interface AddAttendeesInput {
  calendarName: string;
  summary: string;
  /** ISO date (YYYY-MM-DD) of the event's start, used with the title to locate it. */
  date: string;
  attendees: AttendeeInput[];
}

/**
 * Escapes a value for inclusion in an AppleScript double-quoted string.
 *
 * Backslashes are escaped before quotes, so an input ending in a backslash
 * cannot consume the escape of the quote that follows it. Control characters
 * are rejected outright rather than escaped: AppleScript string literals cannot
 * span lines, and a silently mangled title would match the wrong event.
 */
export const escapeAppleScriptString = (value: string): string => {
  if (hasControlCharacter(value)) {
    throw new AppleScriptAttendeeError(
      'Value contains a control character and cannot be used in an AppleScript string.',
    );
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

/**
 * Builds the AppleScript. Returns sentinel strings rather than acting on an
 * ambiguous match: Calendar.app can only be queried by title and start date, so
 * two events sharing both are indistinguishable, and writing to the wrong one
 * would send a real invitation for it.
 */
export const buildAttendeeScript = (input: AddAttendeesInput): string => {
  if (!ISO_DATE.test(input.date)) {
    throw new AppleScriptAttendeeError(
      `Date must be ISO (YYYY-MM-DD); received "${input.date}".`,
    );
  }
  for (const attendee of input.attendees) {
    if (!EMAIL.test(attendee.email)) {
      throw new AppleScriptAttendeeError(
        `"${attendee.email}" is not a valid email address.`,
      );
    }
  }

  const [year, month, day] = input.date.split('-');
  const calendar = escapeAppleScriptString(input.calendarName);
  const summary = escapeAppleScriptString(input.summary);

  const makeLines = input.attendees
    .map((attendee) => {
      const email = escapeAppleScriptString(attendee.email);
      const name = escapeAppleScriptString(attendee.name ?? attendee.email);
      return (
        '        make new attendee at end of attendees with properties ' +
        `{email:"${email}", display name:"${name}"}`
      );
    })
    .join('\n');

  return `tell application "Calendar"
  tell calendar "${calendar}"
    set dayStart to current date
    set hours of dayStart to 0
    set minutes of dayStart to 0
    set seconds of dayStart to 0
    set year of dayStart to ${Number(year)}
    set month of dayStart to ${Number(month)}
    set day of dayStart to ${Number(day)}
    set dayEnd to dayStart + (24 * 60 * 60)
    set matches to (every event whose summary is "${summary}" and start date is greater than or equal to dayStart and start date is less than dayEnd)
    if (count of matches) is 0 then
      return "NOTFOUND"
    end if
    if (count of matches) is greater than 1 then
      return "AMBIGUOUS:" & (count of matches)
    end if
    tell item 1 of matches
${makeLines}
    end tell
    return "OK:1"
  end tell
end tell`;
};

export const addAttendeesToEvent = async (
  input: AddAttendeesInput,
): Promise<{ updated: number }> => {
  if (input.attendees.length === 0) {
    throw new AppleScriptAttendeeError('Provide at least one attendee to add.');
  }
  const script = buildAttendeeScript(input);

  let stdout: string;
  try {
    // execFile with an argv array — the script is one argument, never a shell
    // string, so no shell metacharacter can be interpreted.
    const result = await runOsascript(script);
    stdout = result.stdout;
  } catch (error) {
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error
        ? String((error as { stderr: unknown }).stderr)
        : '';
    throw new AppleScriptAttendeeError(
      `osascript failed${stderr ? `: ${stderr.trim()}` : '.'} ` +
        'Calendar automation access may not be granted ' +
        '(System Settings → Privacy & Security → Automation).',
    );
  }

  const output = stdout.trim();
  if (output === 'NOTFOUND') {
    throw new EventNotFoundError(
      `No event titled "${input.summary}" found on ${input.date} in calendar "${input.calendarName}".`,
    );
  }
  if (output.startsWith('AMBIGUOUS:')) {
    const count = output.split(':')[1] ?? '?';
    throw new AmbiguousEventError(
      `${count} events titled "${input.summary}" start on ${input.date} in ` +
        `"${input.calendarName}". Refusing to guess which one to invite to.`,
    );
  }
  if (output.startsWith('OK:')) {
    return { updated: Number(output.split(':')[1] ?? 1) };
  }
  throw new AppleScriptAttendeeError(`Unexpected osascript output: ${output}`);
};
