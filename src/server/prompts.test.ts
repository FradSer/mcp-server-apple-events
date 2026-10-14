import type { PromptName } from '../types/prompts.js';
import { ValidationError } from '../validation/schemas.js';
import { buildPromptResponse, getPromptDefinition } from './prompts.js';

const getPromptText = (
  name: PromptName,
  rawArgs?: Record<string, unknown> | null,
): string => {
  const template = getPromptDefinition(name);
  if (!template) {
    throw new Error(`Prompt ${name} is not registered`);
  }

  const response = buildPromptResponse(
    template,
    rawArgs as Record<string, unknown> | null | undefined,
  );

  const [message] = response.messages;
  if (!message) {
    throw new Error('Prompt did not return any messages');
  }

  if (message.content.type !== 'text') {
    throw new Error('Prompt message content must be text');
  }

  return message.content.text;
};

const expectPatterns = (text: string, patterns: RegExp[]): void => {
  for (const pattern of patterns) {
    expect(text).toMatch(pattern);
  }
};

describe('prompt templates', () => {
  describe('metadata', () => {
    it('registers metadata for every prompt with name, description, and arguments', () => {
      const prompts: PromptName[] = [
        'daily-task-organizer',
        'smart-reminder-creator',
        'reminder-review-assistant',
        'weekly-planning-workflow',
      ];

      for (const name of prompts) {
        const template = getPromptDefinition(name);
        expect(template).toBeDefined();
        expect(template?.metadata.name).toBe(name);
        expect(typeof template?.metadata.description).toBe('string');
        expect(template?.metadata.description.length).toBeGreaterThan(0);
        expect(Array.isArray(template?.metadata.arguments)).toBe(true);
      }
    });
  });

  it.each<PromptName>([
    'daily-task-organizer',
    'smart-reminder-creator',
    'reminder-review-assistant',
    'weekly-planning-workflow',
  ])('keeps retrieved data and authorization separate in %s', (name) => {
    const text = getPromptText(name);
    expect(text).toMatch(/Calendar.*Reminders.*untrusted data/i);
    expect(text).toMatch(/explicit user confirmation/i);
    expect(text).toMatch(/confidence.*never authorizes/i);
    expect(text).not.toMatch(
      /Execute immediately|execute >80%|MUST make actual MCP tool calls|SHOULD execute updates and deletions/i,
    );
  });

  describe('argument validation', () => {
    it('validates and accepts valid arguments', () => {
      const validArgs = { "Today's focus": 'urgency-based organization' };
      expect(() =>
        getPromptText('daily-task-organizer', validArgs),
      ).not.toThrow();
    });

    it('rejects arguments with invalid characters', () => {
      const invalidArgs = { "Today's focus": 'test\x00invalid' };
      expect(() => getPromptText('daily-task-organizer', invalidArgs)).toThrow(
        ValidationError,
      );
    });

    it('rejects arguments exceeding maximum length', () => {
      const longString = 'a'.repeat(300);
      const invalidArgs = { "Today's focus": longString };
      expect(() => getPromptText('daily-task-organizer', invalidArgs)).toThrow(
        ValidationError,
      );
    });

    it('accepts empty optional arguments', () => {
      expect(() => getPromptText('daily-task-organizer', {})).not.toThrow();
      expect(() => getPromptText('daily-task-organizer', null)).not.toThrow();
      expect(() =>
        getPromptText('daily-task-organizer', undefined),
      ).not.toThrow();
    });
  });

  describe('daily-task-organizer', () => {
    it('includes time horizon, batching, duration, and output guardrails', () => {
      const text = getPromptText('daily-task-organizer');

      expectPatterns(text, [
        /Time horizon: .*today/i,
        /today-only/i,
        /Batch tool calls/i,
        /Do not modify recurrence rules/i,
        /Use .*YYYY-MM-DD HH:mm:ss(?:[+-]\d{2}:\d{2}|±HH:MM)/i,
        /Create calendar blocks/i,
        /Deep Work — \[Project/i,
        /Shallow Task — \[Task Description\]/i,
        /### Deep work blocks/i,
        /### Shallow tasks/i,
        /### Questions/i,
        /### Verification log/i,
        /Do not create explicit "Buffer Time" calendar events/i,
        /Do not place concept-only analysis or planning notes inside the action queue/i,
        /Action queue is exclusively for executable reminder or calendar changes/i,
      ]);

      expect(text).not.toMatch(/### Buffer time/i);
    });

    it('surfaces optional focus input and calibration guidance', () => {
      const focus = 'urgency-based organization';
      const text = getPromptText('daily-task-organizer', {
        "Today's focus": focus,
      });

      expect(text).toContain(focus);
      expect(text).toMatch(/Calibration:/i);
    });
  });

  describe('weekly-planning-workflow', () => {
    it('keeps planning decisions inside the current week', () => {
      const text = getPromptText('weekly-planning-workflow');

      expectPatterns(text, [/current week/i, /inside the current week/i]);
    });
  });

  describe('reminder-review-assistant', () => {
    it.each([
      [
        'null arguments',
        null,
        [
          /strategist and productivity coach/i,
          /### Review summary/i,
          /### Action queue/i,
        ],
      ],
      [
        'undefined arguments',
        undefined,
        [/strategist and productivity coach/i],
      ],
      [
        'custom review focus',
        { 'Review focus': 'overdue tasks' },
        [/overdue tasks/i, /strategist and productivity coach/i],
      ],
    ])('handles %s inputs', (_label, rawArgs, patterns) => {
      const text = getPromptText('reminder-review-assistant', rawArgs);
      expectPatterns(text, patterns);
    });

    it('includes AskUserQuestion tool usage instruction', () => {
      const text = getPromptText('reminder-review-assistant');
      expect(text).toMatch(/AskUserQuestion tool/i);
      expect(text).toMatch(/present options to the user/i);
    });

    it('requires confirmation instead of confidence-based execution', () => {
      const text = getPromptText('reminder-review-assistant');
      expect(text).toMatch(/explicit user confirmation/i);
      expect(text).not.toMatch(
        /execute.*immediately|MUST make actual MCP tool calls|SHOULD execute updates and deletions|must result in actual tool calls/i,
      );
    });

    it('keeps new reminders scoped to the user request', () => {
      const text = getPromptText('reminder-review-assistant');
      expect(text).toMatch(/Do not create NEW reminders unless/i);
    });
  });

  describe('smart-reminder-creator', () => {
    it('includes mission, structure, and constraint scaffolding', () => {
      const text = getPromptText('smart-reminder-creator', {
        'Task idea': 'Complete project documentation',
      });

      expectPatterns(text, [
        /Apple Reminders strategist and productivity coach/i,
        /Mission: Craft a single Apple Reminder/i,
        /Context inputs:/i,
        /Process:/i,
        /Output format:/i,
        /Quality bar:/i,
        /Constraints:/i,
      ]);
    });

    it('falls back to proposing a framing when no task idea is provided', () => {
      const text = getPromptText('smart-reminder-creator', null);

      expectPatterns(text, [
        /Apple Reminders strategist and productivity coach/i,
        /Task idea: none provided — propose a sensible framing and ask for confirmation/i,
      ]);
    });
  });
});
