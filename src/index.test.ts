/**
 * index.test.ts
 * Tests for the entry point
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server/server.js';
import { findProjectRoot } from './utils/projectUtils.js';

jest.mock('node:fs');
jest.mock('node:path');
jest.mock('./server/server.js');
jest.mock('./utils/projectUtils.js', () => ({
  findProjectRoot: jest.fn(),
}));

const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockJoin = join as jest.MockedFunction<typeof join>;
const mockFindProjectRoot = findProjectRoot as jest.MockedFunction<
  typeof findProjectRoot
>;
const mockStartServer = startServer as jest.MockedFunction<typeof startServer>;

describe('index', () => {
  const originalArgv = process.argv;
  afterEach(() => {
    process.argv = originalArgv;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    process.argv = [originalArgv[0]!, originalArgv[1]!];
    mockFindProjectRoot.mockReturnValue('/test/project');
    mockJoin.mockImplementation((...args) => args.join('/'));
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ name: 'mcp-server-apple-events', version: '0.11.0' }),
    );
    mockStartServer.mockResolvedValue(undefined);
  });

  it('should load package.json and start server with correct config', async () => {
    // Import the module to execute it
    await import('./index.js');

    expect(mockFindProjectRoot).toHaveBeenCalled();
    expect(mockJoin).toHaveBeenCalledWith('/test/project', 'package.json');
    expect(mockReadFileSync).toHaveBeenCalledWith(
      '/test/project/package.json',
      'utf-8',
    );
    expect(mockStartServer).toHaveBeenCalledWith({
      name: 'mcp-server-apple-events',
      version: '0.11.0',
      requireWriteConfirmation: false,
    });
  });

  it('should handle server startup errors and exit with code 1', async () => {
    // Setup mocks for error scenario before first import
    mockFindProjectRoot.mockReturnValue('/test/project');
    mockJoin.mockImplementation((...args) => args.join('/'));
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ name: 'mcp-server-apple-events', version: '0.11.0' }),
    );

    const serverError = new Error('Server startup failed');
    mockStartServer.mockRejectedValue(serverError);

    // Mock process.exit to capture calls without actually exiting
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      // Prevent actual exit, but track the call
    }) as () => never);

    // Clear module cache
    jest.resetModules();

    // Re-mock all modules after resetModules
    const { readFileSync: readFileSyncMock } = jest.requireMock('node:fs') as {
      readFileSync: jest.MockedFunction<typeof readFileSync>;
    };
    const { join: joinMock } = jest.requireMock('node:path') as {
      join: jest.MockedFunction<typeof join>;
    };
    const { findProjectRoot: findProjectRootMock } = jest.requireMock(
      './utils/projectUtils.js',
    ) as { findProjectRoot: jest.MockedFunction<typeof findProjectRoot> };
    const { startServer: startServerMock } = jest.requireMock(
      './server/server.js',
    ) as { startServer: jest.MockedFunction<typeof startServer> };

    // Setup all mocks
    findProjectRootMock.mockReturnValue('/test/project');
    joinMock.mockImplementation((...args) => args.join('/'));
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ name: 'mcp-server-apple-events', version: '0.11.0' }),
    );
    startServerMock.mockRejectedValue(serverError);

    // Re-import index to trigger error path
    await import('./index.js');

    // Wait for async error handling to complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify process.exit was called with code 1
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(startServerMock).toHaveBeenCalled();

    mockExit.mockRestore();
  });
});
