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
export function registerHandlers(server: Server): void {
  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handler for calling a tool
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(
      request.params.name,
      (request.params.arguments as unknown as
        | RemindersToolArgs
        | ListsToolArgs
        | SubtasksToolArgs
        | CalendarToolArgs
        | CalendarsToolArgs) ?? {},
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
