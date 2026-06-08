// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/tests/observability/integration/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'tests/observability/integration/**/*.ts',
    '!tests/observability/integration/**/*.d.ts',
    '!tests/observability/integration/**/*.test.ts',
  ],
  coverageDirectory: 'coverage/integration',
  // Polyfill `crypto` global for Node.js 18 before any test modules are loaded.
  // @langchain/core uses `crypto` directly; Node.js 18 only exposes it as
  // `globalThis.crypto` in CommonJS context, not as a bare global.
  setupFiles: ['<rootDir>/tests/observability/integration/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/observability/integration/setup.ts'],
  testTimeout: 120000,
  globals: {
    'ts-jest': {
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
      },
    },
  },
};
