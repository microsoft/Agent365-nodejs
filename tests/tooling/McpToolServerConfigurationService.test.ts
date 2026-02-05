// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src/McpToolServerConfigurationService';
import { Utility } from '../../packages/agents-a365-tooling/src/Utility';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from '../../packages/agents-a365-tooling/src/configuration';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { AgenticAuthenticationService, DefaultConfigurationProvider, Utility as RuntimeUtility } from '@microsoft/agents-a365-runtime';
import fs from 'fs';

describe('McpToolServerConfigurationService', () => {
  let service: McpToolServerConfigurationService;
  const originalEnv = process.env;

  beforeEach(() => {
    service = new McpToolServerConfigurationService();
    process.env = { ...originalEnv };
    // Set to development mode to read from manifest
    process.env.NODE_ENV = 'Development';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('listToolServers with custom URLs', () => {
    it('should use custom URL when provided in manifest', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          {
            mcpServerName: 'customServer',
            url: 'http://localhost:3000/custom-mcp'
          }
        ]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].mcpServerName).toBe('customServer');
      expect(servers[0].url).toBe('http://localhost:3000/custom-mcp');
    });

    it('should build URL when not provided in manifest', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          {
            mcpServerName: 'mcp_MailTools'
          }
        ]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].mcpServerName).toBe('mcp_MailTools');
      // In development mode, should use mock server URL
      expect(servers[0].url).toBe(Utility.BuildMcpServerUrl('mcp_MailTools'));
    });

    it('should handle mix of custom and default URLs in manifest', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          {
            mcpServerName: 'customServer',
            url: 'https://custom.example.com/mcp'
          },
          {
            mcpServerName: 'mcp_MailTools'
          },
          {
            mcpServerName: 'anotherCustom',
            url: 'http://localhost:5000/mcp-server'
          }
        ]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(3);
      
      // First server has custom URL
      expect(servers[0].mcpServerName).toBe('customServer');
      expect(servers[0].url).toBe('https://custom.example.com/mcp');
      
      // Second server uses default URL building
      expect(servers[1].mcpServerName).toBe('mcp_MailTools');
      expect(servers[1].url).toBe(Utility.BuildMcpServerUrl('mcp_MailTools'));
      
      // Third server has custom URL
      expect(servers[2].mcpServerName).toBe('anotherCustom');
      expect(servers[2].url).toBe('http://localhost:5000/mcp-server');
    });

    it('should return empty array when manifest file does not exist', async () => {
      // Arrange
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(0);
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should handle empty mcpServers array in manifest', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: []
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(0);
    });

    it('should handle missing mcpServers property in manifest', async () => {
      // Arrange
      const manifestContent = {};

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(0);
    });

    it('should use mcpServerUniqueName as fallback when mcpServerName is not provided', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          {
            mcpServerUniqueName: 'mcp_UniqueServer'
          }
        ]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].mcpServerName).toBe('mcp_UniqueServer');
      expect(servers[0].url).toBe(Utility.BuildMcpServerUrl('mcp_UniqueServer'));
    });

    it('should prefer mcpServerName over mcpServerUniqueName when both are provided', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          {
            mcpServerName: 'mcp_PreferredName',
            mcpServerUniqueName: 'mcp_FallbackName'
          }
        ]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].mcpServerName).toBe('mcp_PreferredName');
      expect(servers[0].url).toBe(Utility.BuildMcpServerUrl('mcp_PreferredName'));
    });

    it('should return empty array and log error when neither mcpServerName nor mcpServerUniqueName is provided', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          {
            url: 'http://localhost:3000/custom-mcp'
          }
        ]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Either mcpServerName or mcpServerUniqueName must be provided')
      );
    });

    it('should preserve custom headers when provided in manifest', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          {
            mcpServerName: 'serverWithHeaders',
            url: 'http://localhost:3000/custom-mcp',
            headers: {
              'Authorization': 'Bearer token123',
              'X-Custom-Header': 'custom-value'
            }
          },
          {
            mcpServerName: 'serverWithoutHeaders',
            url: 'http://localhost:4000/another-mcp'
          }
        ]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(2);

      // First server should have headers preserved
      expect(servers[0].mcpServerName).toBe('serverWithHeaders');
      expect(servers[0].url).toBe('http://localhost:3000/custom-mcp');
      expect(servers[0].headers).toEqual({
        'Authorization': 'Bearer token123',
        'X-Custom-Header': 'custom-value'
      });

      // Second server should have undefined headers
      expect(servers[1].mcpServerName).toBe('serverWithoutHeaders');
      expect(servers[1].url).toBe('http://localhost:4000/another-mcp');
      expect(servers[1].headers).toBeUndefined();
    });

    it('should return empty array and log error when manifest contains invalid JSON', async () => {
      // Arrange
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('{ invalid json }');
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(0);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error reading or parsing ToolingManifest.json')
      );
    });
  });

  describe('isDevScenario detection', () => {
    it.each([
      ['Development', true],
      ['development', true],
      ['DEVELOPMENT', true],
      ['DeVeLoPmEnT', true],
    ])('should detect development mode when NODE_ENV is "%s"', async (nodeEnv, expected) => {
      // Arrange
      process.env.NODE_ENV = nodeEnv;
      const manifestContent = { mcpServers: [{ mcpServerName: 'testServer', url: 'http://test.com' }] };
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert - if dev scenario, it reads from manifest and returns the server
      if (expected) {
        expect(servers).toHaveLength(1);
        expect(servers[0].mcpServerName).toBe('testServer');
      }
    });

    it.each([
      ['production'],
      ['Production'],
      ['PRODUCTION'],
      ['staging'],
      ['test'],
      [''],
    ])('should use gateway (not manifest) when NODE_ENV is "%s"', async (nodeEnv) => {
      // Arrange
      process.env.NODE_ENV = nodeEnv;

      // Act & Assert - In production mode, the service calls the gateway which requires auth token
      // The error "Authentication token is required" comes from Utility.ValidateAuthToken
      // which is only called in production mode (gateway path)
      await expect(service.listToolServers('test-agent-id', '')).rejects.toThrow('Authentication token is required');
    });

    it('should use gateway (not manifest) when NODE_ENV is undefined', async () => {
      // Arrange
      delete process.env.NODE_ENV;

      // Act & Assert - In production mode (default), the service calls the gateway which requires auth token
      await expect(service.listToolServers('test-agent-id', '')).rejects.toThrow('Authentication token is required');
    });
  });

  describe('listToolServers legacy signatures (deprecated)', () => {
    it('should work with two parameters (agenticAppId, authToken)', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act - using legacy signature (deprecated but still works)
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token');

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].mcpServerName).toBe('testServer');
    });

    it('should work with ToolOptions as third parameter', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

      // Act - using legacy signature with options (deprecated but still works)
      const servers = await service.listToolServers('test-agent-id', 'mock-auth-token', { orchestratorName: 'Claude' });

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].mcpServerName).toBe('testServer');
    });

    it('should throw clear error when authToken is not a string in legacy signature', async () => {
      // Act & Assert - passing an object instead of string for authToken
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.listToolServers('test-agent-id', { notAString: true } as any)
      ).rejects.toThrow('authToken must be a string when using the legacy listToolServers(agenticAppId, authToken) signature');
    });
  });

  describe('listToolServers new signature (TurnContext, Authorization, authHandlerName)', () => {
    let mockContext: TurnContext;
    let mockAuthorization: Authorization;
    let getAgenticUserTokenSpy: jest.SpiedFunction<typeof AgenticAuthenticationService.GetAgenticUserToken>;
    let resolveAgentIdentitySpy: jest.SpiedFunction<typeof RuntimeUtility.ResolveAgentIdentity>;
    let validateAuthTokenSpy: jest.SpiedFunction<typeof Utility.ValidateAuthToken>;

    // Create a mock JWT token with valid format (header.payload.signature) and future expiration
    const createMockJwt = () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const signature = 'mock-signature';
      return `${header}.${payload}.${signature}`;
    };

    beforeEach(() => {
      mockContext = {
        activity: {
          from: { agenticAppBlueprintId: 'blueprint-123' },
          channelId: 'msteams',
          recipient: { id: 'recipient-id' },
          conversation: { id: 'conversation-id' },
          isAgenticRequest: jest.fn().mockReturnValue(false),
          getAgenticInstanceId: jest.fn().mockReturnValue(undefined)
        },
        sendActivity: jest.fn()
      } as unknown as TurnContext;

      mockAuthorization = {} as Authorization;

      getAgenticUserTokenSpy = jest.spyOn(AgenticAuthenticationService, 'GetAgenticUserToken');
      resolveAgentIdentitySpy = jest.spyOn(RuntimeUtility, 'ResolveAgentIdentity');
      validateAuthTokenSpy = jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});
    });

    afterEach(() => {
      getAgenticUserTokenSpy.mockRestore();
      resolveAgentIdentitySpy.mockRestore();
      validateAuthTokenSpy.mockRestore();
    });

    it('should auto-generate token when not provided', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
      };
      const mockToken = createMockJwt();

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));
      getAgenticUserTokenSpy.mockResolvedValue(mockToken);
      resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');

      // Act - new signature without authToken (will be auto-generated)
      const servers = await service.listToolServers(mockContext, mockAuthorization, 'graph');

      // Assert
      expect(servers).toHaveLength(1);
      expect(getAgenticUserTokenSpy).toHaveBeenCalledWith(mockAuthorization, 'graph', mockContext, ['ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default']);
      expect(resolveAgentIdentitySpy).toHaveBeenCalledWith(mockContext, mockToken);
    });

    it('should use provided token when available', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
      };
      const mockToken = createMockJwt();

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));
      resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');

      // Act - new signature with explicit authToken
      const servers = await service.listToolServers(mockContext, mockAuthorization, 'graph', mockToken);

      // Assert
      expect(servers).toHaveLength(1);
      expect(getAgenticUserTokenSpy).not.toHaveBeenCalled();
      expect(resolveAgentIdentitySpy).toHaveBeenCalledWith(mockContext, mockToken);
    });

    it('should work with all parameters including options', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
      };
      const mockToken = createMockJwt();

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));
      resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');

      // Act - new signature with all parameters
      const servers = await service.listToolServers(
        mockContext,
        mockAuthorization,
        'graph',
        mockToken,
        { orchestratorName: 'Claude' }
      );

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].mcpServerName).toBe('testServer');
    });

    it('should propagate error when GetAgenticUserToken throws', async () => {
      // Arrange
      getAgenticUserTokenSpy.mockRejectedValue(new Error('Token exchange failed'));

      // Act & Assert
      await expect(
        service.listToolServers(mockContext, mockAuthorization, 'graph')
      ).rejects.toThrow('Token exchange failed');
    });

    it('should throw error when GetAgenticUserToken returns undefined', async () => {
      // Arrange
      getAgenticUserTokenSpy.mockResolvedValue(undefined as unknown as string);

      // Act & Assert
      await expect(
        service.listToolServers(mockContext, mockAuthorization, 'graph')
      ).rejects.toThrow('Failed to obtain authentication token from token exchange');
    });

    it('should throw error when GetAgenticUserToken returns empty string', async () => {
      // Arrange
      getAgenticUserTokenSpy.mockResolvedValue('');

      // Act & Assert
      await expect(
        service.listToolServers(mockContext, mockAuthorization, 'graph')
      ).rejects.toThrow('Failed to obtain authentication token from token exchange');
    });

    it('should propagate error when ValidateAuthToken fails', async () => {
      // Arrange - need to be in production mode to trigger gateway path
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const mockToken = createMockJwt();
      resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');
      validateAuthTokenSpy.mockRestore(); // Remove mock to use real validation
      validateAuthTokenSpy = jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {
        throw new Error('Token has expired');
      });

      // Act & Assert
      await expect(
        service.listToolServers(mockContext, mockAuthorization, 'graph', mockToken)
      ).rejects.toThrow('Token has expired');

      // Cleanup
      process.env.NODE_ENV = originalEnv;
    });

    it('should throw clear error when authorization is a string in new signature', async () => {
      // Act & Assert - passing a string instead of Authorization object
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.listToolServers(mockContext, 'not-an-authorization-object' as any, 'graph')
      ).rejects.toThrow('authorization must be an Authorization object when using the new listToolServers(turnContext, authorization, authHandlerName) signature');
    });

    it('should throw clear error when authHandlerName is not a string in new signature', async () => {
      // Act & Assert - passing an object instead of string for authHandlerName
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.listToolServers(mockContext, mockAuthorization, { notAString: true } as any)
      ).rejects.toThrow('authHandlerName must be a string when using the new listToolServers(turnContext, authorization, authHandlerName) signature');
    });
  });

  describe('listToolServers new signature (development mode)', () => {
    let mockContext: TurnContext;
    let mockAuthorization: Authorization;
    let getAgenticUserTokenSpy: jest.SpiedFunction<typeof AgenticAuthenticationService.GetAgenticUserToken>;
    let resolveAgentIdentitySpy: jest.SpiedFunction<typeof RuntimeUtility.ResolveAgentIdentity>;
    let validateAuthTokenSpy: jest.SpiedFunction<typeof Utility.ValidateAuthToken>;
    const originalEnv = process.env.NODE_ENV;

    const createMockJwt = () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const signature = 'mock-signature';
      return `${header}.${payload}.${signature}`;
    };

    beforeEach(() => {
      // Explicitly set development mode
      process.env.NODE_ENV = 'Development';

      mockContext = {
        activity: {
          from: { agenticAppBlueprintId: 'blueprint-123' },
          channelId: 'msteams',
          recipient: { id: 'recipient-id' },
          conversation: { id: 'conversation-id' },
          isAgenticRequest: jest.fn().mockReturnValue(false),
          getAgenticInstanceId: jest.fn().mockReturnValue(undefined)
        },
        sendActivity: jest.fn()
      } as unknown as TurnContext;

      mockAuthorization = {} as Authorization;

      getAgenticUserTokenSpy = jest.spyOn(AgenticAuthenticationService, 'GetAgenticUserToken');
      resolveAgentIdentitySpy = jest.spyOn(RuntimeUtility, 'ResolveAgentIdentity');
      validateAuthTokenSpy = jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      getAgenticUserTokenSpy.mockRestore();
      resolveAgentIdentitySpy.mockRestore();
      validateAuthTokenSpy.mockRestore();
    });

    it('should read from manifest file in development mode with new signature', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [
          { mcpServerName: 'devServer1', url: 'http://localhost:3000' },
          { mcpServerName: 'devServer2', url: 'http://localhost:3001' }
        ]
      };
      const mockToken = createMockJwt();

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));
      resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');

      // Act - use new signature in development mode
      const servers = await service.listToolServers(mockContext, mockAuthorization, 'graph', mockToken);

      // Assert - should read from manifest, not call gateway
      expect(servers).toHaveLength(2);
      expect(servers[0].mcpServerName).toBe('devServer1');
      expect(servers[1].mcpServerName).toBe('devServer2');
      expect(readFileSpy).toHaveBeenCalled();
    });

    it('should auto-generate token in development mode with new signature', async () => {
      // Arrange
      const manifestContent = {
        mcpServers: [{ mcpServerName: 'devServer', url: 'http://localhost:3000' }]
      };
      const mockToken = createMockJwt();

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));
      getAgenticUserTokenSpy.mockResolvedValue(mockToken);
      resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');

      // Act - new signature without authToken in dev mode
      const servers = await service.listToolServers(mockContext, mockAuthorization, 'graph');

      // Assert - token should still be auto-generated even in dev mode
      expect(servers).toHaveLength(1);
      expect(getAgenticUserTokenSpy).toHaveBeenCalledWith(mockAuthorization, 'graph', mockContext, ['ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default']);
    });
  });

  describe('listToolServers new signature (production mode)', () => {
    let mockContext: TurnContext;
    let mockAuthorization: Authorization;
    let resolveAgentIdentitySpy: jest.SpiedFunction<typeof RuntimeUtility.ResolveAgentIdentity>;
    let validateAuthTokenSpy: jest.SpiedFunction<typeof Utility.ValidateAuthToken>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let axiosGetSpy: any;
    const originalEnv = process.env.NODE_ENV;

    const createMockJwt = () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const signature = 'mock-signature';
      return `${header}.${payload}.${signature}`;
    };

    beforeEach(() => {
      process.env.NODE_ENV = 'production';

      mockContext = {
        activity: {
          from: { agenticAppBlueprintId: 'blueprint-123' },
          channelId: 'msteams',
          recipient: { id: 'recipient-id' },
          conversation: { id: 'conversation-id' },
          isAgenticRequest: jest.fn().mockReturnValue(false),
          getAgenticInstanceId: jest.fn().mockReturnValue(undefined)
        },
        sendActivity: jest.fn()
      } as unknown as TurnContext;

      mockAuthorization = {} as Authorization;

      resolveAgentIdentitySpy = jest.spyOn(RuntimeUtility, 'ResolveAgentIdentity');
      validateAuthTokenSpy = jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});

      // Mock axios to capture the request
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const axios = require('axios');
      axiosGetSpy = jest.spyOn(axios, 'get');
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      resolveAgentIdentitySpy.mockRestore();
      validateAuthTokenSpy.mockRestore();
      axiosGetSpy.mockRestore();
    });

    it('should include x-ms-agentid header in production gateway requests', async () => {
      // Arrange
      const mockToken = createMockJwt();
      resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');
      axiosGetSpy.mockResolvedValue({
        data: [{ mcpServerName: 'testServer', url: 'http://test.com' }]
      });

      // Act
      await service.listToolServers(mockContext, mockAuthorization, 'graph', mockToken);

      // Assert
      expect(axiosGetSpy).toHaveBeenCalledTimes(1);
      const callArgs = axiosGetSpy.mock.calls[0] as [string, { headers: Record<string, string> }];
      const headers = callArgs[1].headers;

      // Verify x-ms-agentid header is present (from agenticAppBlueprintId)
      expect(headers['x-ms-agentid']).toBe('blueprint-123');
      expect(headers['Authorization']).toBe(`Bearer ${mockToken}`);
    });

    it('should call gateway endpoint with correct URL in production mode', async () => {
      // Arrange
      const mockToken = createMockJwt();
      resolveAgentIdentitySpy.mockReturnValue('my-agent-id');
      axiosGetSpy.mockResolvedValue({ data: [] });

      // Act
      await service.listToolServers(mockContext, mockAuthorization, 'graph', mockToken);

      // Assert
      expect(axiosGetSpy).toHaveBeenCalledWith(
        expect.stringContaining('/agents/my-agent-id/mcpServers'),
        expect.any(Object)
      );
    });
  });

  describe('configuration provider injection', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.restoreAllMocks();
    });

    describe('custom mcpPlatformEndpoint override', () => {
      it('should use custom endpoint when configuration override is provided', async () => {
        // Arrange
        process.env.NODE_ENV = 'production';
        const customEndpoint = 'https://custom.tenant.endpoint.com';
        
        const customConfig = new ToolingConfiguration({
          mcpPlatformEndpoint: () => customEndpoint,
          useToolingManifest: () => false
        });
        const customProvider = new DefaultConfigurationProvider(() => customConfig);
        const serviceWithCustomConfig = new McpToolServerConfigurationService(customProvider);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');
        const axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
          data: [{ mcpServerName: 'testServer', url: 'http://test.com' }]
        });
        jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});

        const mockToken = createMockJwt();

        // Act
        await serviceWithCustomConfig.listToolServers('my-agent-id', mockToken);

        // Assert - verify the custom endpoint is used in the gateway URL
        expect(axiosGetSpy).toHaveBeenCalledWith(
          `${customEndpoint}/agents/my-agent-id/mcpServers`,
          expect.any(Object)
        );
      });

      it('should use different endpoints for different tenant configurations', async () => {
        // Arrange - simulates multi-tenant scenario
        process.env.NODE_ENV = 'production';
        
        const tenant1Endpoint = 'https://tenant1.example.com';
        const tenant2Endpoint = 'https://tenant2.example.com';

        const tenant1Config = new ToolingConfiguration({
          mcpPlatformEndpoint: () => tenant1Endpoint,
          useToolingManifest: () => false
        });
        const tenant1Provider = new DefaultConfigurationProvider(() => tenant1Config);
        const service1 = new McpToolServerConfigurationService(tenant1Provider);

        const tenant2Config = new ToolingConfiguration({
          mcpPlatformEndpoint: () => tenant2Endpoint,
          useToolingManifest: () => false
        });
        const tenant2Provider = new DefaultConfigurationProvider(() => tenant2Config);
        const service2 = new McpToolServerConfigurationService(tenant2Provider);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');
        const axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({ data: [] });
        jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});

        const mockToken = createMockJwt();

        // Act
        await service1.listToolServers('agent-1', mockToken);
        await service2.listToolServers('agent-2', mockToken);

        // Assert - each service uses its own endpoint
        expect(axiosGetSpy).toHaveBeenNthCalledWith(
          1,
          `${tenant1Endpoint}/agents/agent-1/mcpServers`,
          expect.any(Object)
        );
        expect(axiosGetSpy).toHaveBeenNthCalledWith(
          2,
          `${tenant2Endpoint}/agents/agent-2/mcpServers`,
          expect.any(Object)
        );
      });

      it('should normalize endpoint URL by removing trailing slashes', async () => {
        // Arrange
        process.env.NODE_ENV = 'production';
        const customEndpoint = 'https://custom.endpoint.com///';
        
        const customConfig = new ToolingConfiguration({
          mcpPlatformEndpoint: () => customEndpoint,
          useToolingManifest: () => false
        });
        const customProvider = new DefaultConfigurationProvider(() => customConfig);
        const serviceWithCustomConfig = new McpToolServerConfigurationService(customProvider);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');
        const axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({ data: [] });
        jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});

        const mockToken = createMockJwt();

        // Act
        await serviceWithCustomConfig.listToolServers('my-agent-id', mockToken);

        // Assert - URL should not have double slashes
        expect(axiosGetSpy).toHaveBeenCalledWith(
          'https://custom.endpoint.com/agents/my-agent-id/mcpServers',
          expect.any(Object)
        );
      });
    });

    describe('custom useToolingManifest override', () => {
      it('should force manifest mode when override returns true even in production', async () => {
        // Arrange
        process.env.NODE_ENV = 'production'; // Normally would use gateway

        const customConfig = new ToolingConfiguration({
          useToolingManifest: () => true // Force manifest mode
        });
        const customProvider = new DefaultConfigurationProvider(() => customConfig);
        const serviceWithCustomConfig = new McpToolServerConfigurationService(customProvider);

        const manifestContent = {
          mcpServers: [{ mcpServerName: 'manifestServer', url: 'http://manifest.local' }]
        };
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');
        const axiosGetSpy = jest.spyOn(axios, 'get');

        // Act
        const servers = await serviceWithCustomConfig.listToolServers('my-agent-id', 'mock-token');

        // Assert - should read from manifest, not call gateway
        expect(servers).toHaveLength(1);
        expect(servers[0].mcpServerName).toBe('manifestServer');
        expect(servers[0].url).toBe('http://manifest.local');
        expect(axiosGetSpy).not.toHaveBeenCalled();
      });

      it('should force gateway mode when override returns false even in development', async () => {
        // Arrange
        process.env.NODE_ENV = 'Development'; // Normally would use manifest

        const customConfig = new ToolingConfiguration({
          useToolingManifest: () => false // Force gateway mode
        });
        const customProvider = new DefaultConfigurationProvider(() => customConfig);
        const serviceWithCustomConfig = new McpToolServerConfigurationService(customProvider);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');
        const axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
          data: [{ mcpServerName: 'gatewayServer', url: 'http://gateway.com' }]
        });
        jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});

        const readFileSpy = jest.spyOn(fs, 'readFileSync');
        const mockToken = createMockJwt();

        // Act
        const servers = await serviceWithCustomConfig.listToolServers('my-agent-id', mockToken);

        // Assert - should call gateway, not read manifest
        expect(servers).toHaveLength(1);
        expect(servers[0].mcpServerName).toBe('gatewayServer');
        expect(axiosGetSpy).toHaveBeenCalled();
        expect(readFileSpy).not.toHaveBeenCalled();
      });

      it('should allow dynamic manifest/gateway switching based on context', async () => {
        // Arrange - simulate a dynamic override that changes behavior per request
        let useManifest = true;

        const customConfig = new ToolingConfiguration({
          useToolingManifest: () => useManifest // Dynamic based on external state
        });
        const customProvider = new DefaultConfigurationProvider(() => customConfig);
        const serviceWithCustomConfig = new McpToolServerConfigurationService(customProvider);

        const manifestContent = {
          mcpServers: [{ mcpServerName: 'manifestServer', url: 'http://manifest.local' }]
        };
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');
        const axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({
          data: [{ mcpServerName: 'gatewayServer', url: 'http://gateway.com' }]
        });
        jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});

        const mockToken = createMockJwt();

        // Act 1 - with useManifest = true
        const servers1 = await serviceWithCustomConfig.listToolServers('my-agent-id', mockToken);
        expect(servers1[0].mcpServerName).toBe('manifestServer');
        expect(axiosGetSpy).not.toHaveBeenCalled();

        // Change the dynamic value
        useManifest = false;

        // Act 2 - with useManifest = false (same service instance)
        const servers2 = await serviceWithCustomConfig.listToolServers('my-agent-id', mockToken);
        expect(servers2[0].mcpServerName).toBe('gatewayServer');
        expect(axiosGetSpy).toHaveBeenCalled();
      });
    });

    describe('custom mcpPlatformAuthenticationScope override', () => {
      let mockContext: TurnContext;
      let mockAuthorization: Authorization;
      let getAgenticUserTokenSpy: jest.SpiedFunction<typeof AgenticAuthenticationService.GetAgenticUserToken>;
      let resolveAgentIdentitySpy: jest.SpiedFunction<typeof RuntimeUtility.ResolveAgentIdentity>;

      beforeEach(() => {
        mockContext = {
          activity: {
            from: { agenticAppBlueprintId: 'blueprint-123' },
            channelId: 'msteams',
            recipient: { id: 'recipient-id' },
            conversation: { id: 'conversation-id' },
            isAgenticRequest: jest.fn().mockReturnValue(false),
            getAgenticInstanceId: jest.fn().mockReturnValue(undefined)
          },
          sendActivity: jest.fn()
        } as unknown as TurnContext;

        mockAuthorization = {} as Authorization;

        getAgenticUserTokenSpy = jest.spyOn(AgenticAuthenticationService, 'GetAgenticUserToken');
        resolveAgentIdentitySpy = jest.spyOn(RuntimeUtility, 'ResolveAgentIdentity');
      });

      afterEach(() => {
        getAgenticUserTokenSpy.mockRestore();
        resolveAgentIdentitySpy.mockRestore();
      });

      it('should use custom authentication scope when auto-generating token', async () => {
        // Arrange
        const customScope = 'api://custom-app-id/.default';
        
        const customConfig = new ToolingConfiguration({
          mcpPlatformAuthenticationScope: () => customScope,
          useToolingManifest: () => true // Use manifest to avoid gateway complications
        });
        const customProvider = new DefaultConfigurationProvider(() => customConfig);
        const serviceWithCustomConfig = new McpToolServerConfigurationService(customProvider);

        const manifestContent = {
          mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
        };
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

        const mockToken = createMockJwt();
        getAgenticUserTokenSpy.mockResolvedValue(mockToken);
        resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');

        // Act - call without authToken to trigger auto-generation
        await serviceWithCustomConfig.listToolServers(mockContext, mockAuthorization, 'graph');

        // Assert - GetAgenticUserToken should be called with the custom scope
        expect(getAgenticUserTokenSpy).toHaveBeenCalledWith(
          mockAuthorization,
          'graph',
          mockContext,
          [customScope]
        );
      });

      it('should use different scopes for different tenant configurations', async () => {
        // Arrange - simulates multi-tenant scenario with different auth requirements
        const tenant1Scope = 'api://tenant1-app-id/.default';
        const tenant2Scope = 'api://tenant2-app-id/.default';

        const tenant1Config = new ToolingConfiguration({
          mcpPlatformAuthenticationScope: () => tenant1Scope,
          useToolingManifest: () => true
        });
        const tenant1Provider = new DefaultConfigurationProvider(() => tenant1Config);
        const service1 = new McpToolServerConfigurationService(tenant1Provider);

        const tenant2Config = new ToolingConfiguration({
          mcpPlatformAuthenticationScope: () => tenant2Scope,
          useToolingManifest: () => true
        });
        const tenant2Provider = new DefaultConfigurationProvider(() => tenant2Config);
        const service2 = new McpToolServerConfigurationService(tenant2Provider);

        const manifestContent = {
          mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
        };
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

        const mockToken = createMockJwt();
        getAgenticUserTokenSpy.mockResolvedValue(mockToken);
        resolveAgentIdentitySpy.mockReturnValue('resolved-agent-id');

        // Act
        await service1.listToolServers(mockContext, mockAuthorization, 'graph');
        await service2.listToolServers(mockContext, mockAuthorization, 'graph');

        // Assert - each service uses its own scope
        expect(getAgenticUserTokenSpy).toHaveBeenNthCalledWith(
          1,
          mockAuthorization,
          'graph',
          mockContext,
          [tenant1Scope]
        );
        expect(getAgenticUserTokenSpy).toHaveBeenNthCalledWith(
          2,
          mockAuthorization,
          'graph',
          mockContext,
          [tenant2Scope]
        );
      });
    });

    describe('default configuration provider behavior', () => {
      it('should use default configuration when no provider is specified', async () => {
        // Arrange
        process.env.NODE_ENV = 'Development';
        const defaultService = new McpToolServerConfigurationService();
        const serviceWithExplicitDefault = new McpToolServerConfigurationService(defaultToolingConfigurationProvider);

        const manifestContent = {
          mcpServers: [{ mcpServerName: 'testServer', url: 'http://localhost:3000' }]
        };
        jest.spyOn(fs, 'existsSync').mockReturnValue(true);
        jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(manifestContent));

        // Act
        const servers1 = await defaultService.listToolServers('agent-id', 'mock-token');
        const servers2 = await serviceWithExplicitDefault.listToolServers('agent-id', 'mock-token');

        // Assert - both should behave identically
        expect(servers1).toEqual(servers2);
      });

      it('should respect environment variables when using default configuration', async () => {
        // Arrange
        const customEndpoint = 'https://env-based-endpoint.com';
        process.env.MCP_PLATFORM_ENDPOINT = customEndpoint;
        process.env.NODE_ENV = 'production';

        // Create a fresh configuration to pick up env var
        const freshConfig = new ToolingConfiguration();
        const freshProvider = new DefaultConfigurationProvider(() => freshConfig);
        const serviceWithFreshConfig = new McpToolServerConfigurationService(freshProvider);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');
        const axiosGetSpy = jest.spyOn(axios, 'get').mockResolvedValue({ data: [] });
        jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});

        const mockToken = createMockJwt();

        // Act
        await serviceWithFreshConfig.listToolServers('my-agent-id', mockToken);

        // Assert - should use the environment-based endpoint
        expect(axiosGetSpy).toHaveBeenCalledWith(
          `${customEndpoint}/agents/my-agent-id/mcpServers`,
          expect.any(Object)
        );
      });
    });

    // Helper to create mock JWT tokens
    function createMockJwt(): string {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      const signature = 'mock-signature';
      return `${header}.${payload}.${signature}`;
    }
  });
});
