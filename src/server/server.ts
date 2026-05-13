/**
 * server/server.ts
 * Server configuration and startup logic
 */

import 'exit-on-epipe';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS } from '../tools/definitions.js';
import type { ServerConfig } from '../types/index.js';
import { registerHandlers } from './handlers.js';
import { PROMPT_LIST } from './prompts.js';

/**
 * Builds the `instructions` string surfaced through the MCP `initialize`
 * response. Derived from `TOOLS` and `PROMPT_LIST` so the user-facing summary
 * cannot drift when a tool or prompt is added — the new entry shows up
 * automatically, and the maintainer just has to keep each tool's own
 * `description` in `definitions.ts` accurate.
 */
const buildServerInstructions = (): string => {
  const toolLines = TOOLS.map((tool) => `- ${tool.name} — ${tool.description}`);
  const promptNames = PROMPT_LIST.map((p) => p.name).join(', ');
  return [
    'This MCP server exposes native macOS Apple Reminders and Calendar access.',
    '',
    `Tools (${TOOLS.length}):`,
    ...toolLines,
    '',
    `Prompts (${PROMPT_LIST.length}): ${promptNames}.`,
    '',
    "All write actions go through the user's Reminders / Calendar accounts via EventKit.",
    'The first call may trigger a system permission dialog.',
  ].join('\n');
};

const SERVER_INSTRUCTIONS = buildServerInstructions();

/**
 * Creates and configures an MCP server instance
 * @param config - Server configuration
 * @returns Configured server instance
 */
export function createServer(config: ServerConfig): Server {
  const server = new Server(
    {
      name: config.name,
      version: config.version,
    },
    {
      // Only advertise the capabilities we actually implement. We previously
      // declared `resources: {}` but never registered a resource handler —
      // that misled clients into thinking `ListResources` would work.
      capabilities: {
        tools: {},
        prompts: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  // Register request handlers
  registerHandlers(server);

  return server;
}

/**
 * Starts the MCP server
 * @param config - Server configuration
 * @returns A promise that resolves when the server starts
 */
export async function startServer(config: ServerConfig): Promise<void> {
  let server: Server | undefined;
  try {
    server = createServer(config);
    const transport = new StdioServerTransport();

    // Graceful shutdown: close the SDK server (which flushes the stdio
    // transport) before exiting, so any in-flight JSON-RPC response is
    // delivered. Bare `process.exit(0)` truncated those responses.
    const shutdown = async (signal: NodeJS.Signals) => {
      try {
        await server?.close();
      } catch {
        // Best-effort: a transport that has already torn down should not
        // prevent termination.
      }
      // Node exit codes for signals are 128 + signal number; SIGINT=2, SIGTERM=15.
      process.exit(signal === 'SIGINT' ? 130 : 143);
    };
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    await server.connect(transport);
  } catch (error) {
    // Surface the failure on stderr instead of exiting silently — MCP clients
    // (Claude Desktop etc.) spawn the binary and only see stderr/exit code.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`MCP server startup failed: ${message}\n`);
    process.exit(1);
  }
}
