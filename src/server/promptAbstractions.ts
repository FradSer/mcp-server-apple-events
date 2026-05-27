/**
 * Standard confidence system constraints
 * Decision priority: (1) If scope is ambiguous → confirm, (2) Then apply confidence thresholds
 */
export const CONFIDENCE_CONSTRAINTS = [
  'Assess confidence for each action (high >80%, medium 60-80%, low <60%).',
  'HIGH CONFIDENCE (>80%): You MUST make actual MCP tool calls immediately. Do not just describe the action - execute it by calling the reminders_tasks or reminders_lists tool with the appropriate parameters.',
  'MEDIUM CONFIDENCE (60-80%): Provide recommendations in tool-ready format with rationale.',
  'LOW CONFIDENCE (<60%): Use AskUserQuestion tool to present options to the user. Do not list them as text descriptions - convert them into interactive questions.',
  'Provide brief rationale for medium-confidence actions.',
];

/**
 * AskUserQuestion tool usage examples
 */
export const ASK_USER_QUESTION_EXAMPLES = [
  'Use AskUserQuestion tool for decisions requiring user input.',
  'Example: AskUserQuestion with options: ["Mark as complete", "Keep open", "Need more info"]',
  'Each option should have a clear description of what will happen if selected.',
];

/**
 * Standard note formatting constraints (compressed from 14 lines to 5 lines)
 */
export const NOTE_FORMATTING_CONSTRAINTS = [
  'Edit notes only when essential and confidence >80%; user has not objected.',
  'For new reminders, add only user-supplied context; no rationale, priority, or scheduling commentary.',
  'Allowed lines: See: [URL], Note: [brief context], Duration: [time estimate].',
  'Only include Note: or Duration: if the user explicitly provided them.',
  'Never include priority/urgency labels (Priority/P0/Urgent/etc.).',
  'No markdown; plain text only, use "-" bullets and "\\n" line breaks.',
];

/**
 * Standard batching and idempotency constraints
 */
export const BATCHING_CONSTRAINTS = [
  'Run idempotency checks before creating: search for duplicates by normalized title.',
  'Batch tool calls when executing multiple changes to reduce overhead and keep actions atomic by concern (e.g., all creates, then updates).',
];

export const TASK_BATCHING_CONSTRAINTS = [
  '**Task batching strategy**: Group similar tasks in dedicated blocks to reduce context switching.',
  '  - Naming pattern: "Code Review Batch — 3 PRs", "Email Processing — Inbox Zero", "Admin Batch — 5 tasks"',
  '  - Avoid batching unrelated tasks that require different mental modes',
];

/**
 * Standard calibration guidance for overwhelming workloads
 */
export const WORKLOAD_CALIBRATION = [
  'When workload is overwhelming, prioritize critical-path tasks and defer non-essential items.',
  'If similar tasks exist, recommend consolidation or batching.',
];

/**
 * Standard calibration for missing context
 */
export const CONTEXT_CALIBRATION = [
  'When creating reminders for unknown tasks, use clear, descriptive titles and suggest appropriate list placement.',
];

/**
 * Apple Reminders limitations reminder
 */
export const APPLE_REMINDERS_LIMITATIONS = [
  'Remember: Apple Reminders does not support priority fields. Do NOT add priority information to notes or titles.',
];

/**
 * Core constraints applied to all prompts
 */
export const CORE_CONSTRAINTS = [
  ...CONFIDENCE_CONSTRAINTS,
  ...NOTE_FORMATTING_CONSTRAINTS,
  ...BATCHING_CONSTRAINTS,
];

/**
 * Deep work time block execution details (trigger rules moved to TIME_BLOCK_CREATION_CONSTRAINTS)
 */
export const DEEP_WORK_CONSTRAINTS = [
  '**Deep work execution details**:',
  '  - Duration: >=60 minutes; ideal 90-120; split >120.',
  '  - Schedule in peak hours (9am-12pm) when possible; max 4 hours/day.',
  '  - Breaks: 15-30 minutes between blocks; longer after 4 hours total.',
  '  - Include a clear objective in notes and anchor start time to due time minus duration.',
  '  - Naming pattern: "Deep Work — [Project Name]".',
];

/**
 * Shallow tasks time block creation guidelines
 * Encompasses all non-deep-work activities: quick wins, routine tasks, administrative work
 */
export const SHALLOW_TASKS_CONSTRAINTS = [
  '**Shallow tasks time block guidelines**:',
  '  - Duration: 15-60 minutes; batch similar tasks when possible.',
  '  - Scheduling: fill gaps, use lower-energy windows (e.g., 2-4pm).',
  '  - Naming pattern: "Shallow Task — [Task Description]" or "Shallow Tasks — [Category]".',
];

/**
 * Daily capacity and workload balancing constraints
 * Includes implicit 20% buffer time allocation
 */
export const DAILY_CAPACITY_CONSTRAINTS = [
  '**Daily capacity limits and workload balancing**:',
  '  - Deep Work maximum: 4 hours per day; leave ~20% buffer as natural gaps.',
  '  - Shallow tasks fill remaining time after deep work and buffer.',
  '  - Warn when overcommitted and suggest prioritization.',
  '  - Buffer time handling: Do not create explicit "Buffer Time" calendar events.',
];

/**
 * Time format specification (single source of truth)
 * Format includes explicit timezone offset to prevent ambiguity in containerized environments
 */
export const TIME_FORMAT_SPEC =
  'YYYY-MM-DD HH:mm:ss±HH:MM (with explicit timezone offset, e.g., "2025-11-17 14:00:00-05:00" for 2PM EST)';

/**
 * Time block creation strict rules (includes trigger conditions from former DEEP_WORK_CONSTRAINTS)
 */
export const TIME_BLOCK_CREATION_CONSTRAINTS = [
  '**Time block creation triggers**: Create calendar_events blocks when tasks meet ANY criteria:',
  '  - Duration >=60 minutes due today, or deep-work keywords (development, design, analysis, planning, refactor, architecture).',
  '  - Multiple related tasks due today totaling >=60 minutes, or explicit focus/uninterrupted cues.',
  `  - Use ${TIME_FORMAT_SPEC} format for startDate and endDate.`,
  '  - Anchor start time to due time minus duration; if past, move forward but keep duration.',
  '  - Use "Deep Work — [Project]" for deep work and "Shallow Task — [Task Description]" for shallow tasks.',
  '  - Follow confidence gating (execute >80%, recommend 60-80, confirm <60).',
];

const ACTION_QUEUE_FORMAT: string[] = [
  '### Action queue',
  '',
  '**HIGH CONFIDENCE (>80%)**: Execute immediately with tool calls. After execution, show:',
  '✓ Action description',
  '  - Tool: tool_name, key parameters',
  '  - Rationale: brief reason',
  '',
  '**MEDIUM CONFIDENCE (60-80%)**: Recommend with tool-ready format:',
  '- [MEDIUM, XX%] Action description',
  '  - Tool: tool_name, key parameters',
  '  - Rationale: brief reason',
  '',
  '**LOW CONFIDENCE (<60%)**: Use AskUserQuestion tool to present options.',
  '',
  `  - Use ${TIME_FORMAT_SPEC} format for dueDate (e.g., "2025-11-04 18:00:00-05:00").`,
];

export const buildStandardOutputFormat = (
  currentDate: string,
): {
  actionQueue: string[];
  verificationLog: string;
} => ({
  actionQueue: ACTION_QUEUE_FORMAT,
  verificationLog: `### Verification log — bullet list confirming that each executed due date marked "today" uses ${currentDate} in the tool call output and persisted value (include reminder title + due date).`,
});
