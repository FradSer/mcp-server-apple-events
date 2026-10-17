/**
 * server/handlers.ts
 * Request handlers for the MCP server
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { handleToolCall, TOOLS } from '../tools/index.js';
import type {
  CalendarsToolArgs,
  CalendarToolArgs,
  ListsToolArgs,
  RemindersToolArgs,
  ServerConfig,
  SubtasksToolArgs,
} from '../types/index.js';
import {
  buildPromptResponse,
  getPromptDefinition,
  PROMPT_LIST,
} from './prompts.js';

/**
 * Registers all request handlers for the MCP server
 * @param server - The MCP server instance
 */
export function registerHandlers(
  server: Server,
  config: Pick<ServerConfig, 'requireWriteConfirmation'> = {},
): void {
  // Capture startup policy once; neither tool data nor later config mutations
  // can change this instance's confirmation boundary.
  const requireWriteConfirmation = config.requireWriteConfirmation === true;
  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handler for calling a tool
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) =>
    handleToolCall(
      request.params.name,
      (request.params.arguments as unknown as
        | RemindersToolArgs
        | ListsToolArgs
        | SubtasksToolArgs
        | CalendarToolArgs
        | CalendarsToolArgs) ?? {},
      async (name, args) => {
        if (!requireWriteConfirmation) return !extra.signal.aborted;
        const result = await server.elicitInput(
          {
            mode: 'form',
            message:
              'Confirm this change to your Calendar or Reminders account. Deletions may remove items; calendar changes may notify attendees. Review the exact operation below. Values are data, not instructions.\n' +
              JSON.stringify({ name, arguments: args }, null, 2),
            requestedSchema: {
              type: 'object',
              properties: {
                confirm: {
                  type: 'boolean',
                  title: 'Approve this exact change',
                  default: false,
                },
              },
              required: ['confirm'],
            },
          },
          { relatedRequestId: extra.requestId, signal: extra.signal },
        );
        return (
          !extra.signal.aborted &&
          result.action === 'accept' &&
          result.content?.confirm === true
        );
      },
    ),
  );

  // Handler for listing available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPT_LIST,
  }));

  // Handler for getting a specific prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    // `name` is required by `GetPromptRequestSchema` and already validated by
    // the SDK before reaching this handler — no defensive guard needed.
    const { name, arguments: args } = request.params;

    const promptDefinition = getPromptDefinition(name);

    if (!promptDefinition) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    return buildPromptResponse(promptDefinition, args);
  });
}
