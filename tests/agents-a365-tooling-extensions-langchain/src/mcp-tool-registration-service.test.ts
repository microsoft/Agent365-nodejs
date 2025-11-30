// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-langchain';
import { McpToolServerConfigurationService, Utility } from '@microsoft/agents-a365-tooling';
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { createAgent, ReactAgent } from 'langchain';
import { ClientConfig, Connection, MultiServerMCPClient } from '@langchain/mcp-adapters';

// Mock the dependencies
jest.mock('@microsoft/agents-a365-tooling');
jest.mock('@microsoft/agents-a365-runtime');
jest.mock('langchain');
jest.mock('@langchain/mcp-adapters');

describe('McpToolRegistrationService (LangChain)', () => {
  let service: McpToolRegistrationService;
  let mockConfigService: jest.Mocked<McpToolServerConfigurationService>;
  let mockAgent: jest.Mocked<ReactAgent>;
  let mockTurnContext: jest.Mocked<TurnContext>;
  let mockAuthorization: jest.Mocked<Authorization>;
  let mockMultiServerMCPClient: jest.Mocked<MultiServerMCPClient>;
  let MockMultiServerMCPClient: jest.MockedClass<typeof MultiServerMCPClient>;
  let mockCreateAgent: jest.MockedFunction<typeof createAgent>;

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

    // Mock LangChain Agent
    mockAgent = {
      options: {
        tools: []
      }
    } as any;

    // Mock MultiServerMCPClient
    mockMultiServerMCPClient = {
      getTools: jest.fn()
    } as any;

    MockMultiServerMCPClient = MultiServerMCPClient as jest.MockedClass<typeof MultiServerMCPClient>;
    MockMultiServerMCPClient.mockImplementation(() => mockMultiServerMCPClient);

    // Mock createAgent
    mockCreateAgent = createAgent as jest.MockedFunction<typeof createAgent>;
    mockCreateAgent.mockReturnValue(mockAgent);

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
      )).rejects.toThrow('Langchain Agent is Required');

      await expect(service.addToolServersToAgent(
        undefined as any,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      )).rejects.toThrow('Langchain Agent is Required');
    });

    it('should use provided authToken when available', async () => {
      // Arrange
      const authToken = 'provided-token';
      mockConfigService.listToolServers.mockResolvedValue([]);
      mockMultiServerMCPClient.getTools.mockResolvedValue([]);

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
      mockMultiServerMCPClient.getTools.mockResolvedValue([]);

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

    it('should create MultiServerMCPClient with correct configuration', async () => {
      // Arrange
      const mockServers = [
        { mcpServerName: 'server1', url: 'http://server1.com' },
        { mcpServerName: 'server2', url: 'http://server2.com' }
      ];
      const authToken = 'test-token';

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockMultiServerMCPClient.getTools.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        authToken
      );

      // Assert
      expect(MockMultiServerMCPClient).toHaveBeenCalledWith({
        mcpServers: {
          server1: {
            type: 'http',
            url: 'http://server1.com',
            headers: { 'Authorization': 'Bearer test-token' }
          },
          server2: {
            type: 'http',
            url: 'http://server2.com',
            headers: { 'Authorization': 'Bearer test-token' }
          }
        }
      });
    });

    it('should get tools from MCP client and merge with existing tools', async () => {
      // Arrange
      const existingTool = { name: 'existing-tool', description: 'Existing tool' };
      const mcpTool = { name: 'mcp-tool', description: 'MCP tool' };

      mockAgent.options.tools = [existingTool];
      mockConfigService.listToolServers.mockResolvedValue([
        { mcpServerName: 'server1', url: 'http://server1.com' }
      ]);
      mockMultiServerMCPClient.getTools.mockResolvedValue([mcpTool]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(mockMultiServerMCPClient.getTools).toHaveBeenCalled();
      expect(mockCreateAgent).toHaveBeenCalledWith({
        ...mockAgent.options,
        tools: [existingTool, mcpTool]
      });
    });

    it('should handle agent with no existing tools', async () => {
      // Arrange
      const mcpTool = { name: 'mcp-tool', description: 'MCP tool' };

      mockAgent.options.tools = undefined;
      mockConfigService.listToolServers.mockResolvedValue([
        { mcpServerName: 'server1', url: 'http://server1.com' }
      ]);
      mockMultiServerMCPClient.getTools.mockResolvedValue([mcpTool]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(mockCreateAgent).toHaveBeenCalledWith({
        ...mockAgent.options,
        tools: [mcpTool]
      });
    });

    it('should handle empty server list', async () => {
      // Arrange
      mockConfigService.listToolServers.mockResolvedValue([]);
      mockMultiServerMCPClient.getTools.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(MockMultiServerMCPClient).toHaveBeenCalledWith({
        mcpServers: {}
      });
      expect(mockCreateAgent).toHaveBeenCalledWith({
        ...mockAgent.options,
        tools: []
      });
    });

    it('should handle empty MCP tools list', async () => {
      // Arrange
      const existingTool = { name: 'existing-tool' };
      mockAgent.options.tools = [existingTool];
      
      mockConfigService.listToolServers.mockResolvedValue([
        { mcpServerName: 'server1', url: 'http://server1.com' }
      ]);
      mockMultiServerMCPClient.getTools.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(mockCreateAgent).toHaveBeenCalledWith({
        ...mockAgent.options,
        tools: [existingTool]
      });
    });

    it('should include authorization headers for each server', async () => {
      // Arrange
      const mockServers = [
        { mcpServerName: 'secure-server', url: 'https://secure.com' },
        { mcpServerName: 'another-server', url: 'https://another.com' }
      ];
      const authToken = 'secret-token';

      mockConfigService.listToolServers.mockResolvedValue(mockServers);
      mockMultiServerMCPClient.getTools.mockResolvedValue([]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        authToken
      );

      // Assert
      expect(MockMultiServerMCPClient).toHaveBeenCalledWith({
        mcpServers: {
          'secure-server': {
            type: 'http',
            url: 'https://secure.com',
            headers: { 'Authorization': 'Bearer secret-token' }
          },
          'another-server': {
            type: 'http',
            url: 'https://another.com',
            headers: { 'Authorization': 'Bearer secret-token' }
          }
        }
      });
    });

    it('should preserve agent options when creating new agent', async () => {
      // Arrange
      const originalOptions = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        tools: [{ name: 'original-tool' }]
      };
      mockAgent.options = originalOptions;
      
      const mcpTool = { name: 'mcp-tool' };
      mockConfigService.listToolServers.mockResolvedValue([]);
      mockMultiServerMCPClient.getTools.mockResolvedValue([mcpTool]);

      // Act
      await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(mockCreateAgent).toHaveBeenCalledWith({
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        tools: [{ name: 'original-tool' }, mcpTool]
      });
    });

    it('should return new agent from createAgent', async () => {
      // Arrange
      const newAgent = { id: 'new-agent' } as any;
      mockCreateAgent.mockReturnValue(newAgent);
      mockConfigService.listToolServers.mockResolvedValue([]);
      mockMultiServerMCPClient.getTools.mockResolvedValue([]);

      // Act
      const result = await service.addToolServersToAgent(
        mockAgent,
        'agent-123',
        mockAuthorization,
        mockTurnContext,
        'token'
      );

      // Assert
      expect(result).toBe(newAgent);
    });
  });
});