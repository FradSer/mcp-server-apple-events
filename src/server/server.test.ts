// Use global Jest functions to avoid extra dependencies
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ServerConfig } from '../types/index.js';
import { createServer, startServer } from './server.js';

// Mock dependencies
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');
jest.mock('./handlers.js', () => ({
  registerHandlers: jest.fn(),
}));

const mockServer = Server as jest.MockedClass<typeof Server>;
const mockStdioServerTransport = StdioServerTransport as jest.MockedClass<
  typeof StdioServerTransport
>;

// Import the mocked handler function
const { registerHandlers } = jest.requireMock('./handlers.js') as {
  registerHandlers: jest.MockedFunction<(server: unknown) => void>;
};

describe('Server Module', () => {
  let mockServerInstance: jest.Mocked<Server>;
  let mockTransportInstance: jest.Mocked<StdioServerTransport>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock server instance
    mockServerInstance = {
      connect: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Server>;

    // Mock transport instance
    mockTransportInstance = {} as jest.Mocked<StdioServerTransport>;

    mockServer.mockImplementation(() => mockServerInstance);
    mockStdioServerTransport.mockImplementation(() => mockTransportInstance);
  });

  describe('createServer', () => {
    it.each([
      [{ name: 'mcp-server', version: '2.1.0' }],
      [{ name: 'test', version: '0.0.1' }],
      [{ name: 'production-server', version: '10.5.3' }],
    ])('should create server with correct configuration and capabilities', (config: ServerConfig) => {
      mockServer.mockClear();
      registerHandlers.mockClear();

      const _server = createServer(config);

      expect(mockServer).toHaveBeenCalledWith(
        {
          name: config.name,
          version: config.version,
        },
        expect.objectContaining({
          capabilities: {
            tools: {},
            prompts: {},
          },
          instructions: expect.any(String),
        }),
      );

      // We deliberately do NOT advertise `resources: {}` any more — no
      // resource handlers are registered, so declaring the capability
      // misled clients into trying to enumerate them.
      const callOptions = mockServer.mock.calls[0]?.[1] as {
        capabilities: Record<string, unknown>;
      };
      expect(callOptions.capabilities).not.toHaveProperty('resources');

      expect(registerHandlers).toHaveBeenCalledWith(mockServerInstance);
      expect(_server).toBe(mockServerInstance);
    });
  });

  describe('startServer', () => {
    test('should start server successfully', async () => {
      const config: ServerConfig = {
        name: 'test-server',
        version: '1.0.0',
      };

      mockServerInstance.connect.mockResolvedValue(undefined);

      await expect(startServer(config)).resolves.toBeUndefined();

      expect(mockServer).toHaveBeenCalled();
      expect(mockStdioServerTransport).toHaveBeenCalled();
      expect(mockServerInstance.connect).toHaveBeenCalledWith(
        mockTransportInstance,
      );
    });

    describe('error handling', () => {
      it.each([
        [
          'connection failure',
          () => {
            const connectionError = new Error('Connection failed');
            mockServerInstance.connect.mockRejectedValue(connectionError);
          },
        ],
        [
          'server creation failure',
          () => {
            mockServer.mockImplementation(() => {
              throw new Error('Server creation failed');
            });
          },
        ],
        [
          'transport creation failure',
          () => {
            mockStdioServerTransport.mockImplementation(() => {
              throw new Error('Transport creation failed');
            });
          },
        ],
      ])('should handle %s and exit with code 1', async (_errorType, setupError) => {
        const config: ServerConfig = {
          name: 'test-server',
          version: '1.0.0',
        };

        setupError();

        const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
          throw new Error('process.exit called');
        });
        const mockStderr = jest
          .spyOn(process.stderr, 'write')
          .mockImplementation(() => true);

        await expect(startServer(config)).rejects.toThrow(
          'process.exit called',
        );
        // Startup errors still throw (test mock throws on first exit). The
        // signal-handler shutdown path is exercised separately below; here
        // we just want to confirm the failure exit code.
        expect(mockExit).toHaveBeenCalledWith(1);
        // Startup failures should surface on stderr so MCP clients spawning
        // the binary can see what went wrong.
        expect(mockStderr).toHaveBeenCalledWith(
          expect.stringContaining('MCP server startup failed:'),
        );

        mockExit.mockRestore();
        mockStderr.mockRestore();
      });
    });

    test('should create server and transport instances', async () => {
      const config: ServerConfig = {
        name: 'test-server',
        version: '1.0.0',
      };

      mockServerInstance.connect.mockResolvedValue(undefined);

      await startServer(config);

      expect(mockServer).toHaveBeenCalledTimes(1);
      expect(mockStdioServerTransport).toHaveBeenCalledTimes(1);
      expect(registerHandlers).toHaveBeenCalledWith(mockServerInstance);
    });

    describe('signal handlers', () => {
      // Shutdown is async and drains the transport before exiting; we wait
      // for `process.exit` to be invoked and assert the conventional
      // 128 + signal-number exit code. Bare `process.exit(0)` would truncate
      // in-flight JSON-RPC responses, so the assertion guards that.
      // The mock resolves a promise rather than throwing so the async
      // shutdown callback doesn't trip Jest's unhandled-rejection guard.
      it.each<[NodeJS.Signals, number]>([
        ['SIGINT', 130],
        ['SIGTERM', 143],
      ])('should register %s signal handler and exit with code %d', async (signal, exitCode) => {
        const config: ServerConfig = {
          name: 'test-server',
          version: '1.0.0',
        };

        let observedExitCode: number | undefined;
        let resolveExit!: () => void;
        const exitPromise = new Promise<void>((resolve) => {
          resolveExit = resolve;
        });
        const mockExit = jest.spyOn(process, 'exit').mockImplementation(((
          code?: number,
        ) => {
          observedExitCode = Number(code);
          resolveExit();
          return undefined as never;
        }) as typeof process.exit);

        const mockOn = jest.spyOn(process, 'on');

        mockServerInstance.connect.mockResolvedValue(undefined);

        await startServer(config);
        process.emit(signal);
        await exitPromise;

        expect(mockOn).toHaveBeenCalledWith(signal, expect.any(Function));
        expect(observedExitCode).toBe(exitCode);
        expect(mockServerInstance.close).toHaveBeenCalledTimes(1);

        mockExit.mockRestore();
        mockOn.mockRestore();
      });
    });
  });
});
