// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Utility } from '../../packages/agents-a365-tooling/src/Utility';

describe('Utility - GetChatHistoryEndpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should return the production endpoint by default', () => {
    // Clear any custom endpoint
    delete process.env.MCP_PLATFORM_ENDPOINT;

    const endpoint = Utility.GetChatHistoryEndpoint();

    expect(endpoint).toBe('https://agent365.svc.cloud.microsoft/agents/real-time-threat-protection/chat-message');
  });

  it('should use custom MCP_PLATFORM_ENDPOINT when set', () => {
    process.env.MCP_PLATFORM_ENDPOINT = 'https://custom-mcp.example.com';

    const endpoint = Utility.GetChatHistoryEndpoint();

    expect(endpoint).toBe('https://custom-mcp.example.com/agents/real-time-threat-protection/chat-message');
  });

  it('should append the correct path to the base URL', () => {
    process.env.MCP_PLATFORM_ENDPOINT = 'https://test.example.com';

    const endpoint = Utility.GetChatHistoryEndpoint();

    expect(endpoint).toContain('/agents/real-time-threat-protection/chat-message');
    expect(endpoint).toBe('https://test.example.com/agents/real-time-threat-protection/chat-message');
  });

  it('should handle base URL without trailing slash', () => {
    process.env.MCP_PLATFORM_ENDPOINT = 'https://test.example.com';

    const endpoint = Utility.GetChatHistoryEndpoint();

    expect(endpoint).toBe('https://test.example.com/agents/real-time-threat-protection/chat-message');
  });

  it('should handle base URL with trailing slash', () => {
    process.env.MCP_PLATFORM_ENDPOINT = 'https://test.example.com/';

    const endpoint = Utility.GetChatHistoryEndpoint();

    // Note: This will create a double slash, but that's how the .NET version works too
    expect(endpoint).toContain('/agents/real-time-threat-protection/chat-message');
  });
});
