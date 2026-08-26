# Best Practices

## Security

### Outbound Origin Pinning

This is the first outbound-network code in the server, and every request carries an HTTP Basic credential. The origin check is therefore the load-bearing control, not a formality.

| Vector | Example | Blocked By |
|--------|---------|------------|
| Plain http | `http://caldav.icloud.com/` | Protocol check before the host check |
| Foreign host | `https://evil.example/` | `ALLOWED_HOST` regex |
| Look-alike suffix | `https://notcaldav.icloud.com.evil.example/` | Anchored regex on `URL.hostname` |
| Userinfo smuggling | `https://caldav.icloud.com:443@evil.example/` | Userinfo rejected outright |
| Redirect off-allowlist | `302 Location: https://evil.example/` | `redirect: 'manual'` plus re-validation per hop |
| Redirect loop | endless `302` | `MAX_REDIRECTS` |

Parse with `URL.hostname`. Never split the authority as a string — a naive split reads the allowed host out of the userinfo while the request, and the `Authorization` header, goes elsewhere.

Resolve a relative `Location` against the current target *before* checking it, so a relative hop is validated rather than rejected as unparseable.

### Credential Handling

| Source | Allowed | Note |
|--------|---------|------|
| `ICLOUD_APPLE_ID` / `ICLOUD_APP_PASSWORD` env | Yes | First choice; lets a deployment inject |
| macOS Keychain, service `icloud-caldav-mcp` | Yes | Second choice; an interactive machine needs no environment |
| MCP client config / `mcpServers` env block | No | Config is never a credential store |
| Log lines, error messages, disk | No | Asserted by test |

Use an app-specific password, never the account password. The missing-credential error names both environment variables and the exact `security add-generic-password` invocation, so the fix does not require reading the source.

### Command and Script Injection

Two subprocess boundaries exist on these paths, and both use `execFile` with an argv array rather than a shell string:

```typescript
// SAFE: the whole script is one argument
execFile('osascript', ['-e', script], callback)
```

That protects the *process* boundary. It does not protect the *AppleScript string literal* boundary, because user text is interpolated into the script source. That is what `escapeAppleScriptString` is for:

1. Escape backslashes before quotes, so a trailing backslash cannot consume the escape of the quote that follows it.
2. Reject control characters outright rather than escaping them — AppleScript string literals cannot span lines, and a silently mangled title matches the wrong event.
3. Scan by code point, not with a regex literal: a character class containing literal control characters is itself flagged by the linter, and escaping around that obscures the intent. Include U+2028/U+2029, which terminate a line for parsing purposes though they are not C0 controls.

### Validation Depth

Match validation strictness to what the value is used for, and say so:

```typescript
// Deliberately permissive on the local part, strict on shape. This guards
// against a value that is obviously not an address reaching the script, not
// against every RFC 5322 edge case.
const EMAIL = /^[^\s@"\\]+@[^\s@"\\]+\.[^\s@"\\]+$/;
```

Address validation is shape-checking, escaping is the containment. Neither is asked to do the other's job.

---

## Correctness

### Read-Modify-Write Against Someone Else's Format

CalDAV's only write primitive is whole-resource replacement. On a scheduling-enabled collection, dropping an existing `ATTENDEE` is read by the server as attendee *removal* — which makes it send a CANCEL. A rewrite bug is therefore not a failed write, it is a silent mass-cancel.

Rules that follow:

1. **Preserve by default.** Operate on the unfolded line list and emit unknown lines unchanged. Do not normalize, reorder, or reserialize through an object model.
2. **Never rewrite an existing line you did not author.** Append; do not replace.
3. **Be component-aware.** `DTSTART` inside `VTIMEZONE` is a zone transition rule. `DTSTAMP` inside `VALARM` is not the event's stamp. Matching on property name alone corrupts both.
4. **Refuse what you do not model.** A resource with more than one `VEVENT` carries recurrence overrides; refuse it rather than mangle it.
5. **Fold in octets, not characters,** so a multi-byte character is never split across the 75-octet boundary.

### Timestamps That Must Match an Instance

An occurrence of a TZID-qualified series is identified by local wall time. Converting through UTC produces a stamp that matches no generated instance — and the failure is silent: the `EXDATE` is written, the PUT succeeds, and the occurrence stays put.

| Situation | Correct | Wrong |
|-----------|---------|-------|
| `DTSTART;TZID=America/New_York:20260921T090000` | `EXDATE;TZID=America/New_York:20260921T090000` | `EXDATE:20260921T130000Z` |
| `DTSTART:20260921T130000Z` | `EXDATE:20260921T130000Z` | `EXDATE;TZID=…:20260921T090000` |

Mirror `DTSTART`'s parameters verbatim and take the wall-clock portion of the input without offset arithmetic.

### Conditional Requests on Scheduling Resources

Per RFC 6638 §3.2.10, once a resource has attendees an inbound RSVP changes the ETag without changing anything the caller cares about. `If-Match` therefore produces spurious 412s. Prefer `If-Schedule-Tag-Match`, which only changes on scheduling-significant edits, and fall back to `If-Match` when the server returned no schedule tag.

### Reading SCHEDULE-STATUS

Per RFC 6638 §3.2.9, `1.0` is Pending, `1.1` is Sent — explicitly *without* confirmation of delivery — and `1.2` is Delivered. Treat `1.1` as "the server scheduled it", never as proof the recipient received anything. The value may be quoted and comma-separated, which a naive regex misses and then misreports as "not scheduled".

### Refusing Rather Than Guessing

Calendar.app's scripting interface can only be queried by title and start date, so two events sharing both are indistinguishable. Writing to the wrong one sends a real invitation for it. Return a sentinel from the script and map it to a typed error:

| Sentinel | Error | Meaning |
|----------|-------|---------|
| `NOTFOUND` | `EventNotFoundError` | No event matched |
| `AMBIGUOUS:n` | `AmbiguousEventError` | `n` events matched; refusing to pick |
| `OK:n` | — | `n` events updated |

The same principle governs the combined-update refusal: attendees and EventKit fields travel through different subsystems with no shared concurrency token, so a combined write has no defined ordering. Refuse it and name the two-call remedy rather than picking an order.

---

## Code Quality

### Wrapping execFile

Do not reach for `promisify` on a module you also mock. `child_process.execFile` carries a `util.promisify.custom` implementation that resolves to `{ stdout, stderr }`; a mocked module does not, so `promisify` silently resolves to the bare stdout string and the shape differs between test and production. An explicit wrapper keeps both identical.

### Comment Only to Justify

Per the repository guidelines, comment to justify architectural trade-offs or business rules — not to restate the code. Every non-obvious refusal in these modules carries the reason it exists, because the reason is the part that cannot be recovered from reading the code.

### Zero-Dependency Parsing

The repo ships no runtime dependencies. Two parsers were needed and both were kept narrow rather than pulling in a library:

| Need | Approach | Why it is sufficient |
|------|----------|----------------------|
| DAV multistatus | Tag-scoped regex scan | Only two fixed PROPFIND response shapes are consumed |
| iCalendar | Unfolded line list | Preservation, not comprehension, is the requirement |

Neither is a general parser and both say so in their header. Do not grow them into one.

---

## Testing

### Gating Tests With Real-World Side Effects

The repo's existing `src/e2e.test.ts` is ungated and hits real EventKit on every `pnpm test`. That precedent is deliberately **not** extended to anything that sends mail.

| Test | Gate | Reason |
|------|------|--------|
| `appleScriptAttendees.integration.test.ts` | `APPLESCRIPT_E2E=1` | Needs a GUI session and a TCC Automation grant, and sends a real invitation |
| `icalendar.corpus.test.ts` | `ICAL_CORPUS=<dir>` | The corpus is a user's actual calendar and cannot live in the repo |

Both skip silently, so CI and contributors without either are unaffected.

### Test Case Categories

1. **Happy Path**: Normal operation with valid inputs
2. **Preservation**: Round trips that must not lose or alter unknown properties
3. **Refusal**: Ambiguity, malformed stamps, unmodelled resources, combined updates
4. **Security**: Origin bypasses, userinfo smuggling, redirect escapes, escaping
5. **Non-disclosure**: The password does not appear in any error

### Regression Comments

Where a test exists because a specific bug was possible, say which one:

```typescript
// Regression: checking netloc.split(':') instead of hostname lets userinfo
// smuggle a foreign host past the allowlist.
it('rejects userinfo smuggling a foreign host past the check', () => {
```

---

## Maintenance

### Dependency Considerations

| Change | New Dependencies | Rationale |
|--------|------------------|-----------|
| CalDAV transport | None | Native `fetch` and `URL` |
| XML reading | None | Two fixed response shapes |
| iCalendar handling | None | Line-level preservation |
| AppleScript execution | None | `node:child_process` |
| Keychain read | None | `security` CLI |

### Breaking Changes

None. Both parameters are optional and additive; `calendar_events` behaves exactly as before when neither is supplied.

### Runtime Requirements Introduced

| Capability | Requires | Failure mode when absent |
|------------|----------|--------------------------|
| `attendees` | Calendar.app plus a TCC Automation grant | `osascript` error naming System Settings → Privacy & Security → Automation |
| `attendees` | A GUI session | Unsuitable for headless contexts; fails rather than hangs |
| `occurrenceDate` | iCloud credentials (env or Keychain) | `MissingCalDavCredentialsError` with setup instructions |
| `occurrenceDate` | An iCloud-synced event with an `externalId` | `CliUserError` explaining only synced events qualify |

Document each in both READMEs when the surface changes.

### Restoring the Direct-CalDAV Attendee Path

`icalendar.addAttendees` is implemented, tested, and unused. If Apple ever makes the AppleScript route untenable, the direct path is one wiring change away — but re-read the corpus-test header first: the mass-cancel failure mode it guards against is why the route was not taken.
