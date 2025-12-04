// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Jest configuration for Agent365-nodejs SDK tests
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test discovery
  roots: [
    '<rootDir>'
  ],
  testMatch: [
    '**/?(*.)+(spec|test).ts',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        skipLibCheck: true,
        esModuleInterop: true,
        module: 'commonjs'
      },
      diagnostics: {
        ignoreCodes: [6059]
      },
      isolatedModules: false
    }]
  },
  
  // Transform files in both test directory and source packages
  transformIgnorePatterns: [
    'node_modules/(?!(@microsoft)/)'
  ],
  
  // Coverage collection - collect from packages/ source files only
  collectCoverageFrom: [
    '../packages/agents-a365-runtime/src/**/*.ts',
    '../packages/agents-a365-observability/src/**/*.ts',
    '../packages/agents-a365-observability-extensions-openai/src/**/*.ts',
    '../packages/agents-a365-observability-tokencache/src/**/*.ts',
    '../packages/agents-a365-tooling/src/**/*.ts',
    '../packages/agents-a365-tooling-extensions-claude/src/**/*.ts',
    '../packages/agents-a365-tooling-extensions-langchain/src/**/*.ts',
    '../packages/agents-a365-tooling-extensions-openai/src/**/*.ts',
    '../packages/agents-a365-notifications/src/**/*.ts',
    '!../packages/*/src/**/*.d.ts',
    '!../packages/*/src/**/*.test.ts',
    '!../packages/*/src/**/*.spec.ts'
  ],
  
  // Coverage output directory
  coverageDirectory: '<rootDir>/coverage',
  
  // Coverage reporters - matches Python repo: html, text, lcov, cobertura
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'cobertura'
  ],
  
  // Coverage thresholds - disabled due to known ts-jest + moduleNameMapper issue
  // coverageThreshold: {
  //   global: {
  //     branches: 80,
  //     functions: 80,
  //     lines: 80,
  //     statements: 80
  //   }
  // },
  
  // Module name mapper for package imports
  moduleNameMapper: {
    '^@microsoft/agents-a365-runtime$': '<rootDir>/../packages/agents-a365-runtime/src',
    '^@microsoft/agents-a365-observability$': '<rootDir>/../packages/agents-a365-observability/src',
    '^@microsoft/agents-a365-observability-extensions-openai$': '<rootDir>/../packages/agents-a365-observability-extensions-openai/src',
    '^@microsoft/agents-a365-observability-tokencache$': '<rootDir>/../packages/agents-a365-observability-tokencache/src',
    '^@microsoft/agents-a365-tooling$': '<rootDir>/../packages/agents-a365-tooling/src',
    '^@microsoft/agents-a365-tooling-extensions-claude$': '<rootDir>/../packages/agents-a365-tooling-extensions-claude/src',
    '^@microsoft/agents-a365-tooling-extensions-langchain$': '<rootDir>/../packages/agents-a365-tooling-extensions-langchain/src',
    '^@microsoft/agents-a365-tooling-extensions-openai$': '<rootDir>/../packages/agents-a365-tooling-extensions-openai/src',
    '^@microsoft/agents-a365-notifications$': '<rootDir>/../packages/agents-a365-notifications/src',
    '^@opentelemetry/api$': '<rootDir>/../node_modules/@opentelemetry/api'
  },
  
  // Module resolution
  moduleDirectories: ['node_modules', '<rootDir>/../node_modules'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Test timeout
  testTimeout: 10000,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true
};
