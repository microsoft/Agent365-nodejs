// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Utility, ToolsMode } from '@microsoft/agents-a365-tooling';

describe('Utility', () => {
  // Store original environment variables to restore after tests
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment variables after each test
    process.env = { ...originalEnv };
  });

  describe('ToolsMode enum', () => {
    it('should have correct enum values', () => {
      expect(ToolsMode.MockMCPServer).toBe('MockMCPServer');
      expect(ToolsMode.MCPPlatform).toBe('MCPPlatform');
    });
  });

  describe('GetToolingGatewayForDigitalWorker', () => {
    it('should generate correct URL for digital worker using default base URL', () => {
      // Clear any custom endpoint to test default behavior
      delete process.env.MCP_PLATFORM_ENDPOINT;
      
      const agentUserId = 'agent-123';
      const result = Utility.GetToolingGatewayForDigitalWorker(agentUserId);
      
      // Verify it uses the production base URL format
      expect(result).toBe('https://agent365.svc.cloud.microsoft/agents/agent-123/mcpServers');
      expect(result).toMatch(/^https:\/\/agent365\.svc\.cloud\.microsoft\/agents\/agent-123\/mcpServers$/);
    });

    it('should handle empty agent user ID', () => {
      delete process.env.MCP_PLATFORM_ENDPOINT;
      
      const agentUserId = '';
      const result = Utility.GetToolingGatewayForDigitalWorker(agentUserId);
      
      // Should still follow the URL pattern even with empty ID
      expect(result).toBe('https://agent365.svc.cloud.microsoft/agents//mcpServers');
      expect(result).toMatch(/^https:\/\/agent365\.svc\.cloud\.microsoft\/agents\/\/mcpServers$/);
    });

    it('should handle agent user ID with special characters', () => {
      delete process.env.MCP_PLATFORM_ENDPOINT;
      
      const agentUserId = 'agent-test@domain.com';
      const result = Utility.GetToolingGatewayForDigitalWorker(agentUserId);
      
      // Should preserve special characters in the URL path
      expect(result).toBe('https://agent365.svc.cloud.microsoft/agents/agent-test@domain.com/mcpServers');
      expect(result).toMatch(/^https:\/\/agent365\.svc\.cloud\.microsoft\/agents\/agent-test@domain\.com\/mcpServers$/);
    });

    it('should use custom MCP platform endpoint when MCP_PLATFORM_ENDPOINT is set', () => {
      const customEndpoint = 'https://custom.endpoint.com';
      process.env.MCP_PLATFORM_ENDPOINT = customEndpoint;
      
      const agentUserId = 'agent-456';
      const result = Utility.GetToolingGatewayForDigitalWorker(agentUserId);
      
      // Should use the custom endpoint instead of default
      expect(result).toBe(`${customEndpoint}/agents/agent-456/mcpServers`);
      expect(result).toMatch(/^https:\/\/custom\.endpoint\.com\/agents\/agent-456\/mcpServers$/);
    });
  });

  describe('GetMcpBaseUrl', () => {
    it('should return production URL by default', () => {
      process.env.NODE_ENV = 'production';
      const result = Utility.GetMcpBaseUrl();
      
      expect(result).toBe('https://agent365.svc.cloud.microsoft/mcp/environments');
    });

    it('should return mock server URL in development with MockMCPServer mode', () => {
      process.env.NODE_ENV = 'development';
      process.env.TOOLS_MODE = 'MockMCPServer';
      const result = Utility.GetMcpBaseUrl();
      
      expect(result).toBe('http://localhost:5309/mcp-mock/agents/servers');
    });

    it('should use custom mock server URL when MOCK_MCP_SERVER_URL is set', () => {
      process.env.NODE_ENV = 'development';
      process.env.TOOLS_MODE = 'MockMCPServer';
      process.env.MOCK_MCP_SERVER_URL = 'https://custom-mock.com';
      const result = Utility.GetMcpBaseUrl();
      
      expect(result).toBe('https://custom-mock.com');
    });

    it('should return agents/servers URL when USE_ENVIRONMENT_ID is false', () => {
      process.env.USE_ENVIRONMENT_ID = 'false';
      const result = Utility.GetMcpBaseUrl();
      
      expect(result).toBe('https://agent365.svc.cloud.microsoft/agents/servers');
    });

    it('should use custom MCP platform endpoint', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://staging.agent365.com';
      const result = Utility.GetMcpBaseUrl();
      
      expect(result).toBe('https://staging.agent365.com/mcp/environments');
    });

    it('should handle development environment with MCPPlatform mode', () => {
      process.env.NODE_ENV = 'development';
      process.env.TOOLS_MODE = 'MCPPlatform';
      const result = Utility.GetMcpBaseUrl();
      
      expect(result).toBe('https://agent365.svc.cloud.microsoft/mcp/environments');
    });
  });

  describe('BuildMcpServerUrl', () => {
    it('should build URL with environment ID by default', () => {
      const environmentId = 'default-abc123';
      const serverName = 'MyServer';
      const result = Utility.BuildMcpServerUrl(environmentId, serverName);
      
      expect(result).toBe('https://agent365.svc.cloud.microsoft/mcp/environments/default-abc123/servers/MyServer');
    });

    it('should build URL without environment ID when USE_ENVIRONMENT_ID is false', () => {
      process.env.USE_ENVIRONMENT_ID = 'false';
      const environmentId = 'default-abc123';
      const serverName = 'MyServer';
      const result = Utility.BuildMcpServerUrl(environmentId, serverName);
      
      expect(result).toBe('https://agent365.svc.cloud.microsoft/agents/servers/MyServer');
    });

    it('should build URL without environment ID in development with servers endpoint', () => {
      process.env.NODE_ENV = 'development';
      process.env.TOOLS_MODE = 'MockMCPServer';
      const environmentId = 'default-abc123';
      const serverName = 'TestServer';
      const result = Utility.BuildMcpServerUrl(environmentId, serverName);
      
      expect(result).toBe('http://localhost:5309/mcp-mock/agents/servers/TestServer');
    });

    it('should handle server names with special characters', () => {
      const environmentId = 'default-123';
      const serverName = 'My-Server_Name.test';
      const result = Utility.BuildMcpServerUrl(environmentId, serverName);
      
      expect(result).toBe('https://agent365.svc.cloud.microsoft/mcp/environments/default-123/servers/My-Server_Name.test');
    });

    it('should use custom base URL', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://dev.agent365.com';
      const environmentId = 'dev-env';
      const serverName = 'DevServer';
      const result = Utility.BuildMcpServerUrl(environmentId, serverName);
      
      expect(result).toBe('https://dev.agent365.com/mcp/environments/dev-env/servers/DevServer');
    });
  });

  describe('GetToolsMode', () => {
    it('should return MCPPlatform by default', () => {
      delete process.env.TOOLS_MODE;
      const result = Utility.GetToolsMode();
      
      expect(result).toBe(ToolsMode.MCPPlatform);
    });

    it('should return MockMCPServer when TOOLS_MODE is set to mockmcpserver', () => {
      process.env.TOOLS_MODE = 'mockmcpserver';
      const result = Utility.GetToolsMode();
      
      expect(result).toBe(ToolsMode.MockMCPServer);
    });

    it('should return MockMCPServer when TOOLS_MODE is set to MockMCPServer', () => {
      process.env.TOOLS_MODE = 'MockMCPServer';
      const result = Utility.GetToolsMode();
      
      expect(result).toBe(ToolsMode.MockMCPServer);
    });

    it('should return MockMCPServer when TOOLS_MODE is set to MOCKMCPSERVER', () => {
      process.env.TOOLS_MODE = 'MOCKMCPSERVER';
      const result = Utility.GetToolsMode();
      
      expect(result).toBe(ToolsMode.MockMCPServer);
    });

    it('should return MCPPlatform for unknown TOOLS_MODE values', () => {
      process.env.TOOLS_MODE = 'unknown';
      const result = Utility.GetToolsMode();
      
      expect(result).toBe(ToolsMode.MCPPlatform);
    });

    it('should return MCPPlatform when TOOLS_MODE is set to mcpplatform', () => {
      process.env.TOOLS_MODE = 'mcpplatform';
      const result = Utility.GetToolsMode();
      
      expect(result).toBe(ToolsMode.MCPPlatform);
    });
  });

  describe('GetUseEnvironmentId', () => {
    it('should return true by default', () => {
      delete process.env.USE_ENVIRONMENT_ID;
      const result = Utility.GetUseEnvironmentId();
      
      expect(result).toBe(true);
    });

    it('should return true when USE_ENVIRONMENT_ID is set to "true"', () => {
      process.env.USE_ENVIRONMENT_ID = 'true';
      const result = Utility.GetUseEnvironmentId();
      
      expect(result).toBe(true);
    });

    it('should return true when USE_ENVIRONMENT_ID is set to "TRUE"', () => {
      process.env.USE_ENVIRONMENT_ID = 'TRUE';
      const result = Utility.GetUseEnvironmentId();
      
      expect(result).toBe(true);
    });

    it('should return false when USE_ENVIRONMENT_ID is set to "false"', () => {
      process.env.USE_ENVIRONMENT_ID = 'false';
      const result = Utility.GetUseEnvironmentId();
      
      expect(result).toBe(false);
    });

    it('should return false when USE_ENVIRONMENT_ID is set to "FALSE"', () => {
      process.env.USE_ENVIRONMENT_ID = 'FALSE';
      const result = Utility.GetUseEnvironmentId();
      
      expect(result).toBe(false);
    });

    it('should return false when USE_ENVIRONMENT_ID is set to "0"', () => {
      process.env.USE_ENVIRONMENT_ID = '0';
      const result = Utility.GetUseEnvironmentId();
      
      expect(result).toBe(false);
    });

    it('should return false when USE_ENVIRONMENT_ID is set to random value', () => {
      process.env.USE_ENVIRONMENT_ID = 'random';
      const result = Utility.GetUseEnvironmentId();
      
      expect(result).toBe(false);
    });
  });

  describe('Environment Detection', () => {
    it('should prioritize ASPNETCORE_ENVIRONMENT over other environment variables', () => {
      process.env.ASPNETCORE_ENVIRONMENT = 'Production';
      process.env.DOTNET_ENVIRONMENT = 'Development';
      process.env.NODE_ENV = 'test';
      
      const result = Utility.GetMcpBaseUrl();
      // This tests the private getCurrentEnvironment method through GetMcpBaseUrl
      expect(result).toBe('https://agent365.svc.cloud.microsoft/mcp/environments');
    });

    it('should use DOTNET_ENVIRONMENT when ASPNETCORE_ENVIRONMENT is not set', () => {
      delete process.env.ASPNETCORE_ENVIRONMENT;
      process.env.DOTNET_ENVIRONMENT = 'Development';
      process.env.NODE_ENV = 'production';
      process.env.TOOLS_MODE = 'MockMCPServer';
      
      const result = Utility.GetMcpBaseUrl();
      expect(result).toBe('http://localhost:5309/mcp-mock/agents/servers');
    });

    it('should use NODE_ENV when ASPNETCORE_ENVIRONMENT and DOTNET_ENVIRONMENT are not set', () => {
      delete process.env.ASPNETCORE_ENVIRONMENT;
      delete process.env.DOTNET_ENVIRONMENT;
      process.env.NODE_ENV = 'development';
      process.env.TOOLS_MODE = 'MockMCPServer';
      
      const result = Utility.GetMcpBaseUrl();
      expect(result).toBe('http://localhost:5309/mcp-mock/agents/servers');
    });

    it('should default to Development when no environment variables are set', () => {
      delete process.env.ASPNETCORE_ENVIRONMENT;
      delete process.env.DOTNET_ENVIRONMENT;
      delete process.env.NODE_ENV;
      process.env.TOOLS_MODE = 'MockMCPServer';
      
      const result = Utility.GetMcpBaseUrl();
      expect(result).toBe('http://localhost:5309/mcp-mock/agents/servers');
    });
  });
});