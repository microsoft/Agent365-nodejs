// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { McpToolServerConfigurationService } from '../../packages/agents-a365-tooling/src/McpToolServerConfigurationService';
import { Utility } from '../../packages/agents-a365-tooling/src/Utility';
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
  });
});
