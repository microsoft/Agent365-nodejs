// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';
import { McpToolServerConfigurationService, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { Agent, MCPServerStreamableHttp } from '@openai/agents';

// Mock the dependencies
jest.mock('@microsoft/agents-a365-tooling');
jest.mock('@microsoft/agents-a365-runtime');
jest.mock('@openai/agents');

describe('McpToolRegistrationService (OpenAI)', () => {
  let service: McpToolRegistrationService;
  let mockConfigService: jest.Mocked<McpToolServerConfigurationService>;
  let mockAgent: jest.Mocked<Agent>;
  let mockTurnContext: jest.Mocked<TurnContext>;
  let mockAuthorization: jest.Mocked<Authorization>;
  let MockMCPServerStreamableHttp: jest.MockedClass<typeof MCPServerStreamableHttp>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock the config service
    mockConfigService = {
      listToolServers: jest.fn()
    } as any;

    // Mock the service constructor
    (McpToolServerConfigurationService as jest.Mock).mockImplementation(() => mockConfigService);

    // Mock utility methods
    (Utility.ValidateAuthToken as jest.Mock) = jest.fn();
    (AgenticAuthenticationService.GetAgenticUserToken as jest.Mock) = jest.fn();

    // Mock OpenAI Agent
    mockAgent = {
      mcpServers: []
    } as any;

    // Mock MCP Server
    MockMCPServerStreamableHttp = MCPServerStreamableHttp as jest.MockedClass<typeof MCPServerStreamableHttp>;
    MockMCPServerStreamableHttp.mockImplementation((config: any) => {
      return {
        url: config.url,
        name: config.name,
        requestInit: config.requestInit
      } as any;
    });

    // Create mock context and authorization
    mockTurnContext = {
      activity: { type: 'message' }
    } as any;

    mockAuthorization = {
      token: 'mock-token'
    } as any;

    service = new McpToolRegistrationService();
  });

  describe('Constructor', () => {
    it('should create an instance', () => {
      // Assert
      expect(service).toBeInstanceOf(McpToolRegistrationService);
    });

    it('should create config service instance', () => {
      // Assert
      expect(McpToolServerConfigurationService).toHaveBeenCalled();
    });
  });

  describe('addToolServersToAgent Method', () => {
    it('should throw error when agent is null or undefined', async () => {
      // Assert
      await expect(service.addToolServersToAgent(
        null as any,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      )).rejects.toThrow('Agent is Required');

      await expect(service.addToolServersToAgent(
        undefined as any,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      )).rejects.toThrow('Agent is Required');
    });

    it('should use provided authToken when available', async () => {
      // Arrange
      const authToken = 'provided-token';
      mockConfigService.listToolServers.mockResolvedValue([]);

      // Act
      const result = await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        authToken
      );

      // Assert
      expect(Utility.ValidateAuthToken).toHaveBeenCalledWith(authToken);
      expect(AgenticAuthenticationService.GetAgenticUserToken).not.toHaveBeenCalled();
      expect(mockConfigService.listToolServers).toHaveBeenCalledWith('agent-123', authToken);
      expect(result).toBe(mockAgent);
    });

    it('should get authToken from service when not provided', async () => {
      // Arrange
      const serviceToken = 'service-token';
      (AgenticAuthenticationService.GetAgenticUserToken as jest.Mock).mockResolvedValue(serviceToken);
      mockConfigService.listToolServers.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        ''
      );

      // Assert
      expect(AgenticAuthenticationService.GetAgenticUserToken).toHaveBeenCalledWith(mockAuthorization, mockTurnContext);
      expect(Utility.ValidateAuthToken).toHaveBeenCalledWith(serviceToken);
      expect(mockConfigService.listToolServers).toHaveBeenCalledWith('agent-123', serviceToken);
    });

    it('should create MCPServerStreamableHttp instances and add to agent', async () => {
      // Arrange
      const mockServers = [
        { mcpServerName: 'server1', url: 'http://server1.com' },
        { mcpServerName: 'server2', url: 'http://server2.com' }
      ];
      const authToken = 'test-token';

      mockConfigService.listToolServers.mockResolvedValue(mockServers);

      // Act
      const result = await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        authToken
      );

      // Assert
      expect(MockMCPServerStreamableHttp).toHaveBeenCalledTimes(2);
      expect(MockMCPServerStreamableHttp).toHaveBeenNthCalledWith(1, {
        url: 'http://server1.com',
        name: 'server1',
        requestInit: {
          headers: { 'Authorization': 'Bearer test-token' }
        }
      });
      expect(MockMCPServerStreamableHttp).toHaveBeenNthCalledWith(2, {
        url: 'http://server2.com',
        name: 'server2',
        requestInit: {
          headers: { 'Authorization': 'Bearer test-token' }
        }
      });
      expect(result.mcpServers).toHaveLength(2);
    });

    it('should preserve existing mcpServers on agent', async () => {
      // Arrange
      const existingServer = { name: 'existing', url: 'http://existing.com' };
      mockAgent.mcpServers = [existingServer] as any;

      const mockServers = [
        { mcpServerName: 'new-server', url: 'http://new.com' }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);

      // Act
      const result = await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(result.mcpServers).toHaveLength(2);
      expect(result.mcpServers[0]).toBe(existingServer);
    });

    it('should initialize mcpServers array if undefined', async () => {
      // Arrange
      mockAgent.mcpServers = undefined as any;
      const mockServers = [
        { mcpServerName: 'server1', url: 'http://server1.com' }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);

      // Act
      const result = await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(Array.isArray(result.mcpServers)).toBe(true);
      expect(result.mcpServers).toHaveLength(1);
    });

    it('should handle empty server list', async () => {
      // Arrange
      mockConfigService.listToolServers.mockResolvedValue([]);

      // Act
      const result = await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(MockMCPServerStreamableHttp).not.toHaveBeenCalled();
      expect(result.mcpServers).toHaveLength(0);
    });

    it('should include authorization header when authToken is provided', async () => {
      // Arrange
      const mockServers = [
        { mcpServerName: 'secure-server', url: 'https://secure.com' }
      ];
      const authToken = 'secret-token';

      mockConfigService.listToolServers.mockResolvedValue(mockServers);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        authToken
      );

      // Assert
      expect(MockMCPServerStreamableHttp).toHaveBeenCalledWith({
        url: 'https://secure.com',
        name: 'secure-server',
        requestInit: {
          headers: { 'Authorization': 'Bearer secret-token' }
        }
      });
    });

    it('should handle multiple servers with different configurations', async () => {
      // Arrange
      const mockServers = [
        { mcpServerName: 'server-alpha', url: 'http://alpha.com' },
        { mcpServerName: 'server-beta', url: 'https://beta.com' },
        { mcpServerName: 'server-gamma', url: 'http://gamma.com:8080' }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-456',
        mockAuthorization,
        mockTurnContext,
        'multi-token'
      );

      // Assert
      expect(MockMCPServerStreamableHttp).toHaveBeenCalledTimes(3);
      expect(MockMCPServerStreamableHttp).toHaveBeenCalledWith({
        url: 'http://alpha.com',
        name: 'server-alpha',
        requestInit: { headers: { 'Authorization': 'Bearer multi-token' } }
      });
      expect(MockMCPServerStreamableHttp).toHaveBeenCalledWith({
        url: 'https://beta.com',
        name: 'server-beta',
        requestInit: { headers: { 'Authorization': 'Bearer multi-token' } }
      });
      expect(MockMCPServerStreamableHttp).toHaveBeenCalledWith({
        url: 'http://gamma.com:8080',
        name: 'server-gamma',
        requestInit: { headers: { 'Authorization': 'Bearer multi-token' } }
      });
    });

    it('should return the same agent instance', async () => {
      // Arrange
      mockConfigService.listToolServers.mockResolvedValue([]);

      // Act
      const result = await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(result).toBe(mockAgent);
    });
  });
});