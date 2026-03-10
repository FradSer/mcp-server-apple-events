/**
 * types/prompts.ts
 * Type definitions for MCP prompt templates and arguments
 */

export type PromptName =
  | 'daily-task-organizer'
  | 'smart-reminder-creator'
  | 'reminder-review-assistant'
  | 'weekly-planning-workflow';

/**
 * Describes an individual prompt argument exposed to MCP clients.
 */
export interface PromptArgumentDefinition {
  name: string;
  description: string;
  required: boolean;
}

/**
 * Prompt metadata that is surfaced through the `ListPrompts` endpoint.
 */
export interface PromptMetadata<Name extends PromptName = PromptName> {
  name: Name;
  description: string;
  arguments: PromptArgumentDefinition[];
  version?: string;
}

/**
 * Content definition for a single prompt message.
 */
export interface PromptMessageContent {
  type: 'text';
  text: string;
}

/**
 * User-facing prompt message structure used when constructing prompt templates.
 */
export interface PromptMessage {
  role: 'user';
  content: PromptMessageContent;
}

/**
 * Response payload returned from `GetPrompt` requests.
 */
export interface PromptResponse {
  description: string;
  messages: PromptMessage[];
  [key: string]: unknown;
}

/**
 * Arguments accepted by the `daily-task-organizer` prompt.
 */
export interface DailyTaskOrganizerArgs {
  "Today's focus"?: string;
}

/**
 * Arguments accepted by the `smart-reminder-creator` prompt.
 */
export interface SmartReminderCreatorArgs {
  'Task idea'?: string;
}

/**
 * Arguments accepted by the `reminder-review-assistant` prompt.
 */
export interface ReminderReviewAssistantArgs {
  'Review focus'?: string;
}

/**
 * Arguments accepted by the `weekly-planning-workflow` prompt.
 */
export interface WeeklyPlanningWorkflowArgs {
  'User ideas'?: string;
}

/**
 * Mapped helper type that links prompt names with their argument signatures.
 */
export interface PromptArgsByName {
  'daily-task-organizer': DailyTaskOrganizerArgs;
  'smart-reminder-creator': SmartReminderCreatorArgs;
  'reminder-review-assistant': ReminderReviewAssistantArgs;
  'weekly-planning-workflow': WeeklyPlanningWorkflowArgs;
}

/**
 * Describes an individual prompt template with parsing and builder helpers.
 */
export interface PromptTemplate<Name extends PromptName> {
  metadata: PromptMetadata<Name>;
  parseArgs(
    rawArgs: Record<string, unknown> | null | undefined,
  ): PromptArgsByName[Name];
  buildPrompt(args: PromptArgsByName[Name]): PromptResponse;
}
