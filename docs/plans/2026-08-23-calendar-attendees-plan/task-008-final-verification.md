# Task 008: Final Verification

## Feature

Final Verification - Run the full test suite, the gated live paths, and the coverage check to confirm both capabilities are complete.

## BDD Scenario

```gherkin
Feature: Final Verification

Scenario: All tests pass
  Given all implementation tasks are complete
  When the full test suite is run
  Then all tests pass
  And no regressions are introduced

Scenario: Coverage thresholds met
  Given all tests pass
  When coverage is measured
  Then statements coverage >= 93%
  And branches coverage >= 78%
  And functions coverage >= 97%
  And lines coverage >= 94%

Scenario: Lint and typecheck pass
  Given all code changes are complete
  When pnpm check is run
  Then no lint errors
  And no type errors

Scenario: The release contract is untouched
  Given the package-release test pins the publish surface
  When the suite runs
  Then package-release.test.ts passes

Scenario: An invitation is actually delivered
  Given a real event and a real invitee address
  When attendees are added against live iCloud
  Then the resource carries SCHEDULE-STATUS=1.1
  And an iMIP message arrives from noreply@email.apple.com

Scenario: One occurrence is actually excepted
  Given a real recurring series
  When a later occurrence is excepted against live iCloud
  Then that occurrence disappears from Calendar.app
  And every other occurrence remains
```

## Files to Verify

| File | Verification |
|------|--------------|
| All test files | All tests pass |
| `coverage/` | Coverage thresholds met |
| `src/` | No lint/type errors |
| Live iCloud | Invitation delivered; one occurrence excepted |

## Implementation Notes

1. Run the full test suite:

   ```bash
   pnpm test
   ```

2. Verify coverage thresholds:

   ```bash
   pnpm test -- --coverage
   ```

3. Run lint and typecheck:

   ```bash
   pnpm check
   ```

4. Run the gated paths, which are skipped by default:

   ```bash
   APPLESCRIPT_E2E=1 pnpm test -- src/utils/appleScriptAttendees.integration.test.ts
   ICAL_CORPUS=/path/to/ics pnpm test -- src/utils/icalendar.corpus.test.ts
   ```

5. Verify delivery by hand, because no automated test can. Confirm `SCHEDULE-STATUS=1.1` on the resource *and* the arrival of real iMIP mail from `noreply@email.apple.com`. Per RFC 6638 §3.2.9, `1.1` is Sent without confirmation of delivery — the status alone is not proof anything arrived, which is why both checks are required.

6. Verify the occurrence exception in Calendar.app rather than only in the PUT response. A well-formed EXDATE that matches no instance writes successfully and excepts nothing; the only way to see that failure is to look at the series.

7. If any test fails:
   - Investigate the failure
   - Fix the issue or update the test as needed
   - Re-run verification

## Verification

```bash
# Full verification
pnpm test && pnpm check

# Expected: all tests pass, no lint/type errors
```

## Dependencies

- **depends-on**: All implementation tasks (001-007)

## Commit

```
test: verify attendee and occurrence capabilities complete
```

Note: This task may not require a commit if no changes are made.
