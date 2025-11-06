// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Global setup for all integration tests
 * This file is loaded by Jest before any tests run
 */

import { beforeAll, afterAll, afterEach } from '@jest/globals';

// Global setup before all tests
beforeAll(() => {
  console.log('🚀 Starting integration tests...');
    // Set up required environment variables for testing
  process.env.AZURE_EXPERIMENTAL_ENABLE_ACTIVITY_SOURCE = 'true';
  process.env.AZURE_TRACING_GEN_AI_CONTENT_RECORDING_ENABLED = 'true';
  process.env.OPENAI_AGENTS_DISABLE_TRACING = 'false';
  process.env.OTEL_SDK_DISABLED = 'false';
  
  // Initialize global observability/telemetry before tests
  // Setup global test data and fixtures
  // Set global timeout if needed
  jest.setTimeout(60000);
});

afterAll(async () => {
  console.log('🏁 Integration tests completed');
  
  // Clean up global resources after tests
  // Export global telemetry for validation
});

afterEach(async () => {
  // Clean up after each test (common cleanup)
  // Reset global mocks, clear timers, etc.
});
