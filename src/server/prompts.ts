/**
 * server/prompts.ts
 * Central registry for MCP prompts and their runtime helpers
 */

import { z } from 'zod/v3';
import type {
  DailyTaskOrganizerArgs,
  PromptMetadata,
  PromptName,
  PromptResponse,
  PromptTemplate,
  ReminderReviewAssistantArgs,
  SmartReminderCreatorArgs,
  WeeklyPlanningWorkflowArgs,
} from '../types/prompts.js';
import {
  getFuzzyTimeSuggestions,
  getTimeContext,
} from '../utils/timeHelpers.js';
import {
  DailyTaskOrganizerArgsSchema,
  ReminderReviewAssistantArgsSchema,
  SmartReminderCreatorArgsSchema,
  ValidationError,
  WeeklyPlanningWorkflowArgsSchema,
} from '../validation/schemas.js';
import {
  APPLE_REMINDERS_LIMITATIONS,
  ASK_USER_QUESTION_EXAMPLES,
  buildStandardOutputFormat,
  CONTEXT_CALIBRATION,
  CORE_CONSTRAINTS,
  DAILY_CAPACITY_CONSTRAINTS,
  DEEP_WORK_CONSTRAINTS,
  SHALLOW_TASKS_CONSTRAINTS,
  TASK_BATCHING_CONSTRAINTS,
  TIME_BLOCK_CREATION_CONSTRAINTS,
  TIME_FORMAT_SPEC,
  WORKLOAD_CALIBRATION,
} from './promptAbstractions.js';

type PromptRegistry = {
  [K in PromptName]: PromptTemplate<K>;
};

const createMessage = (text: string): PromptResponse['messages'][number] => ({
  role: 'user',
  content: {
    type: 'text',
    text,
  },
});

interface StructuredPromptConfig {
  mission: string;
  contextInputs: string[];
  process: string[];
  outputFormat: string[];
  qualityBar: string[];
  constraints?: string[];
  calibration?: string[];
}

/**
 * Creates a structured prompt template with consistent formatting
 * @param {StructuredPromptConfig} config - Configuration for prompt structure
 * @param {string} config.mission - The core mission statement
 * @param {string[]} config.contextInputs - Context inputs for the prompt
 * @param {string[]} config.process - Step-by-step process instructions
 * @param {string[]} config.outputFormat - Expected output format guidelines
 * @param {string[]} config.qualityBar - Quality criteria and standards
 * @param {string[]} [config.constraints] - Optional constraints and limitations
 * @param {string[]} [config.calibration] - Optional calibration guidelines
 * @returns {string} Formatted prompt string with all sections
 * @private
 */
const createStructuredPrompt = ({
  mission,
  contextInputs,
  process,
  outputFormat,
  qualityBar,
  constraints = [],
  calibration = [],
}: StructuredPromptConfig): string => {
  const sections: string[] = [
    'You are an Apple Reminders strategist and productivity coach.',
    mission,
    'Context inputs:',
    ...contextInputs.map((input) => `- ${input}`),
    'Process:',
    ...process.map((step, index) => `${index + 1}. ${step}`),
  ];

  if (constraints.length > 0) {
    sections.push('Constraints:', ...constraints.map((line) => `- ${line}`));
  }

  sections.push('Output format:', ...outputFormat.map((line) => `- ${line}`));
  sections.push('Quality bar:', ...qualityBar.map((line) => `- ${line}`));

  if (calibration.length > 0) {
    sections.push('Calibration:', ...calibration.map((line) => `- ${line}`));
  }

  return sections.join('\n');
};

/**
 * Validates and parses prompt arguments using Zod schema
 * @template T - Expected argument type
 * @param {z.ZodSchema<T>} schema - Zod schema for validation
 * @param {Record<string, unknown> | null | undefined} rawArgs - Raw arguments to validate
 * @param {string} promptName - Name of the prompt for error messages
 * @returns {T} Validated and parsed arguments
 * @throws {ValidationError} If validation fails
 * @private
 */
const validatePromptArgs = <T>(
  schema: z.ZodSchema<T>,
  rawArgs: Record<string, unknown> | null | undefined,
  promptName: string,
): T => {
  try {
    return schema.parse(rawArgs ?? {});
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors
        .map((err) => `${err.path.join('.')}: ${err.message}`)
        .join('; ');
      throw new ValidationError(
        `Invalid arguments for prompt '${promptName}': ${errorMessages}`,
      );
    }
    throw error;
  }
};

/**
 * Build daily task organizer prompt for same-day task management
 *
 * Creates an intelligent daily task organization prompt that analyzes existing
 * reminders, identifies gaps, and proactively creates or optimizes reminders
 * with appropriate time-based properties.
 *
 * @param {DailyTaskOrganizerArgs} args - Organization arguments
 * @param {string} [args.todayFocus] - Optional focus area (e.g., "urgency-based", "gap filling")
 * @returns {PromptResponse} Structured prompt response with executable action queue
 *
 * @example
 * ```typescript
 * // Comprehensive organization
 * const prompt = buildDailyTaskOrganizerPrompt({});
 *
 * // Focused on urgent tasks
 * const urgentPrompt = buildDailyTaskOrganizerPrompt({
 *   todayFocus: 'urgency-based organization'
 * });
 * ```
 */
const buildDailyTaskOrganizerPrompt = (
  args: DailyTaskOrganizerArgs,
): PromptResponse => {
  const todayFocus = args.todayFocus ?? '';
  const timeContext = getTimeContext();
  const fuzzyTimes = getFuzzyTimeSuggestions();
  const standardOutput = buildStandardOutputFormat(timeContext.currentDate);

  return {
    description:
      'Proactive daily task organization with intelligent reminder creation and optimization',
    messages: [
      createMessage(
        createStructuredPrompt({
          mission:
            'Mission: Transform daily tasks into organized, actionable reminders by analyzing urgency patterns, identifying gaps, and taking initiative to create or optimize reminders with appropriate properties.',
          contextInputs: [
            `Focus: ${
              todayFocus ||
              'same-day organizing with urgency, gap filling, and cleanup'
            }`,
            `Time horizon: today only — do not plan beyond today without approval.`,
            "Action scope: today's reminders plus missing preparatory or follow-up steps.",
            `Current time context: ${timeContext.timeDescription} (${timeContext.currentDate}), later today (${fuzzyTimes.laterToday}).`,
          ],
          process: [
            'Review reminders; keep only today in scope and list the rest under Out-of-scope.',
            'Classify tasks as Deep Work (>=60 minutes) or Shallow (15-60 minutes); create calendar blocks for >=60-minute tasks.',
            'Create missing reminders or optimize existing ones without moving due dates beyond today; avoid duplicates.',
            `Generate due dates using ${TIME_FORMAT_SPEC} (e.g., "${timeContext.currentDate} 14:00:00-05:00").`,
            'Batch actions by type and apply confidence gating.',
          ],
          constraints: [
            // Daily-task-organizer specific constraints
            'Strict today-only policy: mention non-today reminders under "Out-of-scope items" and leave them untouched.',
            'Ask before creating any reminder or calendar block after today.',
            `Use ${TIME_FORMAT_SPEC} format for due dates and calendar times.`,
            'Do not modify recurrence rules, attachments, or sub-tasks unless explicitly requested.',
            'Assume standard working hours (9am-6pm) and reasonable task durations unless context suggests otherwise.',
            'Do not place concept-only analysis or planning notes inside the action queue; keep them under Current state, Gaps found, Questions, or Out-of-scope.',
            'Action queue is exclusively for executable reminder or calendar changes with tool-ready arguments, confidence labels, and rationale.',
            // Shared constraint patterns
            ...CORE_CONSTRAINTS,
            ...TASK_BATCHING_CONSTRAINTS,
            ...TIME_BLOCK_CREATION_CONSTRAINTS,
            ...DEEP_WORK_CONSTRAINTS,
            ...SHALLOW_TASKS_CONSTRAINTS,
            ...DAILY_CAPACITY_CONSTRAINTS,
          ],
          outputFormat: [
            '### Current state — metrics for today: total reminders in scope, overdue items, urgent items, and key blockers.',
            '### Gaps found — preparatory steps, follow-ups, or related reminders that must exist today.',
            '### Out-of-scope items — reminders noted but not due today (reference only).',
            ...standardOutput.actionQueue,
            '### Questions — concise list of missing context needed before executing low-confidence actions.',
            standardOutput.verificationLog,
            '### Deep work blocks — list of created or proposed ≥60-minute focus sessions (title, list, duration, objective).',
            '### Shallow tasks — grouped routine work (15-60 minutes) with proposed sequencing and batching cues.',
          ],
          qualityBar: [
            'Current state highlights today-only metrics and rationale.',
            'Actions follow confidence gating with concise rationale.',
            'Calendar tool is used for every >=60-minute task confirmed for today.',
            `All due dates labeled "today" use ${TIME_FORMAT_SPEC} format.`,
            'Out-of-scope section explains what was skipped and why.',
          ],
          calibration: [
            ...WORKLOAD_CALIBRATION,
            ...CONTEXT_CALIBRATION,
            ...APPLE_REMINDERS_LIMITATIONS,
          ],
        }),
      ),
    ],
  };
};

/**
 * Build smart reminder creator prompt for single reminder creation
 *
 * Creates a focused prompt for crafting a single Apple Reminder with optimal
 * scheduling, context, and metadata based on a task idea.
 *
 * @param args - Reminder creation arguments
 * @param args.taskIdea - Optional task description to convert into reminder
 * @returns Structured prompt response for creating a single reminder
 *
 * @example
 * ```typescript
 * // Create reminder from task idea
 * const prompt = buildSmartReminderCreatorPrompt({
 *   taskIdea: 'Submit quarterly report by Friday'
 * });
 * ```
 */
const buildSmartReminderCreatorPrompt = (
  args: SmartReminderCreatorArgs,
): PromptResponse => {
  const taskIdea = args.taskIdea ?? '';
  const timeContext = getTimeContext();
  const standardOutput = buildStandardOutputFormat(timeContext.currentDate);

  return {
    description:
      'Intelligent reminder creation with optimal scheduling and context',
    messages: [
      createMessage(
        createStructuredPrompt({
          mission: `Mission: Craft a single Apple Reminder for "${
            taskIdea || "today's key task"
          }" that names the primary execution scope, avoids duplicates, and sets the user up to follow through.`,
          contextInputs: [
            `Task idea: ${taskIdea || 'none provided — propose a sensible framing and ask for confirmation'}`,
            'Existing reminder landscape to cross-check for duplicates or related work.',
            `Current time context: ${timeContext.timeDescription} (${timeContext.currentDate})`,
          ],
          process: [
            'Clarify execution scope and check for overlapping reminders.',
            'Ask for missing critical context only when needed to reach confidence.',
            "Set title, list placement, and timing to fit the user's schedule and urgency.",
            'Run idempotency checks and apply confidence gating before executing or recommending.',
          ],
          constraints: [
            'Use fuzzy time expressions unless precision is mandatory.',
            'Ask for missing details only when confidence would stay below 60%.',
            'Only rely on Apple Reminders native capabilities.',
            'Do not create extra reminders unless explicitly requested.',
            'Follow-up reminders are opt-in only.',
            'State the primary execution focus before details.',
            ...CORE_CONSTRAINTS,
          ],
          outputFormat: [
            '### Primary focus — one sentence naming the reminder objective and scope.',
            ...standardOutput.actionQueue,
            '### Support details — bullet list covering notes, subtasks, and relevant metadata.',
            '### Follow-up sequence — ordered list of optional next nudges (omit if the user declined additional reminders).',
            standardOutput.verificationLog,
            '### Risks — short bullet list of potential failure points, assumptions, and mitigation ideas.',
          ],
          qualityBar: [
            'Timing aligns with importance and existing commitments.',
            'No duplicate reminders are created; similar items are merged or updated.',
            'Actions follow confidence gating with concise rationale.',
            'Scope and assumptions are clear and tied to a specific list.',
          ],
          calibration: [
            'If context is insufficient to schedule confidently, respond with targeted clarification questions before delivering the final structure.',
            'When the user has not opted into extra reminders, replace the follow-up section with a short note encouraging a future check-in instead of proposing new tasks.',
          ],
        }),
      ),
    ],
  };
};

/**
 * Build reminder review assistant prompt for cleanup and optimization
 *
 * Creates a prompt that audits current reminders and delivers actionable
 * clean-up, scheduling, and habit recommendations to boost completion rates.
 *
 * @param args - Review arguments
 * @param args.reviewFocus - Optional focus area (e.g., "overdue", list name)
 * @returns Structured prompt response with cleanup recommendations
 *
 * @example
 * ```typescript
 * // Review all reminders
 * const prompt = buildReminderReviewAssistantPrompt({});
 *
 * // Focus on overdue items
 * const overduePrompt = buildReminderReviewAssistantPrompt({
 *   reviewFocus: 'overdue reminders'
 * });
 * ```
 */
const buildReminderReviewAssistantPrompt = (
  args: ReminderReviewAssistantArgs,
): PromptResponse => {
  const reviewFocus = args.reviewFocus ?? '';
  const timeContext = getTimeContext();
  const standardOutput = buildStandardOutputFormat(timeContext.currentDate);

  return {
    description:
      'Analyze and optimize existing reminders for better productivity',
    messages: [
      createMessage(
        createStructuredPrompt({
          mission:
            'Mission: Audit current reminders and deliver actionable clean-up, scheduling, and habit recommendations that boost completion rates.',
          contextInputs: [
            `Review focus: ${reviewFocus || 'none provided — default to all lists and common hotspots'}`,
            `Current time context: ${timeContext.timeDescription} (${timeContext.currentDate})`,
          ],
          process: [
            'Inventory reminders by status, list, and due window.',
            'Identify root causes behind overdue or low-value reminders.',
            'Prioritize clean-up actions and apply confidence gating.',
            'After presenting findings, execute HIGH confidence actions immediately, then use AskUserQuestion for MEDIUM/LOW confidence decisions that require user input.',
            'Recommend lightweight routines to sustain the system.',
          ],
          constraints: [
            'Use fuzzy time adjustments when suggesting schedules or follow-ups.',
            'Ask for critical missing context before final guidance.',
            'Keep recommendations grounded in Apple Reminders native capabilities.',
            'Do not create NEW reminders unless the user explicitly requests it. However, you SHOULD execute updates and deletions for existing reminders when confidence is high (>80%).',
            'Call out the primary review scope before detailed recommendations.',
            'When you need user confirmation or decisions, use the AskUserQuestion tool with clear options instead of asking text questions.',
            'For critical decisions (e.g., whether to complete a task, delete items, or adjust dates), present 2-4 options with descriptions using AskUserQuestion.',
            ...ASK_USER_QUESTION_EXAMPLES,
            ...CORE_CONSTRAINTS,
          ],
          outputFormat: [
            '### Focus alignment — short paragraph identifying the primary review scope and headline issues.',
            '### Current state — brief overview with key metrics: total reminders reviewed, overdue items, stale reminders, main issues identified.',
            '### Findings — bullet list of key insights about the current reminder landscape.',
            ...standardOutput.actionQueue,
            standardOutput.verificationLog,
          ],
          qualityBar: [
            'Actions tie back to a specific list or pattern.',
            'Action queue entries follow confidence gating with rationale.',
            'HIGH confidence actions (>80%) must result in actual tool calls, not just descriptions.',
            'LOW confidence decisions (<60%) must use AskUserQuestion tool, not text questions.',
            'No text-based questions appear in final output - all user decisions use AskUserQuestion.',
            'Routines are lightweight and sustainable.',
            'No new reminders are created unless explicitly requested.',
          ],
          calibration: [
            'If the inventory reveals more work than can be actioned immediately, flag phased recommendations with prioritized batches.',
          ],
        }),
      ),
    ],
  };
};

/**
 * Build weekly planning workflow prompt for scheduling reminders
 *
 * Creates a prompt for building a resilient weekly execution playbook by
 * assigning appropriate due dates to existing reminders, aligned with user
 * planning ideas and current priorities.
 *
 * @param args - Weekly planning arguments
 * @param args.userIdeas - Optional planning thoughts for the week
 * @returns Structured prompt response with weekly scheduling plan
 *
 * @example
 * ```typescript
 * // Plan week with user ideas
 * const prompt = buildWeeklyPlanningWorkflowPrompt({
 *   userIdeas: 'Focus on project launch and client presentations'
 * });
 *
 * // Auto-plan based on existing reminders
 * const autoPrompt = buildWeeklyPlanningWorkflowPrompt({});
 * ```
 */
const buildWeeklyPlanningWorkflowPrompt = (
  args: WeeklyPlanningWorkflowArgs,
): PromptResponse => {
  const userIdeas = args.userIdeas ?? '';
  const timeContext = getTimeContext();
  const standardOutput = buildStandardOutputFormat(timeContext.currentDate);

  return {
    description:
      'Assign due dates to existing reminders based on weekly planning ideas',
    messages: [
      createMessage(
        createStructuredPrompt({
          mission:
            'Mission: Build a resilient weekly execution playbook by assigning appropriate due dates to existing reminders this week, aligned with user planning ideas and current priorities.',
          contextInputs: [
            `User planning ideas for this week: ${userIdeas || 'none provided - analyze existing reminders and suggest reasonable distribution'}`,
            'Time horizon: current calendar week — keep scheduling inside this range and surface overflow separately.',
            'Existing reminders without due dates that need scheduling.',
            'Existing reminders with due dates this week (anchor events).',
            'Overdue reminders that may need rescheduling.',
            'Calendar events or fixed commitments that create time constraints.',
            `Current time context: ${timeContext.timeDescription} - ${timeContext.dayOfWeek}, ${timeContext.currentDate}`,
          ],
          process: [
            'Analyze user ideas to identify weekly priorities and themes.',
            'Audit reminders and anchors (existing due dates and calendar commitments).',
            'Assign fuzzy due dates within the week and balance workload.',
            'Apply confidence gating and flag conflicts or overload.',
            'Recommend lightweight review checkpoints.',
          ],
          constraints: [
            'Do not create new reminders; only assign or update due dates.',
            'Keep scheduling decisions inside the current week; ask before moving beyond it.',
            'Use fuzzy time expressions and respect existing due dates unless they conflict.',
            'Ensure suggested due dates balance workload across the week.',
            'Ask for critical missing context before final guidance.',
            'State the primary weekly focus up front.',
            ...CORE_CONSTRAINTS,
          ],
          outputFormat: [
            '### Weekly focus — brief summary of primary themes and priorities for the week based on user ideas.',
            '### Current state — overview with metrics: total reminders to schedule, already scheduled, overdue items.',
            ...standardOutput.actionQueue,
            '### Immediate next steps — what to do today and tomorrow to get the week started effectively.',
            '### Workload insights — key observations about task distribution, conflicts, or dependencies that need attention.',
            standardOutput.verificationLog,
          ],
          qualityBar: [
            'Weekly focus is clear and aligned with user input.',
            'Action queue follows confidence gating and includes rationale.',
            'Due dates stay inside the current week and remain realistic.',
            'Plan highlights conflicts or overload without excessive analysis.',
          ],
          calibration: [
            'If user ideas cannot be mapped to existing reminders, summarize these as "future planning notes" without creating reminders.',
            'When workload appears excessive, propose explicit prioritization: which reminders are essential this week vs. can be deferred.',
            'If user provides no ideas, infer priorities from reminder patterns (urgency signals, list organization, dependencies) and ask for confirmation only when confidence stays below 60%.',
          ],
        }),
      ),
    ],
  };
};

const PROMPTS: PromptRegistry = {
  'daily-task-organizer': {
    metadata: {
      name: 'daily-task-organizer',
      description:
        'Proactive daily task organization with intelligent reminder creation and optimization',
      version: '1.0.0',
      arguments: [
        {
          name: 'todayFocus',
          description:
            'Organization focus area (e.g., urgency-based organization, gap filling, reminder setup, or comprehensive organization)',
          required: false,
        },
      ],
    },
    parseArgs(rawArgs: Record<string, unknown> | null | undefined) {
      return validatePromptArgs(
        DailyTaskOrganizerArgsSchema,
        rawArgs,
        'daily-task-organizer',
      );
    },
    buildPrompt: buildDailyTaskOrganizerPrompt,
  },
  'smart-reminder-creator': {
    metadata: {
      name: 'smart-reminder-creator',
      description:
        'Intelligently create reminders with optimal scheduling and context',
      version: '1.0.0',
      arguments: [
        {
          name: 'taskIdea',
          description: 'A short description of what you want to do',
          required: false,
        },
      ],
    },
    parseArgs(rawArgs: Record<string, unknown> | null | undefined) {
      return validatePromptArgs(
        SmartReminderCreatorArgsSchema,
        rawArgs,
        'smart-reminder-creator',
      );
    },
    buildPrompt: buildSmartReminderCreatorPrompt,
  },
  'reminder-review-assistant': {
    metadata: {
      name: 'reminder-review-assistant',
      description:
        'Analyze and review existing reminders for productivity optimization',
      version: '1.0.0',
      arguments: [
        {
          name: 'reviewFocus',
          description:
            'A short note on what to review (e.g., overdue, a list name)',
          required: false,
        },
      ],
    },
    parseArgs(rawArgs: Record<string, unknown> | null | undefined) {
      return validatePromptArgs(
        ReminderReviewAssistantArgsSchema,
        rawArgs,
        'reminder-review-assistant',
      );
    },
    buildPrompt: buildReminderReviewAssistantPrompt,
  },
  'weekly-planning-workflow': {
    metadata: {
      name: 'weekly-planning-workflow',
      description:
        'Assign due dates to existing reminders based on your weekly planning ideas',
      version: '1.0.0',
      arguments: [
        {
          name: 'userIdeas',
          description:
            'Your thoughts and ideas for what you want to accomplish this week',
          required: false,
        },
      ],
    },
    parseArgs(rawArgs: Record<string, unknown> | null | undefined) {
      return validatePromptArgs(
        WeeklyPlanningWorkflowArgsSchema,
        rawArgs,
        'weekly-planning-workflow',
      );
    },
    buildPrompt: buildWeeklyPlanningWorkflowPrompt,
  },
};

export const PROMPT_LIST: PromptMetadata[] = Object.values(PROMPTS).map(
  (prompt) => prompt.metadata,
);

export const getPromptDefinition = (
  name: string,
): PromptTemplate<PromptName> | undefined =>
  (PROMPTS as Record<string, PromptTemplate<PromptName>>)[name];

export const buildPromptResponse = <Name extends PromptName>(
  template: PromptTemplate<Name>,
  rawArgs: Record<string, unknown> | null | undefined,
): PromptResponse => {
  const parsedArgs = template.parseArgs(rawArgs);
  return template.buildPrompt(parsedArgs);
};
