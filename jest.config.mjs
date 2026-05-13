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
          moduleResolution: 'Node',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          isolatedModules: true,
          types: ['jest', 'node'],
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
  // Thresholds set to a level the suite currently meets. Raise them as
  // coverage grows; lowering should require an explicit justification on PR.
  // Branches lags because several JSON-shape fallbacks (`?? undefined` etc.)
  // in `reminderRepository.ts` / `calendarRepository.ts` are only exercised
  // when the Swift CLI returns nulls, which mocked tests don't cover yet.
  coverageThreshold: {
    global: {
      statements: 90,
      branches: 70,
      functions: 92,
      lines: 90,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
