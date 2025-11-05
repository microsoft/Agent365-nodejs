// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/tests/integration/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'tests/integration/**/*.ts',
    '!tests/integration/**/*.d.ts',
    '!tests/integration/**/*.test.ts',
  ],
  coverageDirectory: 'coverage/integration',
  setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.ts'],
  testTimeout: 60000,
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
      },
    },
  },
};
