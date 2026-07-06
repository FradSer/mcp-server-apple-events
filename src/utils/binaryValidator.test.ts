/**
 * binaryValidator.test.ts
 * Tests for binary validation utilities
 */

import fs from 'node:fs';
import {
  BinaryValidationError,
  calculateBinaryHash,
  findSecureBinaryPath,
  getEnvironmentBinaryConfig,
  validateBinaryIntegrity,
  validateBinaryPath,
  validateBinarySecurity,
} from './binaryValidator.js';

jest.mock('node:fs');
jest.mock('node:crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn(() => 'mocked-hash-value'),
  })),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('binaryValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BinaryValidationError', () => {
    it('should create error with code', () => {
      const error = new BinaryValidationError('Test error', 'TEST_CODE');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('BinaryValidationError');
    });
  });

  describe('validateBinaryPath', () => {
    it('should pass validation for valid absolute path in allowed directory', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024 * 1024, // 1MB
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);

      expect(() => validateBinaryPath(binaryPath)).not.toThrow();
    });

    it('should throw error for relative path when requireAbsolutePath is true', () => {
      const binaryPath = 'bin/EventKitCLI';

      expect(() =>
        validateBinaryPath(binaryPath, { requireAbsolutePath: true }),
      ).toThrow(BinaryValidationError);
      expect(() =>
        validateBinaryPath(binaryPath, { requireAbsolutePath: true }),
      ).toThrow('Binary path must be absolute');
    });

    it('should allow relative path when requireAbsolutePath is false', () => {
      const binaryPath = 'swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);

      expect(() =>
        validateBinaryPath(binaryPath, {
          requireAbsolutePath: false,
          allowedPaths: ['/swift/bin/', 'swift/bin/'],
        }),
      ).not.toThrow();
    });

    it('should throw error for path traversal attempts', () => {
      // After normalize, this becomes '/etc/passwd' which doesn't match allowed paths
      const binaryPath = '/project/bin/../../../etc/passwd';

      expect(() => validateBinaryPath(binaryPath)).toThrow(
        BinaryValidationError,
      );
      // After normalization, this will fail at allowed paths check
      expect(() => validateBinaryPath(binaryPath)).toThrow(
        'Binary path not in allowed directories',
      );
    });

    it('should allow paths with relative navigation within allowed directories', () => {
      // Test multiple scenarios of relative paths that stay within bounds
      const validPaths = [
        '/project/dist/swift/bin/../bin/EventKitCLI', // normalizes to /project/dist/swift/bin/EventKitCLI
      ];

      mockFs.existsSync.mockImplementation((filepath): boolean => {
        return filepath === '/project/dist/swift/bin/EventKitCLI';
      });

      validPaths.forEach((binaryPath) => {
        expect(() => validateBinaryPath(binaryPath)).not.toThrow();
      });
    });

    it('should throw error for path not in allowed directories', () => {
      const binaryPath = '/usr/local/bin/malicious';

      expect(() => validateBinaryPath(binaryPath)).toThrow(
        BinaryValidationError,
      );
      expect(() => validateBinaryPath(binaryPath)).toThrow(
        'Binary path not in allowed directories',
      );
    });

    it('should throw error when file does not exist', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(false);

      expect(() => validateBinaryPath(binaryPath)).toThrow(
        BinaryValidationError,
      );
      expect(() => validateBinaryPath(binaryPath)).toThrow(
        'Binary file not found',
      );
    });

    it('should throw error when path is not a file', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => false,
      } as fs.Stats);

      expect(() => validateBinaryPath(binaryPath)).toThrow(
        BinaryValidationError,
      );
      expect(() => validateBinaryPath(binaryPath)).toThrow(
        'does not point to a file',
      );
    });

    it('should throw error when file is too large', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 100 * 1024 * 1024, // 100MB
      } as fs.Stats);

      expect(() => validateBinaryPath(binaryPath)).toThrow(
        BinaryValidationError,
      );
      expect(() => validateBinaryPath(binaryPath)).toThrow(
        'Binary file too large',
      );
    });

    it('should allow larger files with custom maxFileSize config', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 75 * 1024 * 1024, // 75MB
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);

      expect(() =>
        validateBinaryPath(binaryPath, { maxFileSize: 100 * 1024 * 1024 }),
      ).not.toThrow();
    });

    it('should throw error when file is not executable', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => {
        throw new Error('Not executable');
      });

      expect(() => validateBinaryPath(binaryPath)).toThrow(
        BinaryValidationError,
      );
      expect(() => validateBinaryPath(binaryPath)).toThrow(
        'Binary file is not executable',
      );
    });

    it('should accept custom allowed paths', () => {
      const binaryPath = '/custom/path/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);

      expect(() =>
        validateBinaryPath(binaryPath, { allowedPaths: ['/custom/path/bin/'] }),
      ).not.toThrow();
    });
  });

  describe('calculateBinaryHash', () => {
    it('should calculate SHA256 hash of binary file', () => {
      const binaryPath = '/project/bin/EventKitCLI';
      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const hash = calculateBinaryHash(binaryPath);

      expect(hash).toBe('mocked-hash-value');
      expect(mockFs.readFileSync).toHaveBeenCalledWith(binaryPath);
    });

    it('should throw BinaryValidationError on read failure', () => {
      const binaryPath = '/project/bin/EventKitCLI';
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      expect(() => calculateBinaryHash(binaryPath)).toThrow(
        BinaryValidationError,
      );
      expect(() => calculateBinaryHash(binaryPath)).toThrow(
        'Failed to calculate binary hash',
      );
    });
  });

  describe('validateBinaryIntegrity', () => {
    it('should return true when hash matches', () => {
      const binaryPath = '/project/bin/EventKitCLI';
      const expectedHash = 'mocked-hash-value';

      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const result = validateBinaryIntegrity(binaryPath, expectedHash);

      expect(result).toBe(true);
    });

    it('should return false when hash does not match', () => {
      const binaryPath = '/project/bin/EventKitCLI';
      const expectedHash = 'different-hash';

      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const result = validateBinaryIntegrity(binaryPath, expectedHash);

      expect(result).toBe(false);
    });

    it('should return false on any error', () => {
      const binaryPath = '/project/bin/EventKitCLI';
      const expectedHash = 'some-hash';

      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read failed');
      });

      const result = validateBinaryIntegrity(binaryPath, expectedHash);

      expect(result).toBe(false);
    });
  });

  describe('validateBinarySecurity', () => {
    it('returns valid result for a well-formed binary path (no hash computed when no expectedHash configured)', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);
      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const result = validateBinarySecurity(binaryPath);

      expect(result.isValid).toBe(true);
      // Hash is only computed when expectedHash is configured (saves ~10–30 ms
      // per cache miss on the binary-resolution hot path).
      expect(result.hash).toBeUndefined();
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(result.errors).toHaveLength(0);
    });

    it('computes hash when expectedHash is configured', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);
      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const result = validateBinarySecurity(binaryPath, {
        expectedHash: 'mocked-hash-value',
      });

      expect(result.isValid).toBe(true);
      expect(result.hash).toBe('mocked-hash-value');
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid result with errors for invalid path', () => {
      const binaryPath = 'relative/path/bin/EventKitCLI';

      const result = validateBinarySecurity(binaryPath);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('INVALID_PATH');
    });

    it('should include integrity check error when hash mismatch', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';
      const expectedHash = 'different-hash';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);
      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const result = validateBinarySecurity(binaryPath, { expectedHash });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Binary integrity check failed - hash mismatch',
      );
    });

    it('should handle BinaryValidationError correctly', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockReturnValue(false);

      const result = validateBinarySecurity(binaryPath);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('FILE_NOT_FOUND');
    });

    it('should handle unexpected errors', () => {
      const binaryPath = '/project/dist/swift/bin/EventKitCLI';

      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Unexpected filesystem error');
      });

      const result = validateBinarySecurity(binaryPath);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Unexpected validation error');
    });
  });

  describe('findSecureBinaryPath', () => {
    it('should return first valid path', () => {
      const paths = [
        '/invalid/path/bin/EventKitCLI',
        '/project/dist/swift/bin/EventKitCLI',
        '/another/path/bin/EventKitCLI',
      ];

      mockFs.existsSync.mockImplementation((filepath): boolean => {
        return filepath === '/project/dist/swift/bin/EventKitCLI';
      });
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);
      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const result = findSecureBinaryPath(paths);

      expect(result.path).toBe('/project/dist/swift/bin/EventKitCLI');
      expect(result.validationResult).toBeDefined();
      expect(result.validationResult?.isValid).toBe(true);
    });

    it('should return null when no valid path found', () => {
      const paths = [
        '/invalid/path/bin/EventKitCLI',
        '/another/invalid/bin/EventKitCLI',
      ];

      mockFs.existsSync.mockReturnValue(false);

      const result = findSecureBinaryPath(paths);

      expect(result.path).toBeNull();
      expect(result.validationResult).toBeUndefined();
    });

    it('should return null for empty paths array', () => {
      const result = findSecureBinaryPath([]);

      expect(result.path).toBeNull();
      expect(result.validationResult).toBeUndefined();
    });

    it('should pass config to validation', () => {
      const paths = ['/project/dist/swift/bin/EventKitCLI'];
      const config = { maxFileSize: 100 * 1024 * 1024 };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        size: 75 * 1024 * 1024,
      } as fs.Stats);
      mockFs.accessSync.mockImplementation(() => undefined);
      mockFs.readFileSync.mockReturnValue(Buffer.from('binary content'));

      const result = findSecureBinaryPath(paths, config);

      expect(result.path).toBe('/project/dist/swift/bin/EventKitCLI');
      expect(result.validationResult?.isValid).toBe(true);
    });
  });

  describe('getEnvironmentBinaryConfig', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should return test config when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';

      const config = getEnvironmentBinaryConfig();

      expect(config.requireAbsolutePath).toBe(false);
      expect(config.maxFileSize).toBe(100 * 1024 * 1024);
    });

    it('should return development config when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';

      const config = getEnvironmentBinaryConfig();

      expect(config.maxFileSize).toBe(100 * 1024 * 1024);
      expect(config.requireAbsolutePath).toBeUndefined();
    });

    it('should return production config by default', () => {
      process.env.NODE_ENV = 'production';
      process.env.SWIFT_BINARY_HASH = 'prod-hash-value';

      const config = getEnvironmentBinaryConfig();

      expect(config.expectedHash).toBe('prod-hash-value');
      expect(config.maxFileSize).toBe(50 * 1024 * 1024);
      expect(config.requireAbsolutePath).toBe(true);
    });

    it('should handle missing SWIFT_BINARY_HASH in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SWIFT_BINARY_HASH;

      const config = getEnvironmentBinaryConfig();

      expect(config.expectedHash).toBeUndefined();
      expect(config.maxFileSize).toBe(50 * 1024 * 1024);
    });
  });
});
