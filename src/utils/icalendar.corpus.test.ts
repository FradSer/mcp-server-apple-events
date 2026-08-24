/**
 * icalendar.corpus.test.ts
 * Invariant checks against a corpus of REAL CalDAV resources.
 *
 * Gated on ICAL_CORPUS pointing at a directory of .ics files, because the
 * corpus is a user's actual calendar and cannot live in the repo. Skipped
 * silently otherwise, so CI and contributors without a corpus are unaffected.
 *
 * The invariant that matters most: a read-modify-write must never drop an
 * existing ATTENDEE. CalDAV's only write primitive is whole-resource
 * replacement, and on a scheduling-enabled collection a dropped ATTENDEE is
 * read by the server as attendee removal — which makes it send a CANCEL. A
 * rewrite bug is therefore not a failed write, it is a silent mass-cancel.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exceptOccurrence, propName, serialize, unfold } from './icalendar.js';

const corpusDir = process.env.ICAL_CORPUS;
const files = corpusDir
  ? readdirSync(corpusDir).filter((f) => f.endsWith('.ics'))
  : [];

const describeCorpus = corpusDir && files.length > 0 ? describe : describe.skip;

// An arbitrary instant. exceptOccurrence does not verify that it names a real
// occurrence — the point here is what the rewrite preserves, not what it excepts.
const PROBE_INSTANT = '20991231T235900';

describeCorpus('real CalDAV corpus', () => {
  const load = (f: string) =>
    readFileSync(join(corpusDir as string, f), 'utf8');

  it('has a corpus worth testing', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('round-trips every resource without loss', () => {
    const broken: string[] = [];
    for (const f of files) {
      const once = unfold(load(f));
      if (JSON.stringify(unfold(serialize(once))) !== JSON.stringify(once)) {
        broken.push(f);
      }
    }
    expect(broken).toEqual([]);
  });

  it('emits no line over 75 octets for any resource', () => {
    const over: string[] = [];
    for (const f of files) {
      for (const line of serialize(unfold(load(f))).split('\r\n')) {
        if (Buffer.byteLength(line, 'utf8') > 75)
          over.push(`${f}: ${line.slice(0, 40)}`);
      }
    }
    expect(over).toEqual([]);
  });

  it('never drops or mutates an existing ATTENDEE when appending', () => {
    const damaged: string[] = [];
    for (const f of files) {
      const before = unfold(load(f));
      let after: string[];
      try {
        after = exceptOccurrence(before, PROBE_INSTANT);
      } catch {
        continue; // non-recurring and multi-VEVENT are refused by design
      }
      const attendeesBefore = before.filter((l) => propName(l) === 'ATTENDEE');
      for (const line of attendeesBefore) {
        if (!after.includes(line))
          damaged.push(`${f}: dropped ${line.slice(0, 60)}`);
      }
    }
    expect(damaged).toEqual([]);
  });

  it('preserves every non-SEQUENCE, non-DTSTAMP line when appending', () => {
    const lost: string[] = [];
    for (const f of files) {
      const before = unfold(load(f));
      let after: string[];
      try {
        after = exceptOccurrence(before, PROBE_INSTANT);
      } catch {
        continue;
      }
      for (const line of before) {
        const n = propName(line);
        if (n === 'SEQUENCE' || n === 'DTSTAMP') continue;
        if (!after.includes(line)) lost.push(`${f}: lost ${line.slice(0, 60)}`);
      }
    }
    expect(lost).toEqual([]);
  });

  it('always increases SEQUENCE when appending', () => {
    const wrong: string[] = [];
    for (const f of files) {
      const before = unfold(load(f));
      let after: string[];
      try {
        after = exceptOccurrence(before, PROBE_INSTANT);
      } catch {
        continue;
      }
      const value = (lines: string[]): string =>
        lines.find((l) => propName(l) === 'SEQUENCE')?.split(':')[1] ?? '0';
      const b = Number.parseInt(value(before), 10);
      const a = Number.parseInt(value(after), 10);
      if (!(a > b)) wrong.push(`${f}: ${b} -> ${a}`);
    }
    expect(wrong).toEqual([]);
  });

  it('refuses non-recurring and multi-VEVENT resources rather than mangling them', () => {
    let refused = 0;
    let accepted = 0;
    for (const f of files) {
      const lines = unfold(load(f));
      try {
        exceptOccurrence(lines, PROBE_INSTANT);
        accepted += 1;
      } catch {
        refused += 1;
      }
    }
    // Report the split so a corpus of all-refusals can't masquerade as a pass.
    expect(accepted).toBeGreaterThan(0);
    expect(accepted + refused).toBe(files.length);
  });
});
