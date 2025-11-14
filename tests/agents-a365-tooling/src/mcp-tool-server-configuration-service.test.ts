// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService } from '@microsoft/agents-a365-tooling';
import axios from 'axios';
import { Utility } from '@microsoft/agents-a365-tooling';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpToolServerConfigurationService', () => {
  let service: McpToolServerConfigurationService;
  let originalEnv: NodeJS.ProcessEnv;
  let validateAuthTokenSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new McpToolServerConfigurationService();
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    validateAuthTokenSpy = jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    validateAuthTokenSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should create an instance', () => {
      // Assert
      expect(service).toBeInstanceOf(McpToolServerConfigurationService);
    });

    it('should be able to create multiple instances', () => {
      // Arrange
      const service1 = new McpToolServerConfigurationService();
      const service2 = new McpToolServerConfigurationService();

      // Assert
      expect(service1).toBeInstanceOf(McpToolServerConfigurationService);
      expect(service2).toBeInstanceOf(McpToolServerConfigurationService);
      expect(service1).not.toBe(service2);
    });
  });

  describe('listToolServers Method', () => {
    it('should have the correct method signature with 2 parameters', () => {
      // Assert
      expect(typeof service.listToolServers).toBe('function');
      expect(service.listToolServers.length).toBe(2); // agentUserId, authToken
    });

    it('should reject with invalid JWT token format', async () => {
      // Arrange
      const agentUserId = 'test-agent';
      const invalidToken = 'invalid-token';
      validateAuthTokenSpy.mockRestore();

      // Act & Assert
      await expect(service.listToolServers(agentUserId, invalidToken))
        .rejects.toThrow('Invalid JWT token format');
        
      validateAuthTokenSpy = jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});
    });

    it('should call axios.get with correct parameters when valid token provided', async () => {
      // Arrange
      const agentUserId = 'test-agent-123';
      const mockToken = 'mock-bearer-token';
      
      const mockServers = [
        { name: 'server1', url: 'http://server1.com' },
        { name: 'server2', url: 'http://server2.com' }
      ];

      mockedAxios.get.mockResolvedValue({ data: mockServers });
      // Act
      const result = await service.listToolServers(agentUserId, mockToken);

      // Assert
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(agentUserId),
        expect.objectContaining({
          headers: {
            'Authorization': `Bearer ${mockToken}`
          },
          timeout: 10000
        })
      );
      expect(result).toEqual(mockServers);
    });

    it('should return empty array when gateway returns no data', async () => {
      // Arrange
      const agentUserId = 'test-agent';
      const mockToken = 'mock-token';
      
      mockedAxios.get.mockResolvedValue({ data: null });

      // Act
      const result = await service.listToolServers(agentUserId, mockToken);

      // Assert
      expect(result).toEqual([]);
    });

    it('should throw error when axios request fails', async () => {
      // Arrange
      const agentUserId = 'test-agent';
      const mockToken = 'mock-token';
      
      mockedAxios.get.mockRejectedValue({ 
        code: 'ECONNREFUSED', 
        message: 'Connection refused' 
      });

      // Act & Assert
      await expect(service.listToolServers(agentUserId, mockToken))
        .rejects.toThrow('Failed to read MCP servers from endpoint');
    });

    it('should handle different agent IDs correctly', async () => {
      // Arrange
      const testCases = [
        { agentId: 'agent-123', token: 'mock-token-1' },
        { agentId: 'simple-agent', token: 'mock-token-2' }
      ];

      mockedAxios.get.mockResolvedValue({ data: [] });

      // Act & Assert
      for (const testCase of testCases) {
        await service.listToolServers(testCase.agentId, testCase.token);
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining(testCase.agentId),
          expect.any(Object)
        );
      }
    });
  });

  describe('Service Integration', () => {
    it('should be usable as part of larger tooling ecosystem', () => {
      // Arrange
      const services = [
        new McpToolServerConfigurationService(),
        new McpToolServerConfigurationService()
      ];

      // Assert
      services.forEach(svc => {
        expect(svc).toBeInstanceOf(McpToolServerConfigurationService);
        expect(typeof svc.listToolServers).toBe('function');
        expect(svc.listToolServers.length).toBe(2);
      });
    });

    it('should maintain consistent interface across instances', () => {
      // Arrange
      const service1 = new McpToolServerConfigurationService();
      const service2 = new McpToolServerConfigurationService();

      // Assert
      expect(typeof service1.listToolServers).toBe(typeof service2.listToolServers);
      expect(service1.listToolServers.length).toBe(service2.listToolServers.length);
    });
  });

  describe('TypeScript Interface Compliance', () => {
    it('should return async results for all calls', async () => {
      // Arrange
      const mockToken = 'mock-token';
      mockedAxios.get.mockResolvedValue({ data: [] });

      // Act
      const result1 = service.listToolServers('agent1', mockToken);
      const result2 = service.listToolServers('agent2', mockToken);

      // Assert
      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
      await Promise.all([result1, result2]);
    });

    it('should handle various token formats appropriately', async () => {
      // Arrange
      validateAuthTokenSpy.mockRestore();

      // Act & Assert
      await expect(service.listToolServers('agent', ''))
        .rejects.toThrow();

      // Arrange
      validateAuthTokenSpy = jest.spyOn(Utility, 'ValidateAuthToken').mockImplementation(() => {});
      const mockToken = 'any-token-works-with-mock';
      mockedAxios.get.mockResolvedValue({ data: [] });

      // Act & Assert
      await expect(service.listToolServers('agent', mockToken))
        .resolves.toEqual([]);
    });
  });
});