// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Utility, ToolsMode } from '@microsoft/agents-a365-tooling';

// Mock process.env for testing
declare const global: any;

describe('Utility Class', () => {
  let originalEnv: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...global.process.env };
  });

  afterEach(() => {
    // Restore original environment
    global.process.env = originalEnv;
  });

  describe('ToolsMode Enum', () => {
    it('should have correct enum values', () => {
      // Assert
      expect(ToolsMode.MockMCPServer).toBe('MockMCPServer');
      expect(ToolsMode.MCPPlatform).toBe('MCPPlatform');
    });

    it('should be a proper TypeScript enum', () => {
      // Assert
      expect(typeof ToolsMode).toBe('object');
      expect(ToolsMode).toBeDefined();
    });
  });

  describe('GetToolsMode Method', () => {
    it('should return MCPPlatform by default', () => {
      // Arrange
      delete global.process.env.TOOLS_MODE;

      // Act & Assert
      expect(Utility.GetToolsMode()).toBe(ToolsMode.MCPPlatform);
    });

    it('should return MockMCPServer when TOOLS_MODE is set', () => {
      // Arrange
      global.process.env.TOOLS_MODE = 'MockMCPServer';

      // Act & Assert
      expect(Utility.GetToolsMode()).toBe(ToolsMode.MockMCPServer);
    });

    it('should handle case insensitive TOOLS_MODE', () => {
      // Arrange
      global.process.env.TOOLS_MODE = 'mockmcpserver';

      // Act & Assert
      expect(Utility.GetToolsMode()).toBe(ToolsMode.MockMCPServer);
    });

    it('should return MCPPlatform for unknown TOOLS_MODE', () => {
      // Arrange
      global.process.env.TOOLS_MODE = 'unknown';

      // Act & Assert
      expect(Utility.GetToolsMode()).toBe(ToolsMode.MCPPlatform);
    });
  });

  describe('GetMcpBaseUrl Method', () => {
    it('should return production URL by default', () => {
      // Arrange
      delete global.process.env.NODE_ENV;
      delete global.process.env.ASPNETCORE_ENVIRONMENT;
      delete global.process.env.DOTNET_ENVIRONMENT;
      delete global.process.env.MCP_PLATFORM_ENDPOINT;

      // Act
      const url = Utility.GetMcpBaseUrl();

      // Assert
      expect(url).toContain('agent365.svc.cloud.microsoft');
    });

    it('should be a valid URL format', () => {
      // Act
      const url = Utility.GetMcpBaseUrl();

      // Assert
      expect(url).toMatch(/^https?:\/\/.+/);
      expect(typeof url).toBe('string');
    });
  });

  describe('BuildMcpServerUrl Method', () => {
    it('should build correct server URL with environment and server name', () => {
      // Act
      const url = Utility.BuildMcpServerUrl('test-env', 'MyServer');

      // Assert
      expect(url).toContain('test-env');
      expect(url).toContain('MyServer');
      expect(typeof url).toBe('string');
    });

    it('should handle different environment and server name combinations', () => {
      // Arrange & Act
      const testCases = [
        { env: 'production', server: 'api-server' },
        { env: 'development', server: 'test-server' },
        { env: 'staging', server: 'staging-server' }
      ];

      testCases.forEach(testCase => {
        const url = Utility.BuildMcpServerUrl(testCase.env, testCase.server);
        
        // Assert
        expect(url).toContain(testCase.env);
        expect(url).toContain(testCase.server);
        expect(typeof url).toBe('string');
      });
    });

    it('should handle server names with special characters', () => {
      // Act & Assert
      const serverNames = ['server-with-dashes', 'server_with_underscores', 'server123'];
      
      serverNames.forEach(serverName => {
        const url = Utility.BuildMcpServerUrl('test-env', serverName);
        expect(url).toContain(serverName);
      });
    });
  });

  describe('GetToolingGatewayForDigitalWorker Method', () => {
    it('should build correct gateway URL', () => {
      // Act
      const url = Utility.GetToolingGatewayForDigitalWorker('agent-123');

      // Assert
      expect(url).toContain('agent-123');
      expect(url).toContain('agents');
      expect(url).toContain('mcpServers');
      expect(typeof url).toBe('string');
    });

    it('should handle agent IDs with various formats', () => {
      // Arrange & Act & Assert
      const agentIds = [
        'simple-agent',
        'agent_with_underscores', 
        'agent123',
        '12345678-1234-5678-abcd-123456789abc'
      ];

      agentIds.forEach(agentId => {
        const url = Utility.GetToolingGatewayForDigitalWorker(agentId);
        expect(url).toContain(agentId);
        expect(url).toMatch(/^https?:\/\/.+/);
      });
    });
  });

  describe('GetUseEnvironmentId Method', () => {
    it('should return boolean value', () => {
      // Act
      const useEnvId = Utility.GetUseEnvironmentId();

      // Assert
      expect(typeof useEnvId).toBe('boolean');
    });

    it('should have consistent behavior', () => {
      // Act
      const result1 = Utility.GetUseEnvironmentId();
      const result2 = Utility.GetUseEnvironmentId();

      // Assert
      expect(result1).toBe(result2);
    });
  });

  describe('Method Integration', () => {
    it('should use consistent base URLs across methods', () => {
      // Act
      const baseUrl = Utility.GetMcpBaseUrl();
      const gatewayUrl = Utility.GetToolingGatewayForDigitalWorker('test-agent');
      const serverUrl = Utility.BuildMcpServerUrl('test-env', 'test-server');

      // Assert - All should use the same domain
      const baseUrlDomain = baseUrl.match(/https?:\/\/[^\/]+/)?.[0];
      expect(gatewayUrl).toContain(baseUrlDomain || '');
      expect(serverUrl).toContain(baseUrlDomain || '');
    });

    it('should maintain URL format consistency', () => {
      // Act
      const urls = [
        Utility.GetMcpBaseUrl(),
        Utility.GetToolingGatewayForDigitalWorker('agent'),
        Utility.BuildMcpServerUrl('env', 'server')
      ];

      // Assert
      urls.forEach(url => {
        expect(url).toMatch(/^https?:\/\/.+/);
        expect(url).not.toContain(' ');
        expect(typeof url).toBe('string');
        expect(url.length).toBeGreaterThan(0);
      });
    });
  });
});