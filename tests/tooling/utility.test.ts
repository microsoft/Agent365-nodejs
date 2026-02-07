// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Utility } from '../../packages/agents-a365-tooling/src/Utility';
import { TurnContext } from '@microsoft/agents-hosting';
import { Utility as RuntimeUtility } from '@microsoft/agents-a365-runtime';

describe('Utility - GetToolRequestHeaders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty object when no parameters provided', () => {
    const headers = Utility.GetToolRequestHeaders();
    expect(headers).toEqual({});
  });

  it('should add Authorization header when authToken is provided', () => {
    const headers = Utility.GetToolRequestHeaders('my-auth-token');
    expect(headers['Authorization']).toBe('Bearer my-auth-token');
  });

  it('should not add Authorization header when authToken is undefined', () => {
    const headers = Utility.GetToolRequestHeaders(undefined);
    expect(headers['Authorization']).toBeUndefined();
  });

  it('should not add Authorization header when authToken is empty string', () => {
    const headers = Utility.GetToolRequestHeaders('');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('should add x-ms-channel-id header when turnContext has channelId', () => {
    const mockContext = {
      activity: {
        channelId: 'msteams',
      },
    } as unknown as TurnContext;

    const headers = Utility.GetToolRequestHeaders(undefined, mockContext);
    expect(headers['x-ms-channel-id']).toBe('msteams');
  });

  it('should add x-ms-subchannel-id header when turnContext has channelIdSubChannel', () => {
    const mockContext = {
      activity: {
        channelIdSubChannel: 'personal',
      },
    } as unknown as TurnContext;

    const headers = Utility.GetToolRequestHeaders(undefined, mockContext);
    expect(headers['x-ms-subchannel-id']).toBe('personal');
  });

  it('should add User-Agent header when options.orchestratorName is provided', () => {
    const headers = Utility.GetToolRequestHeaders(undefined, undefined, { orchestratorName: 'Claude' });
    expect(headers['User-Agent']).toBeDefined();
    expect(headers['User-Agent']).toMatch(/Agent365SDK\/.+/);
    expect(headers['User-Agent']).toContain('Claude');
  });

  it('should not add User-Agent header when orchestratorName is not provided', () => {
    const headers = Utility.GetToolRequestHeaders(undefined, undefined, {});
    expect(headers['User-Agent']).toBeUndefined();
  });

  it('should add all headers when all parameters are provided', () => {
    const mockContext = {
      activity: {
        channelId: 'msteams',
        channelIdSubChannel: 'personal',
      },
    } as unknown as TurnContext;

    const headers = Utility.GetToolRequestHeaders('my-token', mockContext, { orchestratorName: 'OpenAI' });

    expect(headers['Authorization']).toBe('Bearer my-token');
    expect(headers['x-ms-channel-id']).toBe('msteams');
    expect(headers['x-ms-subchannel-id']).toBe('personal');
    expect(headers['User-Agent']).toBeDefined();
    expect(headers['User-Agent']).toContain('OpenAI');
  });

  it('should handle turnContext with missing activity gracefully', () => {
    const mockContext = {} as unknown as TurnContext;

    const headers = Utility.GetToolRequestHeaders('token', mockContext);
    expect(headers['Authorization']).toBe('Bearer token');
    expect(headers['x-ms-channel-id']).toBeUndefined();
    expect(headers['x-ms-subchannel-id']).toBeUndefined();
  });

  it('should handle turnContext with activity but missing channelId', () => {
    const mockContext = {
      activity: {},
    } as unknown as TurnContext;

    const headers = Utility.GetToolRequestHeaders('token', mockContext);
    expect(headers['x-ms-channel-id']).toBeUndefined();
  });
});

describe('Utility - GetToolRequestHeaders x-ms-agentid', () => {
  let getAgentIdFromTokenSpy: jest.SpiedFunction<typeof RuntimeUtility.getAgentIdFromToken>;
  let getApplicationNameSpy: jest.SpiedFunction<typeof RuntimeUtility.getApplicationName>;

  beforeEach(() => {
    getAgentIdFromTokenSpy = jest.spyOn(RuntimeUtility, 'getAgentIdFromToken');
    getApplicationNameSpy = jest.spyOn(RuntimeUtility, 'getApplicationName');
  });

  afterEach(() => {
    getAgentIdFromTokenSpy.mockRestore();
    getApplicationNameSpy.mockRestore();
  });

  it('should not add x-ms-agentid header when authToken is not provided', () => {
    const headers = Utility.GetToolRequestHeaders(undefined);
    expect(headers['x-ms-agentid']).toBeUndefined();
  });

  it('should not add x-ms-agentid header when authToken is empty string', () => {
    const headers = Utility.GetToolRequestHeaders('');
    expect(headers['x-ms-agentid']).toBeUndefined();
  });

  it('should add x-ms-agentid from agenticAppBlueprintId when available (highest priority)', () => {
    const mockContext = {
      activity: {
        from: {
          agenticAppBlueprintId: 'blueprint-id-123',
        },
      },
    } as unknown as TurnContext;

    // Even if token has claims, blueprintId should take priority
    getAgentIdFromTokenSpy.mockReturnValue('token-agent-id');
    getApplicationNameSpy.mockReturnValue('my-app');

    const headers = Utility.GetToolRequestHeaders('valid-token', mockContext);
    expect(headers['x-ms-agentid']).toBe('blueprint-id-123');
  });

  it('should fall back to token claims when agenticAppBlueprintId is empty string', () => {
    const mockContext = {
      activity: {
        from: {
          agenticAppBlueprintId: '', // Empty string should be treated as falsy
        },
      },
    } as unknown as TurnContext;

    getAgentIdFromTokenSpy.mockReturnValue('token-agent-id-fallback');
    getApplicationNameSpy.mockReturnValue('my-app');

    const headers = Utility.GetToolRequestHeaders('valid-token', mockContext);
    // Empty string blueprintId should not take priority - should fall back to token
    expect(headers['x-ms-agentid']).toBe('token-agent-id-fallback');
    expect(getAgentIdFromTokenSpy).toHaveBeenCalledWith('valid-token');
  });

  it('should add x-ms-agentid from token claims when blueprintId is not available', () => {
    const mockContext = {
      activity: {
        from: {},
      },
    } as unknown as TurnContext;

    getAgentIdFromTokenSpy.mockReturnValue('token-agent-id-456');
    getApplicationNameSpy.mockReturnValue('my-app');

    const headers = Utility.GetToolRequestHeaders('valid-token', mockContext);
    expect(headers['x-ms-agentid']).toBe('token-agent-id-456');
    expect(getAgentIdFromTokenSpy).toHaveBeenCalledWith('valid-token');
  });

  it('should add x-ms-agentid from application name when token claims are empty', () => {
    const mockContext = {
      activity: {
        from: {},
      },
    } as unknown as TurnContext;

    getAgentIdFromTokenSpy.mockReturnValue('');
    getApplicationNameSpy.mockReturnValue('my-application-name');

    const headers = Utility.GetToolRequestHeaders('valid-token', mockContext);
    expect(headers['x-ms-agentid']).toBe('my-application-name');
    expect(getApplicationNameSpy).toHaveBeenCalled();
  });

  it('should not add x-ms-agentid when no agent ID can be resolved', () => {
    const mockContext = {
      activity: {
        from: {},
      },
    } as unknown as TurnContext;

    getAgentIdFromTokenSpy.mockReturnValue('');
    getApplicationNameSpy.mockReturnValue(undefined);

    const headers = Utility.GetToolRequestHeaders('valid-token', mockContext);
    expect(headers['x-ms-agentid']).toBeUndefined();
  });

  it('should work without turnContext when token has agent ID', () => {
    getAgentIdFromTokenSpy.mockReturnValue('token-only-agent-id');

    const headers = Utility.GetToolRequestHeaders('valid-token');
    expect(headers['x-ms-agentid']).toBe('token-only-agent-id');
  });

  it('should use application name as fallback when no turnContext and no token claims', () => {
    getAgentIdFromTokenSpy.mockReturnValue('');
    getApplicationNameSpy.mockReturnValue('fallback-app-name');

    const headers = Utility.GetToolRequestHeaders('valid-token');
    expect(headers['x-ms-agentid']).toBe('fallback-app-name');
  });

  it('should handle turnContext with undefined from property', () => {
    const mockContext = {
      activity: {},
    } as unknown as TurnContext;

    getAgentIdFromTokenSpy.mockReturnValue('token-agent-id');

    const headers = Utility.GetToolRequestHeaders('valid-token', mockContext);
    expect(headers['x-ms-agentid']).toBe('token-agent-id');
  });

  it('should handle turnContext with missing activity', () => {
    const mockContext = {} as unknown as TurnContext;

    getAgentIdFromTokenSpy.mockReturnValue('token-agent-id');

    const headers = Utility.GetToolRequestHeaders('valid-token', mockContext);
    expect(headers['x-ms-agentid']).toBe('token-agent-id');
  });
});

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
