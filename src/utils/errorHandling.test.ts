/**
 * errorHandling.test.ts
 * Tests for error handling utilities
 */

import { ValidationError } from '../validation/schemas.js';
import {
  CliUserError,
  handleAsyncOperation,
  isDevelopmentMode,
} from './errorHandling.js';

describe('ErrorHandling', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalDebug = process.env.DEBUG;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  });

  describe('handleAsyncOperation', () => {
    it('should return success response on successful operation', async () => {
      const mockOperation = jest.fn().mockResolvedValue('Success message');

      const result = await handleAsyncOperation(
        mockOperation,
        'test operation',
      );

      expect(mockOperation).toHaveBeenCalled();
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Success message' }],
        isError: false,
      });
    });

    it('should return error response on failed operation', async () => {
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Operation failed'));

      const result = await handleAsyncOperation(
        mockOperation,
        'test operation',
      );

      expect(mockOperation).toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(
        (result.content[0] as { type: 'text'; text: string }).text,
      ).toContain('Failed to test operation');
    });

    it('should handle ValidationError specially', async () => {
      const validationError = new ValidationError('Validation failed', {
        field1: ['Required field'],
      });

      const mockOperation = jest.fn().mockRejectedValue(validationError);

      const result = await handleAsyncOperation(mockOperation, 'validate');

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
        'Validation failed',
      );
    });

    it('should handle CliUserError specially and return detailed message', async () => {
      const cliError = new CliUserError(
        "Account 'foobar' not found. Available accounts: iCloud, Google",
      );

      const mockOperation = jest.fn().mockRejectedValue(cliError);

      const result = await handleAsyncOperation(mockOperation, 'read events');

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
        "Account 'foobar' not found. Available accounts: iCloud, Google",
      );
    });

    it('should return CliUserError message even in production mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;
      process.env.NODE_ENV = 'production';

      const cliError = new CliUserError('Calendar not found');
      const mockOperation = jest.fn().mockRejectedValue(cliError);

      const result = await handleAsyncOperation(mockOperation, 'read events');

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
        'Calendar not found',
      );

      process.env.NODE_ENV = originalNodeEnv;
      if (originalDebug) process.env.DEBUG = originalDebug;
    });

    it.each([
      ['create reminder', 'Failed to create reminder'],
      ['update reminder', 'Failed to update reminder'],
      ['delete reminder', 'Failed to delete reminder'],
    ])('should format error message for "%s"', async (operationName, expectedText) => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('Failed'));

      const result = await handleAsyncOperation(mockOperation, operationName);

      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(
        (result.content[0] as { type: 'text'; text: string }).text,
      ).toContain(expectedText);
    });

    it('should show detailed error in development mode', async () => {
      process.env.NODE_ENV = 'development';

      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Detailed error'));

      const result = await handleAsyncOperation(
        mockOperation,
        'test operation',
      );

      expect(result.content[0]).toHaveProperty('type', 'text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
        'Failed to test operation: Detailed error',
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should show generic error in production mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;
      process.env.NODE_ENV = 'production';

      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Detailed error'));

      const result = await handleAsyncOperation(
        mockOperation,
        'test operation',
      );

      expect(result.content[0]).toHaveProperty('type', 'text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
        'Failed to test operation: System error occurred',
      );

      process.env.NODE_ENV = originalNodeEnv;
      if (originalDebug) process.env.DEBUG = originalDebug;
    });

    it('shows actionable calendar permission error in production mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;
      process.env.NODE_ENV = 'production';

      const permissionMessage =
        'Calendar permission denied or restricted.\n\nPlease grant Full Calendar Access in:\nSystem Settings > Privacy & Security > Calendars';
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error(permissionMessage));

      const result = await handleAsyncOperation(
        mockOperation,
        'read calendar events',
      );

      expect(result.content[0]).toHaveProperty('type', 'text');
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Failed to read calendar events:');
      expect(text).toContain('Full Calendar Access');
      expect(text).toContain(
        'System Settings > Privacy & Security > Calendars',
      );

      process.env.NODE_ENV = originalNodeEnv;
      if (originalDebug) process.env.DEBUG = originalDebug;
    });

    it('shows actionable write-only calendar permission error in production mode', async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalDebug = process.env.DEBUG;
      delete process.env.DEBUG;
      process.env.NODE_ENV = 'production';

      const permissionMessage =
        'Calendar permission is write-only, but read access is required.\n\nPlease grant full calendar permissions in:\nSystem Settings > Privacy & Security > Calendars';
      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error(permissionMessage));

      const result = await handleAsyncOperation(
        mockOperation,
        'read calendar events',
      );

      expect(result.content[0]).toHaveProperty('type', 'text');
      const text = (result.content[0] as { type: 'text'; text: string }).text;
      expect(text).toContain('Failed to read calendar events:');
      expect(text).toContain('write-only');
      expect(text).toContain(
        'System Settings > Privacy & Security > Calendars',
      );

      process.env.NODE_ENV = originalNodeEnv;
      if (originalDebug) process.env.DEBUG = originalDebug;
    });

    it.each([
      ['String error', 'string error'],
      [{ code: 'ERROR' }, { code: 'ERROR' }],
    ])('should handle non-Error exceptions: %s', async (errorValue, _description) => {
      const mockOperation = jest.fn().mockRejectedValue(errorValue);

      const result = await handleAsyncOperation(
        mockOperation,
        'test operation',
      );

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
        'Failed to test operation: System error occurred',
      );
    });

    it('should show detailed error when DEBUG is set', async () => {
      process.env.DEBUG = '1';
      process.env.NODE_ENV = 'production';

      const mockOperation = jest
        .fn()
        .mockRejectedValue(new Error('Debug error'));

      const result = await handleAsyncOperation(
        mockOperation,
        'test operation',
      );

      expect(result.content[0]).toHaveProperty('type', 'text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
        'Failed to test operation: Debug error',
      );

      delete process.env.DEBUG;
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('isDevelopmentMode', () => {
    describe('Scenario: Development mode shows detailed errors', () => {
      it('Given NODE_ENV="development" When isDevelopmentMode is called Then returns true', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.DEBUG;

        expect(isDevelopmentMode()).toBe(true);
      });

      it('Given NODE_ENV="development" And an internal error occurs When createErrorMessage generates the response Then the full error message is returned', async () => {
        process.env.NODE_ENV = 'development';
        delete process.env.DEBUG;

        const mockOperation = jest
          .fn()
          .mockRejectedValue(new Error('Internal database connection failed'));

        const result = await handleAsyncOperation(
          mockOperation,
          'test operation',
        );

        expect(result.isError).toBe(true);
        expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
          'Failed to test operation: Internal database connection failed',
        );
      });
    });

    describe('Scenario: Production mode sanitizes errors', () => {
      it('Given NODE_ENV="production" And DEBUG is not set When isDevelopmentMode is called Then returns false', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DEBUG;

        expect(isDevelopmentMode()).toBe(false);
      });

      it('Given NODE_ENV="production" And DEBUG is not set And an internal error occurs When createErrorMessage generates the response Then "System error occurred" is returned', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DEBUG;

        const mockOperation = jest
          .fn()
          .mockRejectedValue(new Error('Internal database connection failed'));

        const result = await handleAsyncOperation(
          mockOperation,
          'test operation',
        );

        expect(result.isError).toBe(true);
        expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
          'Failed to test operation: System error occurred',
        );
      });
    });

    describe('Scenario: Production mode with DEBUG shows details', () => {
      it('Given NODE_ENV="production" And DEBUG="1" When isDevelopmentMode is called Then returns true', () => {
        process.env.NODE_ENV = 'production';
        process.env.DEBUG = '1';

        expect(isDevelopmentMode()).toBe(true);
      });

      it('Given NODE_ENV="production" And DEBUG="1" And an internal error occurs When createErrorMessage generates the response Then the full error message is returned', async () => {
        process.env.NODE_ENV = 'production';
        process.env.DEBUG = '1';

        const mockOperation = jest
          .fn()
          .mockRejectedValue(new Error('Internal database connection failed'));

        const result = await handleAsyncOperation(
          mockOperation,
          'test operation',
        );

        expect(result.isError).toBe(true);
        expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
          'Failed to test operation: Internal database connection failed',
        );
      });

      it('Given NODE_ENV="production" And DEBUG="true" When isDevelopmentMode is called Then returns true', () => {
        process.env.NODE_ENV = 'production';
        process.env.DEBUG = 'true';

        expect(isDevelopmentMode()).toBe(true);
      });
    });

    describe('Scenario: Undefined NODE_ENV defaults to production-safe', () => {
      it('Given NODE_ENV is undefined And DEBUG is not set When isDevelopmentMode is called Then returns false', () => {
        delete process.env.NODE_ENV;
        delete process.env.DEBUG;

        expect(isDevelopmentMode()).toBe(false);
      });

      it('Given NODE_ENV is undefined And DEBUG is not set And an internal error occurs When createErrorMessage generates the response Then "System error occurred" is returned', async () => {
        delete process.env.NODE_ENV;
        delete process.env.DEBUG;

        const mockOperation = jest
          .fn()
          .mockRejectedValue(new Error('Internal database connection failed'));

        const result = await handleAsyncOperation(
          mockOperation,
          'test operation',
        );

        expect(result.isError).toBe(true);
        expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
          'Failed to test operation: System error occurred',
        );
      });
    });

    describe('Scenario: DEBUG alone enables development mode', () => {
      it('Given NODE_ENV is undefined And DEBUG="1" When isDevelopmentMode is called Then returns true', () => {
        delete process.env.NODE_ENV;
        process.env.DEBUG = '1';

        expect(isDevelopmentMode()).toBe(true);
      });

      it('Given NODE_ENV="production" And DEBUG is empty string When isDevelopmentMode is called Then returns false', () => {
        process.env.NODE_ENV = 'production';
        process.env.DEBUG = '';

        expect(isDevelopmentMode()).toBe(false);
      });
    });
  });

  describe('createErrorMessage integration', () => {
    describe('Scenario: ValidationError always shown', () => {
      it('Given NODE_ENV="production" And a ValidationError occurs When createErrorMessage generates the response Then the validation error details are shown', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DEBUG;

        const validationError = new ValidationError('Invalid input', {
          email: ['Invalid email format'],
          age: ['Must be a positive number'],
        });
        const mockOperation = jest.fn().mockRejectedValue(validationError);

        const result = await handleAsyncOperation(
          mockOperation,
          'validate user',
        );

        expect(result.isError).toBe(true);
        expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
          'Invalid input',
        );
      });
    });

    describe('Scenario: CliUserError always shown', () => {
      it('Given NODE_ENV="production" And a CliUserError occurs When createErrorMessage generates the response Then the user error details are shown', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DEBUG;

        const userError = new CliUserError(
          "Account 'foobar' not found. Available accounts: iCloud, Google",
        );
        const mockOperation = jest.fn().mockRejectedValue(userError);

        const result = await handleAsyncOperation(mockOperation, 'read events');

        expect(result.isError).toBe(true);
        expect((result.content[0] as { type: 'text'; text: string }).text).toBe(
          "Account 'foobar' not found. Available accounts: iCloud, Google",
        );
      });
    });

    describe('Scenario: Permission errors always shown', () => {
      it('Given NODE_ENV="production" And a permission error occurs When createErrorMessage generates the response Then the permission error details are shown', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DEBUG;

        const permissionError = new Error(
          'Calendar permission denied or restricted.\n\nPlease grant Full Calendar Access in:\nSystem Settings > Privacy & Security > Calendars',
        );
        const mockOperation = jest.fn().mockRejectedValue(permissionError);

        const result = await handleAsyncOperation(
          mockOperation,
          'read calendar events',
        );

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Failed to read calendar events:');
        expect(text).toContain('Calendar permission denied');
        expect(text).toContain('Full Calendar Access');
      });
    });
  });
});
