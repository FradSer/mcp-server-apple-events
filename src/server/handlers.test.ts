// Use global Jest functions to avoid extra dependencies
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { registerHandlers } from './handlers.js';

// Mock server type for testing - simplified for test compatibility
interface MockServer {
  setRequestHandler: jest.MockedFunction<
    (schema: unknown, handler: unknown) => void
  >;
}

// Response types for handlers
interface ListPromptsResponse {
  prompts: MockPrompt[];
}

interface GetPromptResponse {
  description: string;
  messages: Array<{ role: string; content: MessageContent }>;
}

interface MessageContent {
  type: string;
  text?: string;
}

// Mock prompt type for testing
interface MockPrompt {
  name: string;
  description: string;
  arguments: MockPromptArgument[];
}

interface MockPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

// Mock the tools and prompts modules
jest.mock('../tools/index.js', () => ({
  TOOLS: [],
  handleToolCall: jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'Mock result' }],
    isError: false,
  }),
}));

describe('Server Handlers', () => {
  let mockServer: MockServer;

  beforeEach(() => {
    // Create a mock server
    mockServer = {
      setRequestHandler: jest.fn(),
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('registerHandlers', () => {
    test('should register all required handlers', () => {
      registerHandlers(
        mockServer as unknown as Parameters<typeof registerHandlers>[0],
      );

      // Verify that all handlers are registered
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(4);

      // Check specific handlers
      const calls = mockServer.setRequestHandler.mock.calls;
      const schemas = calls.map((call) => call[0]);

      expect(schemas).toContain(ListPromptsRequestSchema);
      expect(schemas).toContain(GetPromptRequestSchema);
    });
  });

  describe('ListToolsRequestSchema handler', () => {
    let listToolsHandler: jest.MockedFunction<() => Promise<unknown>>;

    beforeEach(() => {
      const testServer = new Server(
        { name: 'test', version: '1.0.0' },
        { capabilities: { prompts: {}, resources: {}, tools: {} } },
      );

      const originalSetRequestHandler = testServer.setRequestHandler;
      testServer.setRequestHandler = jest.fn(
        (schema: unknown, handler: unknown) => {
          const ListToolsRequestSchema = jest.requireActual(
            '@modelcontextprotocol/sdk/types.js',
          ).ListToolsRequestSchema;
          if (schema === (ListToolsRequestSchema as unknown)) {
            listToolsHandler = handler as jest.MockedFunction<
              () => Promise<unknown>
            >;
          }
          return originalSetRequestHandler.call(
            testServer,
            schema as unknown as Parameters<
              typeof originalSetRequestHandler
            >[0],
            handler as unknown as Parameters<
              typeof originalSetRequestHandler
            >[1],
          );
        },
      );

      registerHandlers(testServer);
    });

    it('should return list of tools', async () => {
      const result = await listToolsHandler();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('tools');
    });
  });

  describe('Prompts Handlers', () => {
    let listPromptsHandler: jest.MockedFunction<
      () => Promise<ListPromptsResponse>
    >;
    let getPromptHandler: jest.MockedFunction<
      (args: unknown) => Promise<GetPromptResponse>
    >;

    beforeEach(() => {
      registerHandlers(
        mockServer as unknown as Parameters<typeof registerHandlers>[0],
      );

      // Extract handlers from mock calls
      const calls = mockServer.setRequestHandler.mock.calls;

      const listPromptsCall = calls.find(
        (call) => call[0] === ListPromptsRequestSchema,
      );
      const getPromptCall = calls.find(
        (call) => call[0] === GetPromptRequestSchema,
      );

      listPromptsHandler = listPromptsCall?.[1] as jest.MockedFunction<
        () => Promise<ListPromptsResponse>
      >;
      getPromptHandler = getPromptCall?.[1] as jest.MockedFunction<
        (args: unknown) => Promise<GetPromptResponse>
      >;
    });

    describe('List Prompts Handler', () => {
      test('should return available prompts', async () => {
        const result = await listPromptsHandler();

        expect(result).toHaveProperty('prompts');
        expect(Array.isArray(result.prompts)).toBe(true);
        expect(result.prompts.length).toBe(4);

        // Check if all expected prompts are present
        const promptNames = result.prompts.map((p: MockPrompt) => p.name);
        expect(promptNames).toContain('daily-task-organizer');
        expect(promptNames).toContain('smart-reminder-creator');
        expect(promptNames).toContain('reminder-review-assistant');
        expect(promptNames).toContain('weekly-planning-workflow');
      });
    });

    describe('Get Prompt Handler', () => {
      it('should return daily-task-organizer prompt with forwarded arguments', async () => {
        const args = {
          "Today's focus": 'finish quarterly report and prepare slides',
        };
        const request = {
          params: { name: 'daily-task-organizer', arguments: args },
        };

        const result = await getPromptHandler(request);

        expect(result.description).toContain(
          'Proactive daily task organization with intelligent reminder creation and optimization',
        );
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0].role).toBe('user');
        expect(result.messages[0].content.type).toBe('text');
        expect((result.messages[0].content as MessageContent).text).toContain(
          args["Today's focus"],
        );
      });

      it('should handle daily-task-organizer with empty arguments', async () => {
        const request = {
          params: { name: 'daily-task-organizer', arguments: {} },
        };

        const result = await getPromptHandler(request);

        expect(result).toBeDefined();
        expect(result.messages[0].content.type).toBe('text');
        const text = (result.messages[0].content as MessageContent).text;
        expect(text).toContain('Focus: same-day organizing');
        expect(text).toContain('today only — do not plan beyond today');
      });

      it.each([
        ['unknown-prompt', 'Unknown prompt: unknown-prompt'],
        [123 as unknown, 'Prompt name must be a string.'],
      ])('should throw error for invalid prompt: %s', async (name, expectedError) => {
        const request = {
          params: { name, arguments: {} },
        };

        await expect(getPromptHandler(request)).rejects.toThrow(expectedError);
      });
    });
  });

  describe('CallToolRequestSchema handler', () => {
    let callToolHandler: jest.MockedFunction<
      (args: unknown) => Promise<unknown>
    >;

    beforeEach(() => {
      const testServer = new Server(
        { name: 'test', version: '1.0.0' },
        { capabilities: { prompts: {}, resources: {}, tools: {} } },
      );

      const originalSetRequestHandler = testServer.setRequestHandler;
      testServer.setRequestHandler = jest.fn(
        (schema: unknown, handler: unknown) => {
          const CallToolRequestSchema = jest.requireActual(
            '@modelcontextprotocol/sdk/types.js',
          ).CallToolRequestSchema;
          if (schema === (CallToolRequestSchema as unknown)) {
            callToolHandler = handler as jest.MockedFunction<
              (args: unknown) => Promise<unknown>
            >;
          }
          return originalSetRequestHandler.call(
            testServer,
            schema as unknown as Parameters<
              typeof originalSetRequestHandler
            >[0],
            handler as unknown as Parameters<
              typeof originalSetRequestHandler
            >[1],
          );
        },
      );

      registerHandlers(testServer);
    });

    it('should handle null arguments', async () => {
      const request = {
        params: {
          name: 'reminders_tasks',
          arguments: null,
        },
      };

      const result = await callToolHandler(request);
      expect(result).toBeDefined();
    });
  });
});
