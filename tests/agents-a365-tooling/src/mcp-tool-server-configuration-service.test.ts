// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpToolServerConfigurationService } from '@microsoft/agents-a365-tooling';

describe('McpToolServerConfigurationService', () => {
  let service: McpToolServerConfigurationService;

  beforeEach(() => {
    service = new McpToolServerConfigurationService();
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
    it('should have the correct method signature with 3 parameters', () => {
      // Assert
      expect(typeof service.listToolServers).toBe('function');
      expect(service.listToolServers.length).toBe(3); // agentUserId, environmentId, authToken
    });

    it('should accept string parameters for all required arguments', () => {
      // Arrange
      const agentUserId = 'test-agent';
      const environmentId = 'test-env';
      const authToken = 'test-token';

      // Act & Assert - Just verify the method can be called without immediate syntax errors
      expect(() => {
        service.listToolServers(agentUserId, environmentId, authToken);
      }).not.toThrow();
    });

    it('should return a Promise', () => {
      // Act
      const result = service.listToolServers('test', 'test', 'test');

      // Assert
      expect(result).toBeInstanceOf(Promise);
    });

    it('should handle different parameter combinations', () => {
      // Arrange & Act & Assert
      const testCases = [
        ['agent-123', 'env-456', 'token-789'],
        ['simple-agent', 'simple-env', 'simple-token'],
        ['', '', ''], // Edge case with empty strings
      ];

      testCases.forEach(([agentId, envId, token]) => {
        expect(() => {
          service.listToolServers(agentId, envId, token);
        }).not.toThrow();
      });
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
        expect(svc.listToolServers.length).toBe(3);
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
    it('should maintain Promise interface consistency', () => {
      // Arrange
      const result1 = service.listToolServers('agent1', 'env1', 'token1');
      const result2 = service.listToolServers('agent2', 'env2', 'token2');

      // Assert
      expect(result1).toBeInstanceOf(Promise);
      expect(result2).toBeInstanceOf(Promise);
    });

    it('should handle edge case parameter values gracefully', () => {
      // Act & Assert
      expect(() => {
        service.listToolServers('', '', '');
      }).not.toThrow();

      expect(() => {
        service.listToolServers('very-long-agent-identifier-that-might-be-a-guid', 'production-environment', 'jwt-bearer-token');
      }).not.toThrow();
    });
  });
});