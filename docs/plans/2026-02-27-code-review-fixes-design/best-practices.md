# Best Practices

## Security

### SSRF Protection Patterns

When validating URLs for SSRF prevention, consider these bypass vectors:

#### IPv4 Bypasses

| Vector | Example | Blocked By |
|--------|---------|------------|
| Decimal IP | `2130706433` | Regex doesn't match, validation fails |
| Hex IP | `0x7f.0.0.1` | Regex doesn't match |
| Octal IP | `0177.0.0.1` | Regex doesn't match |
| Private ranges | `192.168.x.x`, `10.x.x.x` | CIDR block in regex |

#### IPv6 Bypasses

| Vector | Example | Pattern |
|--------|---------|---------|
| Loopback | `::1`, `[::1]` | `\[\]?::1\]?` |
| Unspecified | `::`, `[::]` | `\[\]?::\]?` |
| Link-local | `fe80::1` | `fe[89ab][0-9a-f]:` |
| Unique local | `fc00::1` | `fc00::/7` (future enhancement) |

#### Cloud Metadata Endpoints

| Provider | IP/Host | Blocked By |
|----------|---------|------------|
| AWS | `169.254.169.254` | Explicit IP block |
| Azure | `169.254.169.254` | Explicit IP block |
| GCP | `metadata.google.internal` | Explicit host block |
| Alibaba | `100.100.100.200` | Explicit IP block |

### Argument Injection Prevention

The current architecture is safe from argument injection:

1. **execFile vs exec**: Using `execFile()` which separates command from arguments
2. **Array arguments**: Each argument is a separate array element
3. **Swift ArgumentParser**: Parses arguments safely without shell interpretation

```typescript
// SAFE: Args are separate elements
await executeCli(['--title', 'user input; rm -rf /'])
// Results in: EventKitCLI --title "user input; rm -rf /"
// NOT in: EventKitCLI --title user input; rm -rf /
```

### Error Message Sanitization

Rules for error message exposure:

| Error Type | Development | Production |
|------------|-------------|------------|
| ValidationError | Show details | Show details |
| CliUserError | Show details | Show details |
| Permission Error | Show details | Show details |
| System Error | Show details | Generic message |

---

## Performance

### Filter Optimization

With Swift-only filtering for core filters:

| Filter | Latency Impact | Recommendation |
|--------|---------------|----------------|
| showCompleted | Low (Swift) | Keep in Swift |
| filterList | Low (Swift) | Keep in Swift |
| search | Medium (Swift) | Keep in Swift |
| dueWithin | Medium (Swift) | Keep in Swift |
| priority | Low (JS) | Keep in JS |
| tags | Low (JS) | Keep in JS |

### Locale Detection Caching

The Intl.Locale API is fast, but for high-frequency calls:

```typescript
// Cache locale detection
let cachedWeekStart: number | null = null;

function getFirstDayOfWeek(): number {
  if (cachedWeekStart !== null) return cachedWeekStart;

  try {
    const locale = new Intl.Locale(undefined);
    const firstDay = locale.weekInfo?.firstDay ?? 7;
    cachedWeekStart = firstDay === 7 ? 0 : firstDay;
  } catch {
    cachedWeekStart = 0;
  }

  return cachedWeekStart;
}
```

---

## Code Quality

### JSDoc Documentation Pattern

For security-sensitive code, include security notes in JSDoc:

```typescript
/**
 * Executes the EventKitCLI binary for native macOS EventKit operations
 *
 * ## Argument Injection Safety
 *
 * This function uses `execFile()` (not `exec()`) which executes the binary
 * directly without spawning a shell. Arguments are passed as a separate array,
 * preventing shell injection attacks.
 *
 * @template T - Expected return type from the Swift CLI
 * @param {string[]} args - Array of arguments to pass to the CLI
 * @returns {Promise<T>} Parsed JSON result from the CLI
 */
```

### Test Naming Convention

Follow BDD naming pattern:

```typescript
// Good: Describes behavior
it('should return Sunday as week start for en-US locale')

// Good: Describes edge case
it('should fallback to Sunday when Intl.Locale is unavailable')

// Avoid: Implementation detail
it('returns correct date')
```

### Environment Variable Handling

Always handle undefined env vars safely:

```typescript
// Good: Explicit undefined check with default
const isProduction = process.env.NODE_ENV === 'production';

// Better: Handle multiple truthy values
function isDevelopmentMode(): boolean {
  const nodeEnv = process.env.NODE_ENV?.toLowerCase();
  return nodeEnv === 'development' || nodeEnv === 'dev';
}
```

---

## Testing

### Coverage Requirements

| Component | Statements | Branches | Functions | Lines |
|-----------|------------|----------|-----------|-------|
| Overall | 96% | 90% | 98% | 96% |
| reminderRepository.ts | 95% | 90% | 100% | 95% |
| dateUtils.ts | 95% | 90% | 100% | 95% |
| schemas.ts | 95% | 90% | 100% | 95% |
| errorHandling.ts | 95% | 90% | 100% | 95% |

### Test Case Categories

1. **Happy Path**: Normal operation with valid inputs
2. **Edge Cases**: Boundary conditions (empty arrays, null values)
3. **Error Cases**: Invalid inputs, missing required fields
4. **Security Cases**: Injection attempts, SSRF bypasses
5. **Locale Cases**: Different locales (en-US, zh-CN, ar-SA)

### Mock Patterns

```typescript
// Mock factory for repositories
const createMockRepository = () => ({
  findReminders: jest.fn(),
  findReminderById: jest.fn(),
  createReminder: jest.fn(),
  updateReminder: jest.fn(),
  deleteReminder: jest.fn(),
});

// Mock Intl.Locale for locale tests
const mockLocale = (firstDay: number) => {
  const originalLocale = Intl.Locale;
  Intl.Locale = class extends originalLocale {
    get weekInfo() {
      return { firstDay };
    }
  } as typeof Intl.Locale;
  return () => { Intl.Locale = originalLocale; };
};
```

---

## Maintenance

### Dependency Considerations

| Change | New Dependencies | Rationale |
|--------|------------------|-----------|
| Locale-aware week start | None | Use native Intl API |
| SSRF protection | None | Enhanced regex |
| Error handling | None | Native Node.js |

### Breaking Changes

None of these fixes introduce breaking API changes:
- `showCompleted` default changes to match documented behavior
- Filter simplification is internal, not API-visible
- URL validation becomes stricter (improvement, not breakage)

### Documentation Updates Required

1. **CLAUDE.md**: No changes needed (architecture unchanged)
2. **README.md**: Verify `showCompleted` default documentation
3. **README.zh-CN.md**: Verify `showCompleted` default documentation
4. **JSDoc**: Add security notes to `cliExecutor.ts`
