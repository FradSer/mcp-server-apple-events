/**
 * e2e.test.ts
 * End-to-end tests using MCP client protocol
 *
 * These tests spin up the actual MCP server and communicate with it
 * using the MCP client SDK to verify the complete integration.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Creates an MCP client connected to a spawned server process
 * @returns Connected MCP client
 */
async function createClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['bin/run.cjs'],
    stderr: 'pipe',
    cwd: process.cwd(),
  });

  const client = new Client({
    name: 'e2e-test-client',
    version: '1.0.0',
  });

  await client.connect(transport);
  return client;
}

describe('MCP Server E2E Tests', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createClient();
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }
  });

  describe('Server Initialization', () => {
    it('should initialize successfully', async () => {
      expect(client).toBeDefined();
    });

    it('should return server version info', async () => {
      const serverInfo = client.getServerVersion();

      expect(serverInfo).toBeDefined();
      expect(serverInfo?.name).toBe('mcp-server-apple-events');
      expect(serverInfo?.version).toBeDefined();
    });

    it('should return server capabilities', async () => {
      const capabilities = client.getServerCapabilities();

      expect(capabilities).toBeDefined();
      expect(capabilities?.tools).toBeDefined();
      expect(capabilities?.prompts).toBeDefined();
    });
  });

  describe('Tool List', () => {
    it('should list all available tools', async () => {
      const result = await client.listTools();

      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it('should include reminders_tasks tool', async () => {
      const result = await client.listTools();

      const reminderTool = result.tools.find(
        (t) => t.name === 'reminders_tasks' || t.name === 'reminders.tasks',
      );

      expect(reminderTool).toBeDefined();
      expect(reminderTool?.description).toBeDefined();
    });

    it('should include calendar_events tool', async () => {
      const result = await client.listTools();

      const calendarTool = result.tools.find(
        (t) => t.name === 'calendar_events' || t.name === 'calendar.events',
      );

      expect(calendarTool).toBeDefined();
    });
  });

  describe('Prompt List', () => {
    it('should list all available prompts', async () => {
      const result = await client.listPrompts();

      expect(result).toBeDefined();
      expect(result.prompts).toBeDefined();
      expect(Array.isArray(result.prompts)).toBe(true);
    });
  });

  describe('Tool Calls', () => {
    it('should call reminders_tasks with read action', async () => {
      const result = await client.callTool({
        name: 'reminders_tasks',
        arguments: {
          action: 'read',
          showCompleted: true,
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should call reminders_lists tool', async () => {
      const result = await client.callTool({
        name: 'reminders_lists',
        arguments: { action: 'read' },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should call calendar_calendars tool', async () => {
      const result = await client.callTool({
        name: 'calendar_calendars',
        arguments: { action: 'read' },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names gracefully with isError flag', async () => {
      const result = await client.callTool({
        name: 'invalid_tool_name',
        arguments: { action: 'read' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should handle invalid action arguments', async () => {
      const result = await client.callTool({
        name: 'reminders_tasks',
        arguments: {
          action: 'invalid_action',
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });
  });

  describe('Tool Schema Validation', () => {
    it('should validate reminder create schema', async () => {
      const result = await client.listTools();
      const reminderTool = result.tools.find(
        (t) => t.name === 'reminders_tasks' || t.name === 'reminders.tasks',
      );

      expect(reminderTool).toBeDefined();
      expect(reminderTool?.inputSchema).toBeDefined();
      expect(reminderTool?.inputSchema.type).toBe('object');
    });

    it('should have required title field for create action', async () => {
      const result = await client.listTools();
      const reminderTool = result.tools.find(
        (t) => t.name === 'reminders_tasks' || t.name === 'reminders.tasks',
      );

      const schema = reminderTool?.inputSchema;
      expect(schema?.properties?.title).toBeDefined();
    });
  });
});
