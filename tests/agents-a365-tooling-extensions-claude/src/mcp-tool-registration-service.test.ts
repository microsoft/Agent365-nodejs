// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-claude';
import { McpToolServerConfigurationService, McpClientTool, Utility, MCPServerConfig } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';

// Mock the dependencies
jest.mock('@microsoft/agents-a365-tooling');
jest.mock('@microsoft/agents-a365-runtime');

describe('McpToolRegistrationService', () => {
  let service: McpToolRegistrationService;
  let mockConfigService: jest.Mocked<McpToolServerConfigurationService>;
  let mockTurnContext: jest.Mocked<TurnContext>;
  let mockAuthorization: jest.Mocked<Authorization>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock the config service
    mockConfigService = {
      listToolServers: jest.fn(),
      getMcpClientTools: jest.fn()
    } as any;

    // Mock the service constructor
    (McpToolServerConfigurationService as jest.Mock).mockImplementation(() => mockConfigService);

    // Mock utility methods
    (Utility.ValidateAuthToken as jest.Mock) = jest.fn();
    (AgenticAuthenticationService.GetAgenticUserToken as jest.Mock) = jest.fn();

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
    it('should throw error when agentOptions is null or undefined', async () => {
      // Assert
      await expect(service.addToolServersToAgent(
        null as any,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      )).rejects.toThrow('Agent Options is Required');

      await expect(service.addToolServersToAgent(
        undefined as any,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      )).rejects.toThrow('Agent Options is Required');
    });

    it('should use provided authToken when available', async () => {
      // Arrange
      const agentOptions = { allowedTools: [] };
      const authToken = 'provided-token';
      mockConfigService.listToolServers.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        authToken
      );

      // Assert
      expect(Utility.ValidateAuthToken).toHaveBeenCalledWith(authToken);
      expect(AgenticAuthenticationService.GetAgenticUserToken).not.toHaveBeenCalled();
      expect(mockConfigService.listToolServers).toHaveBeenCalledWith('agent-123', authToken);
    });

    it('should get authToken from service when not provided', async () => {
      // Arrange
      const agentOptions = { allowedTools: [] };
      const serviceToken = 'service-token';
      (AgenticAuthenticationService.GetAgenticUserToken as jest.Mock).mockResolvedValue(serviceToken);
      mockConfigService.listToolServers.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
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

    it('should process servers and add tools to agent options', async () => {
      // Arrange
      const agentOptions: any = { allowedTools: [] };
      const mockServers = [
        { mcpServerName: 'server1', url: 'http://server1.com' },
        { mcpServerName: 'server2', url: 'http://server2.com' }
      ];
      const mockTools1: McpClientTool[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } }
      ];
      const mockTools2: McpClientTool[] = [
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object', properties: {} } }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockConfigService.getMcpClientTools
        .mockResolvedValueOnce(mockTools1)
        .mockResolvedValueOnce(mockTools2);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(agentOptions.allowedTools).toEqual([
        'mcp__server1__tool1',
        'mcp__server2__tool2'
      ]);
      expect(agentOptions.mcpServers).toEqual({
        server1: {
          type: 'http',
          url: 'http://server1.com',
          headers: { 'Authorization': 'Bearer token' }
        },
        server2: {
          type: 'http',
          url: 'http://server2.com',
          headers: { 'Authorization': 'Bearer token' }
        }
      });
    });

    it('should preserve existing allowedTools', async () => {
      // Arrange
      const agentOptions: any = { 
        allowedTools: ['existing-tool1', 'existing-tool2']
      };
      const mockServers = [
        { mcpServerName: 'server1', url: 'http://server1.com' }
      ];
      const mockTools: McpClientTool[] = [
        { name: 'newTool', description: 'New Tool', inputSchema: { type: 'object', properties: {} } }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockConfigService.getMcpClientTools.mockResolvedValue(mockTools);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(agentOptions.allowedTools).toEqual([
        'existing-tool1',
        'existing-tool2',
        'mcp__server1__newTool'
      ]);
    });

    it('should preserve existing mcpServers', async () => {
      // Arrange
      const agentOptions: any = { 
        mcpServers: {
          'existing-server': {
            type: 'http',
            url: 'http://existing.com'
          }
        }
      };
      const mockServers = [
        { mcpServerName: 'new-server', url: 'http://new.com' }
      ];
      const mockTools: McpClientTool[] = [];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockConfigService.getMcpClientTools.mockResolvedValue(mockTools);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(agentOptions.mcpServers).toEqual({
        'existing-server': {
          type: 'http',
          url: 'http://existing.com'
        },
        'new-server': {
          type: 'http',
          url: 'http://new.com',
          headers: { 'Authorization': 'Bearer token' }
        }
      });
    });

    it('should handle empty server list', async () => {
      // Arrange
      const agentOptions: any = {};
      mockConfigService.listToolServers.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(agentOptions.allowedTools).toEqual([]);
      expect(agentOptions.mcpServers).toEqual({});
    });

    it('should handle servers with no tools', async () => {
      // Arrange
      const agentOptions: any = {};
      const mockServers = [
        { mcpServerName: 'empty-server', url: 'http://empty.com' }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockConfigService.getMcpClientTools.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(agentOptions.allowedTools).toEqual([]);
      expect(agentOptions.mcpServers).toEqual({
        'empty-server': {
          type: 'http',
          url: 'http://empty.com',
          headers: { 'Authorization': 'Bearer token' }
        }
      });
    });

    it('should add mcp prefix to tool names', async () => {
      // Arrange
      const agentOptions: any = {};
      const mockServers = [
        { mcpServerName: 'test-server', url: 'http://test.com' }
      ];
      const mockTools: McpClientTool[] = [
        { name: 'originalName', description: 'Test tool', inputSchema: { type: 'object', properties: {} } },
        { name: 'another-tool', description: 'Another tool', inputSchema: { type: 'object', properties: {} } }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockConfigService.getMcpClientTools.mockResolvedValue(mockTools);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(agentOptions.allowedTools).toEqual([
        'mcp__test-server__originalName',
        'mcp__test-server__another-tool'
      ]);
    });

    it('should call getMcpClientTools with correct parameters', async () => {
      // Arrange
      const agentOptions: any = {};
      const mockServers = [
        { mcpServerName: 'test-server', url: 'http://test.com' }
      ];

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockConfigService.getMcpClientTools.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        agentOptions,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'auth-token'
      );

      // Assert
      expect(mockConfigService.getMcpClientTools).toHaveBeenCalledWith(
        'test-server',
        {
          url: 'http://test.com',
          headers: { 'Authorization': 'Bearer auth-token' }
        }
      );
    });
  });
});