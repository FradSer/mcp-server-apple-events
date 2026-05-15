/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: './jest-env.cjs',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ES2022',
          target: 'ES2020',
          moduleResolution: 'Bundler',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          isolatedModules: true,
          types: ['jest', 'node'],
          // ts-jest 29 still falls back to the deprecated `node10`
          // moduleResolution internally; silence the TS6 deprecation.
          ignoreDeprecations: '6.0',
        },
        diagnostics: {
          ignoreCodes: ['TS151001'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^import-meta$': '<rootDir>/src/__mocks__/importMeta.js',
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
  // Ignore import.meta.url line in projectUtils.ts
  coverageReporters: ['text', 'text-summary', 'html'],
  // Thresholds set just below the suite's current ceiling — leaves a thin
  // buffer for unrelated future patches without papering over regressions.
  // Branches still trails the other metrics; the largest remaining gaps are
  // SSRF-blocking paths in `schemas.ts` and tag/date filter edge cases —
  // good targets for the next coverage pass.
  coverageThreshold: {
    global: {
      statements: 93,
      branches: 78,
      functions: 96,
      lines: 94,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
