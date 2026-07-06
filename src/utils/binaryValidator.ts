/**
 * utils/binaryValidator.ts
 * Secure binary path validation and integrity checking
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Security configuration for binary validation
 */
interface BinarySecurityConfig {
  expectedHash?: string;
  maxFileSize: number;
  allowedPaths: string[];
  requireAbsolutePath: boolean;
}

/**
 * Default security configuration.
 *
 * Each `allowedPaths` entry is a path suffix that the candidate binary must
 * match against either its full normalized path or its parent directory.
 * Suffix matching is segment-aligned so `foo-bin` doesn't partial-match
 * `bin`. The defaults intentionally do NOT include a bare `bin` entry — that
 * would pass for any `/<anywhere>/bin/<anything>` (e.g. `/usr/local/bin/curl`).
 * Production callers pass an absolute path tied to the project root via
 * configuration (see `src/utils/eventCli.ts`); the defaults below exist for
 * tests that exercise the suffix matcher.
 */
const DEFAULT_CONFIG: BinarySecurityConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50MB max
  allowedPaths: ['dist/swift/bin', 'src/swift/bin', 'swift/bin', 'bin/event'],
  requireAbsolutePath: true,
};

/**
 * Binary validation error
 */
export class BinaryValidationError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = 'BinaryValidationError';
  }
}

/**
 * Validates binary path for security
 */
export function validateBinaryPath(
  binaryPath: string,
  config: Partial<BinarySecurityConfig> = {},
): void {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (fullConfig.requireAbsolutePath && !path.isAbsolute(binaryPath)) {
    throw new BinaryValidationError(
      'Binary path must be absolute',
      'INVALID_PATH',
    );
  }

  const normalizedPath = path.normalize(binaryPath);
  // `path.normalize` resolves any embedded `..`, so a surviving `..` segment
  // would only come from a deliberately malformed input — check segments
  // rather than substring (`..foo` is a legal filename).
  const segments = normalizedPath.split(path.sep);
  if (segments.includes('..')) {
    throw new BinaryValidationError(
      'Path traversal detected in binary path',
      'PATH_TRAVERSAL',
    );
  }

  // An entry matches when it is a suffix of either the full binary path
  // (including its filename, e.g. `bin/event`) or the binary's parent
  // directory. Suffix matching is segment-aligned — `endsWith('/bin')` after
  // stripping trailing separators avoids the `foo-bin` partial-match trap
  // while still working for absolute and relative allowed paths.
  const parentDir = path.dirname(normalizedPath);
  const isInAllowedPath = fullConfig.allowedPaths.some((allowedPath) => {
    const allowedNormalized = path
      .normalize(allowedPath)
      .replace(/[\\/]+$/, '');
    if (!allowedNormalized) return false;
    const sepSuffix = path.sep + allowedNormalized;
    return (
      normalizedPath === allowedNormalized ||
      normalizedPath.endsWith(sepSuffix) ||
      parentDir === allowedNormalized ||
      parentDir.endsWith(sepSuffix)
    );
  });

  if (!isInAllowedPath) {
    throw new BinaryValidationError(
      'Binary path not in allowed directories',
      'FORBIDDEN_PATH',
    );
  }

  if (!fs.existsSync(normalizedPath)) {
    throw new BinaryValidationError(
      `Binary file not found: ${normalizedPath}`,
      'FILE_NOT_FOUND',
    );
  }

  const stats = fs.statSync(normalizedPath);
  if (!stats.isFile()) {
    throw new BinaryValidationError(
      'Binary path does not point to a file',
      'NOT_A_FILE',
    );
  }

  if (stats.size > fullConfig.maxFileSize) {
    throw new BinaryValidationError(
      `Binary file too large: ${stats.size} bytes`,
      'FILE_TOO_LARGE',
    );
  }

  try {
    fs.accessSync(normalizedPath, fs.constants.X_OK);
  } catch (_error) {
    throw new BinaryValidationError(
      'Binary file is not executable',
      'NOT_EXECUTABLE',
    );
  }
}

/**
 * Calculates SHA256 hash of binary file
 */
export function calculateBinaryHash(binaryPath: string): string {
  try {
    const fileBuffer = fs.readFileSync(binaryPath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  } catch (error) {
    throw new BinaryValidationError(
      `Failed to calculate binary hash: ${(error as Error).message}`,
      'HASH_CALCULATION_FAILED',
    );
  }
}

/**
 * Validates binary integrity using hash
 */
export function validateBinaryIntegrity(
  binaryPath: string,
  expectedHash: string,
): boolean {
  try {
    const actualHash = calculateBinaryHash(binaryPath);
    const isValid = actualHash === expectedHash;

    return isValid;
  } catch {
    return false;
  }
}

/**
 * Comprehensive binary security validation
 */
export function validateBinarySecurity(
  binaryPath: string,
  config: Partial<BinarySecurityConfig> = {},
): {
  isValid: boolean;
  hash?: string;
  errors: string[];
} {
  const errors: string[] = [];
  let hash: string | undefined;

  try {
    // Path validation
    validateBinaryPath(binaryPath, config);

    // Hashing the multi-MB binary takes 10–30 ms and blocks the event loop;
    // only do it when the caller will actually compare the result.
    if (config.expectedHash) {
      hash = calculateBinaryHash(binaryPath);
      if (hash !== config.expectedHash) {
        errors.push('Binary integrity check failed - hash mismatch');
      }
    }
  } catch (error) {
    if (error instanceof BinaryValidationError) {
      errors.push(`${error.code}: ${error.message}`);
    } else {
      errors.push(`Unexpected validation error: ${(error as Error).message}`);
    }
  }

  return {
    isValid: errors.length === 0,
    hash,
    errors,
  };
}

/**
 * Secure binary path finder with validation
 */
export function findSecureBinaryPath(
  possiblePaths: string[],
  config: Partial<BinarySecurityConfig> = {},
): {
  path: string | null;
  validationResult?: ReturnType<typeof validateBinarySecurity>;
} {
  for (const binaryPath of possiblePaths) {
    const validationResult = validateBinarySecurity(binaryPath, config);

    if (validationResult.isValid) {
      return { path: binaryPath, validationResult };
    }
  }

  return { path: null };
}

/**
 * Environment-specific binary validation
 */
export function getEnvironmentBinaryConfig(): Partial<BinarySecurityConfig> {
  if (process.env.NODE_ENV === 'test') {
    // Relaxed validation for testing
    return {
      requireAbsolutePath: false,
      maxFileSize: 100 * 1024 * 1024, // 100MB for test
    };
  }

  if (process.env.NODE_ENV === 'development') {
    // Development mode - log more details
    return {
      maxFileSize: 100 * 1024 * 1024, // 100MB for dev
    };
  }

  // Production mode - strict validation
  return {
    expectedHash: process.env.SWIFT_BINARY_HASH,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    requireAbsolutePath: true,
  };
}
