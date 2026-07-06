/** @type {import('jest').Config} */
export default {
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: './jest-env.cjs',
  // SWC is ~10x faster than ts-jest and avoids ts-jest 29's internal
  // `node10` moduleResolution fallback that TS6 now flags as deprecated.
  // Type checking is handled separately by `tsc --noEmit` in `pnpm lint`.
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript' },
          target: 'es2020',
        },
        module: { type: 'es6' },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transformIgnorePatterns: ['node_modules/'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '<rootDir>/dist/'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.d.ts',
    '!src/**/__mocks__/**',
    '!src/**/__fixtures__/**',
    '!src/utils/projectUtils.ts', // Excluded: import.meta.url line cannot be tested in Jest
  ],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  coverageReporters: ['text', 'text-summary', 'html'],
  // Thresholds set just below the suite's current ceiling — leaves a thin
  // buffer for unrelated future patches without papering over regressions.
  // Branches still trails the other metrics; the largest remaining gaps are
  // SSRF-blocking paths in `schemas.ts`, defensive catch/null guards in
  // `eventCli.ts`, and tag/date filter edge cases — good targets for the
  // next coverage pass.
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 78,
      functions: 97,
      lines: 94,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
