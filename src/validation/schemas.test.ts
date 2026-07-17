/**
 * schemas.test.ts
 * Tests for validation schemas
 */

import { z } from 'zod/v3';
import {
  CreateCalendarEventSchema,
  CreateReminderListSchema,
  CreateReminderSchema,
  DeleteCalendarEventSchema,
  DeleteReminderSchema,
  ReadCalendarEventsSchema,
  ReadCalendarsSchema,
  ReadRemindersSchema,
  RequiredListNameSchema,
  SafeDateSchema,
  SafeNoteSchema,
  SafeTextSchema,
  SafeUrlSchema,
  UpdateCalendarEventSchema,
  UpdateReminderListSchema,
  UpdateReminderSchema,
  ValidationError,
  validateInput,
} from './schemas.js';

describe('ValidationSchemas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Base validation schemas', () => {
    describe('SafeTextSchema', () => {
      it('should validate safe text', () => {
        expect(() => SafeTextSchema.parse('Valid text')).not.toThrow();
        expect(() =>
          SafeTextSchema.parse('Text with numbers 123'),
        ).not.toThrow();
        expect(() =>
          SafeTextSchema.parse('Text with punctuation!'),
        ).not.toThrow();
      });

      it('should reject empty text', () => {
        expect(() => SafeTextSchema.parse('')).toThrow();
      });

      it('should reject text that is too long', () => {
        const longText = 'a'.repeat(201);
        expect(() => SafeTextSchema.parse(longText)).toThrow();
      });

      it('should reject text with invalid characters', () => {
        expect(() =>
          SafeTextSchema.parse('Text with control char \x00'),
        ).toThrow();
        // Note: \u200E (Right-to-left mark) is allowed by SAFE_TEXT_PATTERN as it's in the Unicode range
      });

      it('should accept emoji in titles', () => {
        // Emoji live above U+FFFF (supplementary planes) and must be accepted
        expect(() =>
          SafeTextSchema.parse('\uD83D\uDCBC Remote Job Hunt'),
        ).not.toThrow();
        expect(() => SafeTextSchema.parse('\uD83D\uDCCB Tasks')).not.toThrow();
        expect(() =>
          SafeTextSchema.parse('\uD83D\uDED2 Buy List'),
        ).not.toThrow();
        expect(() =>
          SafeTextSchema.parse('\uD83C\uDF93 Graduation'),
        ).not.toThrow();
      });

      it('should accept supplementary-plane non-emoji characters', () => {
        // U+20000 is a supplementary CJK character \u2014 also above U+FFFF
        expect(() => SafeTextSchema.parse('\u{20000}')).not.toThrow();
      });

      it('should still reject bidirectional control characters', () => {
        // These are used in visual spoofing attacks and must stay blocked
        expect(() => SafeTextSchema.parse('\u202A')).toThrow(); // Left-to-right embedding
        expect(() => SafeTextSchema.parse('\u202E')).toThrow(); // Right-to-left override
        expect(() => SafeTextSchema.parse('\u2066')).toThrow(); // Left-to-right isolate
        expect(() => SafeTextSchema.parse('\u2069')).toThrow(); // Pop directional isolate
      });
    });

    describe('SafeNoteSchema', () => {
      it('should validate optional safe notes', () => {
        expect(() => SafeNoteSchema.parse(undefined)).not.toThrow();
        expect(() => SafeNoteSchema.parse('Valid note')).not.toThrow();
      });

      it('should reject notes that are too long', () => {
        const longNote = 'a'.repeat(20001);
        expect(() => SafeNoteSchema.parse(longNote)).toThrow();
      });

      it('should allow multiline notes', () => {
        const multilineNote = 'Line 1\nLine 2\r\nLine 3';
        expect(() => SafeNoteSchema.parse(multilineNote)).not.toThrow();
      });

      it('should accept emoji and special symbols in notes', () => {
        // Previously blocked by the U+FFFF cutoff or overly strict ASCII pattern
        expect(() =>
          SafeNoteSchema.parse('Email: user@example.com'),
        ).not.toThrow();
        expect(() =>
          SafeNoteSchema.parse('Skills: A+, Network+'),
        ).not.toThrow();
        expect(() =>
          SafeNoteSchema.parse(
            'Testing patched build with emoji. Skills: A+, Network+.',
          ),
        ).not.toThrow();
      });

      it('should use custom fieldName in error messages', () => {
        // SafeNoteSchema uses 'Note' as fieldName
        const longText = 'a'.repeat(20001);
        try {
          SafeNoteSchema.parse(longText);
          expect(true).toBe(false); // Should throw
        } catch (error) {
          // Error message should use custom 'Note' fieldName
          expect((error as Error).message).toContain('Note');
        }
      });
    });

    describe('RequiredListNameSchema', () => {
      it('should validate required list names', () => {
        expect(() => RequiredListNameSchema.parse('Work')).not.toThrow();
        expect(() => RequiredListNameSchema.parse('Personal')).not.toThrow();
      });

      it('should reject empty list names', () => {
        expect(() => RequiredListNameSchema.parse('')).toThrow();
      });

      it('should reject list names that are too long', () => {
        const longName = 'a'.repeat(101);
        expect(() => RequiredListNameSchema.parse(longName)).toThrow();
      });

      it('should accept emoji-prefixed list names', () => {
        // Real-world Apple Reminders list names that were previously unreachable
        expect(() =>
          RequiredListNameSchema.parse('💼 Remote Job Hunt'),
        ).not.toThrow();
        expect(() => RequiredListNameSchema.parse('📋 Tasks')).not.toThrow();
        expect(() => RequiredListNameSchema.parse('🛒 Buy List')).not.toThrow();
        expect(() =>
          RequiredListNameSchema.parse('🥦 Groceries'),
        ).not.toThrow();
        expect(() => RequiredListNameSchema.parse('💍 Wedding')).not.toThrow();
      });
    });

    describe('SafeDateSchema', () => {
      it('should validate ISO date formats', () => {
        expect(() => SafeDateSchema.parse('2024-01-15')).not.toThrow();
        expect(() => SafeDateSchema.parse('2024-01-15 10:30:00')).not.toThrow();
        expect(() =>
          SafeDateSchema.parse('2024-01-15T10:30:00Z'),
        ).not.toThrow();
        expect(() => SafeDateSchema.parse('0005-01-01')).not.toThrow();
      });

      it('should accept Feb 29 in leap years', () => {
        // Regression: an earlier implementation seeded the validity check
        // from year 0 (mapped to 1900, a non-leap year), so every Feb 29
        // overflowed to Mar 1 and was rejected even for real leap years.
        expect(() => SafeDateSchema.parse('2024-02-29')).not.toThrow();
        expect(() => SafeDateSchema.parse('2000-02-29')).not.toThrow();
        expect(() => SafeDateSchema.parse('2028-02-29')).not.toThrow();
        expect(() => SafeDateSchema.parse('2024-02-29 23:59:59')).not.toThrow();
      });

      it('should reject Feb 29 in non-leap years', () => {
        expect(() => SafeDateSchema.parse('2023-02-29')).toThrow();
        expect(() => SafeDateSchema.parse('1900-02-29')).toThrow();
        expect(() => SafeDateSchema.parse('2100-02-29')).toThrow();
      });

      it('should accept undefined dates', () => {
        expect(() => SafeDateSchema.parse(undefined)).not.toThrow();
      });

      it('should reject invalid date formats', () => {
        expect(() => SafeDateSchema.parse('01/15/2024')).toThrow();
        expect(() => SafeDateSchema.parse('not-a-date')).toThrow();
        expect(() => SafeDateSchema.parse('2024-13-45')).toThrow();
        expect(() => SafeDateSchema.parse('2024-02-30')).toThrow();
        expect(() => SafeDateSchema.parse('2024-00-15')).toThrow();
        expect(() => SafeDateSchema.parse('2024-01-00')).toThrow();
        expect(() => SafeDateSchema.parse('2024-01-15oops')).toThrow();
        expect(() => SafeDateSchema.parse('2024-01-15 25:00:00')).toThrow();
      });
    });

    describe('SafeUrlSchema', () => {
      it('should validate safe URLs', () => {
        expect(() => SafeUrlSchema.parse('https://example.com')).not.toThrow();
        expect(() =>
          SafeUrlSchema.parse('https://api.example.com/v1/users'),
        ).not.toThrow();
      });

      it('should accept undefined URLs', () => {
        expect(() => SafeUrlSchema.parse(undefined)).not.toThrow();
      });

      it('should reject URLs that are too long', () => {
        const longUrl = `https://example.com/${'a'.repeat(500)}`;
        expect(() => SafeUrlSchema.parse(longUrl)).toThrow();
      });

      it('should reject private/internal URLs', () => {
        expect(() => SafeUrlSchema.parse('http://127.0.0.1')).toThrow();
        expect(() => SafeUrlSchema.parse('http://192.168.1.1')).toThrow();
        expect(() => SafeUrlSchema.parse('http://10.0.0.1')).toThrow();
        expect(() => SafeUrlSchema.parse('http://localhost')).toThrow();
      });

      it('should reject invalid URL formats', () => {
        expect(() => SafeUrlSchema.parse('not-a-url')).toThrow();
        expect(() => SafeUrlSchema.parse('')).toThrow();
      });

      it('should accept custom app-deep-link URI schemes (issue #101)', () => {
        // EventKit's EKReminder.url accepts any NSURL, so the MCP layer must
        // not be stricter than the underlying API.
        expect(() =>
          SafeUrlSchema.parse('obsidian://open?vault=MyVault&file=my-note'),
        ).not.toThrow();
        expect(() =>
          SafeUrlSchema.parse('shortcuts://run-shortcut?name=MyShortcut'),
        ).not.toThrow();
        expect(() =>
          SafeUrlSchema.parse('bear://x-callback-url/open-note?id=123'),
        ).not.toThrow();
        expect(() => SafeUrlSchema.parse('tel:+1234567890')).not.toThrow();
        expect(() =>
          SafeUrlSchema.parse('mailto:user@example.com'),
        ).not.toThrow();
        expect(() =>
          SafeUrlSchema.parse('omnifocus:///add?name=Task'),
        ).not.toThrow();
      });

      it('should reject URLs containing whitespace or control chars', () => {
        expect(() => SafeUrlSchema.parse('https://example.com/ a')).toThrow();
        expect(() =>
          SafeUrlSchema.parse('https://example.com/\nfoo'),
        ).toThrow();
        expect(() =>
          SafeUrlSchema.parse('https://example.com/\tfoo'),
        ).toThrow();
        expect(() =>
          SafeUrlSchema.parse('https://example.com/\rfoo'),
        ).toThrow();
        expect(() =>
          SafeUrlSchema.parse('https://example.com/\x00foo'),
        ).toThrow();
        expect(() =>
          SafeUrlSchema.parse('obsidian://open?file=my note'),
        ).toThrow();
      });

      describe('SSRF Protection', () => {
        describe('IPv4 loopback protection', () => {
          it('should block 127.0.0.1', () => {
            expect(() =>
              SafeUrlSchema.parse('http://127.0.0.1/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('https://127.0.0.1/api'),
            ).toThrow();
          });

          it('should block 127.0.0.1 with port', () => {
            expect(() =>
              SafeUrlSchema.parse('http://127.0.0.1:8080/admin'),
            ).toThrow();
          });

          it('should block 127.0.1.1 (Debian/Ubuntu default)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://127.0.1.1/admin'),
            ).toThrow();
          });

          it('should block entire 127.0.0.0/8 range', () => {
            expect(() =>
              SafeUrlSchema.parse('http://127.1.1.1/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://127.255.255.255/admin'),
            ).toThrow();
          });
        });

        describe('IPv6 loopback protection', () => {
          it('should block ::1 without brackets', () => {
            expect(() => SafeUrlSchema.parse('http://::1/admin')).toThrow();
          });

          it('should block ::1 with brackets', () => {
            expect(() => SafeUrlSchema.parse('http://[::1]/admin')).toThrow();
          });

          it('should block ::1 with port', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[::1]:8080/admin'),
            ).toThrow();
          });

          it('should block :: (unspecified address)', () => {
            expect(() => SafeUrlSchema.parse('http://::/admin')).toThrow();
            expect(() => SafeUrlSchema.parse('http://[::]/admin')).toThrow();
          });

          it('should block 0:0:0:0:0:0:0:1 (full ::1)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[0:0:0:0:0:0:0:1]/admin'),
            ).toThrow();
          });
        });

        describe('Cloud metadata endpoint protection', () => {
          it('should block AWS metadata endpoint', () => {
            expect(() =>
              SafeUrlSchema.parse('http://169.254.169.254/latest/meta-data/'),
            ).toThrow();
          });

          it('should block AWS metadata endpoint with HTTPS', () => {
            expect(() =>
              SafeUrlSchema.parse('https://169.254.169.254/latest/meta-data/'),
            ).toThrow();
          });

          it('should block Alibaba Cloud metadata endpoint', () => {
            expect(() =>
              SafeUrlSchema.parse('http://100.100.100.200/latest/meta-data/'),
            ).toThrow();
          });

          it('should block GCP metadata hostname', () => {
            expect(() =>
              SafeUrlSchema.parse(
                'http://metadata.google.internal/computeMetadata/v1/',
              ),
            ).toThrow();
          });

          it('should block Azure metadata endpoint', () => {
            expect(() =>
              SafeUrlSchema.parse('http://169.254.169.254/metadata/instance'),
            ).toThrow();
          });
        });

        describe('IPv4 link-local protection', () => {
          it('should block 169.254.1.1', () => {
            expect(() =>
              SafeUrlSchema.parse('http://169.254.1.1/resource'),
            ).toThrow();
          });

          it('should block entire 169.254.0.0/16 range', () => {
            expect(() =>
              SafeUrlSchema.parse('http://169.254.0.1/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://169.254.255.255/admin'),
            ).toThrow();
          });
        });

        describe('IPv6 link-local protection', () => {
          it('should block fe80::1 without brackets', () => {
            expect(() =>
              SafeUrlSchema.parse('http://fe80::1/resource'),
            ).toThrow();
          });

          it('should block fe80::1 with brackets', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[fe80::1]/resource'),
            ).toThrow();
          });

          it('should block entire fe80::/10 range', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[fe80::ffff:ffff:ffff:ffff]/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://[febf::ffff]/admin'),
            ).toThrow();
          });

          it('should block fc00::/7 unique local (ULA)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[fc00::1]/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://[fd00::1]/admin'),
            ).toThrow();
          });
        });

        describe('IPv4-mapped IPv6 protection', () => {
          // WHATWG URL normalises [::ffff:127.0.0.1] to [::ffff:7f00:1], so the
          // dotted-quad form never reaches the blocklist. Decode the trailing
          // two hextets and run them through the IPv4 blocklist.
          it('should block ::ffff:127.0.0.1 loopback (dotted-quad input)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[::ffff:127.0.0.1]/admin'),
            ).toThrow();
          });

          it('should block ::ffff:7f00:1 loopback (canonical hex form)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[::ffff:7f00:1]/admin'),
            ).toThrow();
          });

          it('should block ::ffff:a9fe:a9fe (AWS metadata 169.254.169.254)', () => {
            expect(() =>
              SafeUrlSchema.parse(
                'http://[::ffff:a9fe:a9fe]/latest/meta-data/',
              ),
            ).toThrow();
          });

          it('should block ::ffff:c0a8:1 (192.168.0.1 private)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[::ffff:c0a8:1]/admin'),
            ).toThrow();
          });

          it('should not block ::ffff:0808:0808 (8.8.8.8 public)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[::ffff:0808:0808]/api'),
            ).not.toThrow();
          });
        });

        describe('NAT64 prefix protection (RFC 6052)', () => {
          // 64:ff9b::/96 is the well-known NAT64 prefix. On NAT64-active
          // networks (default on iOS cellular and many enterprise networks)
          // these addresses are routed to the embedded IPv4 by the gateway,
          // so they're an SSRF vector even though the host itself doesn't
          // speak IPv4. Block them the same way ::ffff:* is blocked.
          it('should block 64:ff9b::7f00:1 (loopback via NAT64)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[64:ff9b::7f00:1]/admin'),
            ).toThrow();
          });

          it('should block 64:ff9b::a9fe:a9fe (AWS metadata via NAT64)', () => {
            expect(() =>
              SafeUrlSchema.parse(
                'http://[64:ff9b::a9fe:a9fe]/latest/meta-data/',
              ),
            ).toThrow();
          });

          it('should block 64:ff9b::c0a8:1 (192.168.0.1 via NAT64)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[64:ff9b::c0a8:1]/admin'),
            ).toThrow();
          });

          it('should not block 64:ff9b::0808:0808 (8.8.8.8 via NAT64)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[64:ff9b::0808:0808]/api'),
            ).not.toThrow();
          });
        });

        describe('IPv6 documentation prefix', () => {
          it('should block 2001:db8::/32 range', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[2001:db8::1]/admin'),
            ).toThrow();
          });
        });

        describe('Private network protection', () => {
          it('should block 192.168.0.0/16', () => {
            expect(() =>
              SafeUrlSchema.parse('http://192.168.0.1/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://192.168.255.255/admin'),
            ).toThrow();
          });

          it('should block 10.0.0.0/8', () => {
            expect(() =>
              SafeUrlSchema.parse('http://10.0.0.1/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://10.255.255.255/admin'),
            ).toThrow();
          });

          it('should block 172.16.0.0/12', () => {
            expect(() =>
              SafeUrlSchema.parse('http://172.16.0.1/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://172.31.255.255/admin'),
            ).toThrow();
          });

          it('should not block 172.32.0.1 (outside private range)', () => {
            expect(() =>
              SafeUrlSchema.parse('http://172.32.0.1/admin'),
            ).not.toThrow();
          });
        });

        describe('Reserved and special addresses', () => {
          it('should block 0.0.0.0', () => {
            expect(() => SafeUrlSchema.parse('http://0.0.0.0/admin')).toThrow();
          });

          it('should block 224.0.0.0/4 multicast', () => {
            expect(() =>
              SafeUrlSchema.parse('http://224.0.0.1/admin'),
            ).toThrow();
          });

          it('should block ff00::/8 IPv6 multicast', () => {
            expect(() =>
              SafeUrlSchema.parse('http://[ff00::1]/admin'),
            ).toThrow();
          });
        });

        describe('Public URLs allowed', () => {
          it('should allow example.com', () => {
            expect(() =>
              SafeUrlSchema.parse('https://example.com/page'),
            ).not.toThrow();
          });

          it('should allow api.example.com subdomain', () => {
            expect(() =>
              SafeUrlSchema.parse('https://api.example.com/v1/users'),
            ).not.toThrow();
          });

          it('should allow public IP addresses', () => {
            expect(() =>
              SafeUrlSchema.parse('https://1.1.1.1/api'),
            ).not.toThrow();
            expect(() =>
              SafeUrlSchema.parse('https://8.8.8.8/resolve'),
            ).not.toThrow();
          });

          it('should allow IPv6 public addresses', () => {
            expect(() =>
              SafeUrlSchema.parse(
                'https://[2606:2800:220:1:248:1893:25c8:1946]/',
              ),
            ).not.toThrow();
          });

          it('should allow URLs with paths and query strings', () => {
            expect(() =>
              SafeUrlSchema.parse('https://example.com/api/v1/users?limit=10'),
            ).not.toThrow();
          });

          it('should allow URLs with ports', () => {
            expect(() =>
              SafeUrlSchema.parse('https://example.com:8443/api'),
            ).not.toThrow();
          });
        });

        describe('Hostname-based bypass protection', () => {
          it('should block localhost', () => {
            expect(() =>
              SafeUrlSchema.parse('http://localhost/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('https://localhost:3000/api'),
            ).toThrow();
          });

          it('should block localhost.localdomain', () => {
            expect(() =>
              SafeUrlSchema.parse('http://localhost.localdomain/admin'),
            ).toThrow();
          });

          it('should block local.internal variants', () => {
            expect(() => SafeUrlSchema.parse('http://local/admin')).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://internal/admin'),
            ).toThrow();
          });
        });

        describe('Protocol restrictions', () => {
          it('should reject dangerous protocols regardless of host', () => {
            expect(() => SafeUrlSchema.parse('file:///etc/passwd')).toThrow();
            expect(() => SafeUrlSchema.parse('javascript:alert(1)')).toThrow();
            expect(() => SafeUrlSchema.parse('vbscript:msgbox("x")')).toThrow();
            expect(() =>
              SafeUrlSchema.parse('data:text/html,<script>alert(1)</script>'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('jar:http://evil.com!/'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('dict://127.0.0.1:11211/'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('gopher://example.com/'),
            ).toThrow();
          });

          it('should allow http, https, and arbitrary app schemes', () => {
            expect(() =>
              SafeUrlSchema.parse('http://example.com'),
            ).not.toThrow();
            expect(() =>
              SafeUrlSchema.parse('https://example.com'),
            ).not.toThrow();
            // ftp is now accepted — the model can store any URI and the
            // user (not this server) is the one that follows the link.
            expect(() =>
              SafeUrlSchema.parse('ftp://example.com'),
            ).not.toThrow();
          });
        });

        describe('URL encoding bypass attempts', () => {
          it('should reject URL-encoded localhost variants', () => {
            expect(() =>
              SafeUrlSchema.parse('http://%6C%6F%63%61%6C%68%6F%73%74/admin'),
            ).toThrow();
            expect(() =>
              SafeUrlSchema.parse('http://l%6Fcalhost/admin'),
            ).toThrow();
          });

          it('should reject URL-encoded IP addresses', () => {
            expect(() =>
              SafeUrlSchema.parse('http://127%2E0%2E0%2E1/admin'),
            ).toThrow();
          });
        });
      });
    });
  });

  describe('Tool-specific schemas', () => {
    describe('Tag validation', () => {
      it('allows tags with optional leading #', () => {
        expect(() =>
          CreateReminderSchema.parse({
            title: 'Tagged reminder',
            tags: ['work', '#urgent'],
          }),
        ).not.toThrow();
      });

      it('allows CJK tags (Chinese / Japanese / Korean)', () => {
        expect(() =>
          CreateReminderSchema.parse({
            title: 'CJK tagged reminder',
            tags: ['雷蒙三十', '日本語', '한국어', '#中文_mix'],
          }),
        ).not.toThrow();
      });

      it('allows CJK tags in filterTags for read action', () => {
        expect(() =>
          ReadRemindersSchema.parse({
            filterTags: ['雷蒙三十'],
          }),
        ).not.toThrow();
      });

      it('rejects tags with whitespace or punctuation', () => {
        expect(() =>
          CreateReminderSchema.parse({
            title: 'Bad tag',
            tags: ['has space'],
          }),
        ).toThrow();
        expect(() =>
          CreateReminderSchema.parse({
            title: 'Bad tag',
            tags: ['bad,comma'],
          }),
        ).toThrow();
      });
    });

    describe('ReadCalendarsSchema', () => {
      it('accepts no arguments', () => {
        expect(() => ReadCalendarsSchema.parse({})).not.toThrow();
      });

      it('accepts a forward range', () => {
        expect(() =>
          ReadCalendarsSchema.parse({
            startDate: '2026-05-04',
            endDate: '2026-05-11',
          }),
        ).not.toThrow();
      });

      it('accepts startDate equal to endDate', () => {
        expect(() =>
          ReadCalendarsSchema.parse({
            startDate: '2026-05-04',
            endDate: '2026-05-04',
          }),
        ).not.toThrow();
      });

      it('rejects endDate before startDate', () => {
        expect(() =>
          ReadCalendarsSchema.parse({
            startDate: '2026-05-11',
            endDate: '2026-05-04',
          }),
        ).toThrow(/endDate must be on or after startDate/);
      });

      it('silently drops filterAccount (dropped: not exposed by the event CLI)', () => {
        const parsed = ReadCalendarsSchema.parse({
          filterAccount: 'Google',
        }) as Record<string, unknown>;
        expect(parsed.filterAccount).toBeUndefined();
      });
    });

    describe('Action schemas validation patterns', () => {
      it.each([
        {
          name: 'CreateReminderSchema',
          schema: CreateReminderSchema,
          validInput: {
            title: 'Test reminder',
            dueDate: '2024-01-15',
            note: 'Test note',
            url: 'https://example.com',
            targetList: 'Work',
          },
          minimalInput: { title: 'Test reminder' },
          requiredFields: ['title'],
        },
        {
          name: 'UpdateReminderSchema',
          schema: UpdateReminderSchema,
          validInput: {
            id: '123',
            title: 'Updated title',
            dueDate: '2024-01-15',
            note: 'Updated note',
            url: 'https://example.com',
            completed: false,
            targetList: 'Work',
          },
          minimalInput: { id: '123' },
          requiredFields: ['id'],
        },
        {
          name: 'DeleteReminderSchema',
          schema: DeleteReminderSchema,
          validInput: { id: '123' },
          minimalInput: { id: '123' },
          requiredFields: ['id'],
        },
        {
          name: 'CreateReminderListSchema',
          schema: CreateReminderListSchema,
          validInput: { name: 'New List' },
          minimalInput: { name: 'New List' },
          requiredFields: ['name'],
        },
      ])('$name validates correctly', ({
        schema,
        validInput,
        minimalInput,
        requiredFields,
      }) => {
        // Should validate full input
        expect(() => schema.parse(validInput)).not.toThrow();

        // Should validate minimal input with only required fields
        expect(() => schema.parse(minimalInput)).not.toThrow();

        // Should reject input missing required fields
        for (const field of requiredFields) {
          const invalidInput = { ...minimalInput } as Record<string, unknown>;
          delete invalidInput[field];
          expect(() => schema.parse(invalidInput)).toThrow();
        }
      });
    });

    describe('Reminders schema alignment (event CLI subset)', () => {
      it('CreateReminderSchema keeps the fields event reminders create accepts', () => {
        const parsed = CreateReminderSchema.parse({
          title: 'Aligned reminder',
          dueDate: '2024-01-15T10:00:00Z',
          note: 'short note',
          priority: 1,
          targetList: 'Work',
          tags: ['urgent'],
          subtasks: ['Step 1'],
        }) as Record<string, unknown>;

        expect(parsed.title).toBe('Aligned reminder');
        expect(parsed.dueDate).toBe('2024-01-15T10:00:00Z');
        expect(parsed.priority).toBe(1);
        expect(parsed.tags).toEqual(['urgent']);
        expect(parsed.subtasks).toEqual(['Step 1']);
      });

      it('CreateReminderSchema silently strips dropped fields (alarms, recurrence, locationTrigger, startDate, location, completed)', () => {
        const parsed = CreateReminderSchema.parse({
          title: 'Trimmed',
          alarms: [{ relativeOffset: -900 }],
          recurrenceRules: [{ frequency: 'weekly', interval: 1 }],
          locationTrigger: {
            title: 'Office',
            latitude: 1,
            longitude: 2,
            proximity: 'enter',
          },
          startDate: '2024-01-15T09:00:00Z',
          location: 'Office',
          completed: true,
        }) as Record<string, unknown>;

        expect(parsed.alarms).toBeUndefined();
        expect(parsed.recurrenceRules).toBeUndefined();
        expect(parsed.locationTrigger).toBeUndefined();
        expect(parsed.startDate).toBeUndefined();
        expect(parsed.location).toBeUndefined();
        expect(parsed.completed).toBeUndefined();
      });

      it('UpdateReminderSchema keeps start/due dates, priority, completed, tags', () => {
        const parsed = UpdateReminderSchema.parse({
          id: 'rem-1',
          completed: true,
          startDate: '2024-01-15T09:00:00Z',
          dueDate: '2024-01-15T10:00:00Z',
          priority: 5,
          addTags: ['done'],
          removeTags: ['todo'],
        }) as Record<string, unknown>;

        expect(parsed.completed).toBe(true);
        expect(parsed.startDate).toBe('2024-01-15T09:00:00Z');
        expect(parsed.dueDate).toBe('2024-01-15T10:00:00Z');
        expect(parsed.priority).toBe(5);
        expect(parsed.addTags).toEqual(['done']);
        expect(parsed.removeTags).toEqual(['todo']);
      });

      it('UpdateReminderSchema silently strips dropped fields (alarms, recurrence, locationTrigger, location, completionDate)', () => {
        const parsed = UpdateReminderSchema.parse({
          id: 'rem-1',
          alarms: [{ absoluteDate: '2024-01-15T10:15:00Z' }],
          recurrenceRules: [{ frequency: 'monthly', interval: 1 }],
          clearAlarms: true,
          clearRecurrence: true,
          locationTrigger: {
            title: 'Office',
            latitude: 1,
            longitude: 2,
            proximity: 'enter',
          },
          clearLocationTrigger: true,
          location: 'Office',
          completionDate: '2024-01-16T10:00:00Z',
        }) as Record<string, unknown>;

        for (const field of [
          'alarms',
          'recurrenceRules',
          'clearAlarms',
          'clearRecurrence',
          'locationTrigger',
          'clearLocationTrigger',
          'location',
          'completionDate',
        ]) {
          expect(parsed[field]).toBeUndefined();
        }
      });
    });

    describe('Calendar schema alignment (event CLI subset)', () => {
      it('CreateCalendarEventSchema keeps the fields event calendar create accepts', () => {
        const parsed = CreateCalendarEventSchema.parse({
          title: 'Aligned event',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          location: 'Office',
          note: 'agenda',
          targetCalendar: 'Work',
        }) as Record<string, unknown>;

        expect(parsed.title).toBe('Aligned event');
        expect(parsed.startDate).toBe('2025-11-04T09:00:00+08:00');
        expect(parsed.location).toBe('Office');
        expect(parsed.targetCalendar).toBe('Work');
      });

      it('CreateCalendarEventSchema silently strips dropped fields (alarms, recurrence, structuredLocation, url, isAllDay, availability)', () => {
        const parsed = CreateCalendarEventSchema.parse({
          title: 'Trimmed',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          alarms: [{ relativeOffset: -1800 }],
          recurrenceRules: [{ frequency: 'weekly', interval: 1 }],
          structuredLocation: { title: 'Office', latitude: 1, longitude: 2 },
          url: 'https://example.com',
          isAllDay: true,
          availability: 'busy',
        }) as Record<string, unknown>;

        for (const field of [
          'alarms',
          'recurrenceRules',
          'structuredLocation',
          'url',
          'isAllDay',
          'availability',
        ]) {
          expect(parsed[field]).toBeUndefined();
        }
      });

      it('UpdateCalendarEventSchema drops span (event has no --span on update)', () => {
        const parsed = UpdateCalendarEventSchema.parse({
          id: 'evt-1',
          span: 'future-events',
        }) as Record<string, unknown>;
        // span is honored only by DeleteCalendarEventSchema; on update it
        // would be silently ignored, so we reject it from the input schema.
        expect(parsed.span).toBeUndefined();
      });

      it('UpdateCalendarEventSchema silently strips dropped fields (alarms, recurrence, structuredLocation, url, isAllDay, availability, targetCalendar)', () => {
        const parsed = UpdateCalendarEventSchema.parse({
          id: 'evt-1',
          alarms: [{ relativeOffset: -1800 }],
          clearAlarms: true,
          recurrenceRules: [{ frequency: 'weekly', interval: 1 }],
          clearRecurrence: true,
          structuredLocation: null,
          url: 'https://example.com',
          isAllDay: true,
          availability: 'free',
          targetCalendar: 'Other',
        }) as Record<string, unknown>;

        for (const field of [
          'alarms',
          'clearAlarms',
          'recurrenceRules',
          'clearRecurrence',
          'structuredLocation',
          'url',
          'isAllDay',
          'availability',
          'targetCalendar',
        ]) {
          expect(parsed[field]).toBeUndefined();
        }
      });

      it('CreateCalendarEventSchema accepts up to two alarm offsets', () => {
        const parsed = CreateCalendarEventSchema.parse({
          title: 'Two alarms',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          alarmMinutesBefore: [30, 1440],
        }) as Record<string, unknown>;
        expect(parsed.alarmMinutesBefore).toEqual([30, 1440]);
      });

      it('CreateCalendarEventSchema coerces stringified alarm offsets', () => {
        const parsed = CreateCalendarEventSchema.parse({
          title: 'Coerced',
          startDate: '2025-11-04T09:00:00+08:00',
          endDate: '2025-11-04T10:00:00+08:00',
          alarmMinutesBefore: ['30', '1440'],
        }) as Record<string, unknown>;
        expect(parsed.alarmMinutesBefore).toEqual([30, 1440]);
      });

      it('CreateCalendarEventSchema rejects more than two alarm offsets', () => {
        expect(() =>
          CreateCalendarEventSchema.parse({
            title: 'Too many',
            startDate: '2025-11-04T09:00:00+08:00',
            endDate: '2025-11-04T10:00:00+08:00',
            alarmMinutesBefore: [15, 30, 60],
          }),
        ).toThrow(/more than 2 alarms/);
      });

      it('CreateCalendarEventSchema rejects out-of-range alarm offsets', () => {
        expect(() =>
          CreateCalendarEventSchema.parse({
            title: 'Out of range',
            startDate: '2025-11-04T09:00:00+08:00',
            endDate: '2025-11-04T10:00:00+08:00',
            alarmMinutesBefore: [40321],
          }),
        ).toThrow(/cannot exceed 40320/);
        expect(() =>
          CreateCalendarEventSchema.parse({
            title: 'Negative',
            startDate: '2025-11-04T09:00:00+08:00',
            endDate: '2025-11-04T10:00:00+08:00',
            alarmMinutesBefore: [-1],
          }),
        ).toThrow(/cannot be negative/);
      });

      it('UpdateCalendarEventSchema accepts an alarm-offset array', () => {
        const parsed = UpdateCalendarEventSchema.parse({
          id: 'evt-1',
          alarmMinutesBefore: [15, 60],
        }) as Record<string, unknown>;
        expect(parsed.alarmMinutesBefore).toEqual([15, 60]);
      });

      it('DeleteCalendarEventSchema keeps span for recurring deletes', () => {
        const parsed = DeleteCalendarEventSchema.parse({
          id: 'evt-1',
          span: 'future-events',
        }) as Record<string, unknown>;
        expect(parsed.span).toBe('future-events');
      });

      it('ReadCalendarEventsSchema keeps availability filter (TS-side)', () => {
        const parsed = ReadCalendarEventsSchema.parse({
          availability: 'free',
        }) as Record<string, unknown>;
        expect(parsed.availability).toBe('free');
      });

      it('ReadCalendarEventsSchema silently strips filterAccount (not surfaced by event)', () => {
        const parsed = ReadCalendarEventsSchema.parse({
          filterAccount: 'iCloud',
        }) as Record<string, unknown>;
        expect(parsed.filterAccount).toBeUndefined();
      });
    });

    describe('Reminder list schema alignment (event CLI subset)', () => {
      it('CreateReminderListSchema accepts a single name field', () => {
        const parsed = CreateReminderListSchema.parse({
          name: 'Project Alpha',
        }) as Record<string, unknown>;
        expect(parsed.name).toBe('Project Alpha');
      });

      it('CreateReminderListSchema silently strips the now-unsupported color field', () => {
        const parsed = CreateReminderListSchema.parse({
          name: 'Project Alpha',
          color: '#FF5733',
        }) as Record<string, unknown>;
        expect(parsed.color).toBeUndefined();
      });

      it('UpdateReminderListSchema requires both current name and new name', () => {
        expect(() =>
          UpdateReminderListSchema.parse({ name: 'Old', newName: 'New' }),
        ).not.toThrow();
        expect(() => UpdateReminderListSchema.parse({ name: 'Old' })).toThrow();
        expect(() =>
          UpdateReminderListSchema.parse({ newName: 'New' }),
        ).toThrow();
      });
    });

    describe('ReadRemindersSchema', () => {
      it('should validate read reminders input with all optional fields', () => {
        const validInput = {
          id: '123',
          filterList: 'Work',
          showCompleted: true,
          search: 'meeting',
          dueWithin: 'today',
        };

        expect(() => ReadRemindersSchema.parse(validInput)).not.toThrow();
        expect(() => ReadRemindersSchema.parse({})).not.toThrow();
      });
    });

    // UpdateReminderListSchema is covered by the alignment block above.
  });

  describe('validateInput', () => {
    it('should return parsed data for valid input', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const input = { name: 'John', age: 30 };

      const result = validateInput(schema, input);

      expect(result).toEqual(input);
    });

    it('should throw ValidationError for invalid input', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const input = { name: 'John', age: 'thirty' };

      expect(() => validateInput(schema, input)).toThrow(ValidationError);
    });

    it('should include detailed error information', () => {
      const schema = z.object({
        name: z.string().min(2),
        age: z.number().min(0),
        email: z.string().email(),
      });
      const input = { name: 'J', age: -5, email: 'invalid-email' };

      try {
        validateInput(schema, input);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        expect(validationError.details).toBeDefined();
        expect(
          Object.keys(validationError.details as Record<string, string[]>),
        ).toHaveLength(3);
      }
    });

    it('should handle ValidationError instances specially', () => {
      const schema = SafeTextSchema;
      const input = ''; // Invalid: empty string

      try {
        validateInput(schema, input);
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as Error).message).toContain('cannot be empty');
      }
    });
  });

  describe('ValidationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Test validation error');

      expect(error.message).toBe('Test validation error');
      expect(error.name).toBe('ValidationError');
    });

    it('should create error with message and details', () => {
      const details = { field1: ['Required'], field2: ['Invalid format'] };
      const error = new ValidationError('Validation failed', details);

      expect(error.message).toBe('Validation failed');
      expect(error.details).toBe(details);
    });

    it('should handle undefined details', () => {
      const error = new ValidationError('Test error');

      expect(error.details).toBeUndefined();
    });
  });

  describe('validateInput error handling', () => {
    it('should handle non-ZodError exceptions', () => {
      const schema = z.object({ name: z.string() });
      // Mock schema.parse to throw a non-ZodError
      const originalParse = schema.parse;
      schema.parse = jest.fn(() => {
        throw new Error('Unknown error');
      });

      expect(() => validateInput(schema, { name: 'test' })).toThrow(
        ValidationError,
      );

      const thrownError = (() => {
        try {
          validateInput(schema, { name: 'test' });
          return null;
        } catch (error) {
          return error;
        }
      })();

      expect(thrownError).toBeInstanceOf(ValidationError);
      expect((thrownError as ValidationError).message).toBe(
        'Input validation failed: Unknown error',
      );

      schema.parse = originalParse;
    });
  });
});
