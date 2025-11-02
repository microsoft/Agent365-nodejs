// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { McpToolServerConfigurationService } from '../../../packages/agents-a365-tooling/src/McpToolServerConfigurationService';
import { MCPServerConfig } from '../../../packages/agents-a365-tooling/src/contracts';
import { Utility } from '../../../packages/agents-a365-tooling/src/Utility';

// Mock dependencies
jest.mock('fs');
jest.mock('axios');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('McpToolServerConfigurationService', () => {
  let service: McpToolServerConfigurationService;
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new McpToolServerConfigurationService();
    process.env = { ...originalEnv };
    
    // Mock console to avoid test output clutter
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    process.cwd = originalCwd;
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create a service instance', () => {
      expect(service).toBeInstanceOf(McpToolServerConfigurationService);
    });
  });

  describe('listToolServers in production environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should make HTTP request to tooling gateway', async () => {
      const mockResponse = {
        data: [
          { mcpServerName: 'server1', url: 'https://server1.com' },
          { mcpServerName: 'server2', url: 'https://server2.com' }
        ]
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await service.listToolServers('agent-123', 'env-456', 'auth-token');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/agents/agent-123/mcpServers'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer auth-token'
          }),
          timeout: 10000
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle empty response data', async () => {
      const mockResponse = { data: null };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(result).toEqual([]);
    });

    it('should throw error when HTTP request fails', async () => {
      const errorMessage = 'Network error';
      mockedAxios.get.mockRejectedValue(new Error(errorMessage));

      await expect(service.listToolServers('agent-123', 'env-456', 'token'))
        .rejects.toThrow('Failed to read MCP servers from endpoint');
    });

    it('should handle HTTP error with error code', async () => {
      const error = new Error('Request failed') as Error & { code: string };
      error.code = 'ECONNREFUSED';
      mockedAxios.get.mockRejectedValue(error);

      await expect(service.listToolServers('agent-123', 'env-456', 'token'))
        .rejects.toThrow('Failed to read MCP servers from endpoint: ECONNREFUSED Request failed');
    });

    it('should omit Authorization header when no token provided', async () => {
      const mockResponse = { data: [] };
      mockedAxios.get.mockResolvedValue(mockResponse);

      await service.listToolServers('agent-123', 'env-456', '');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': undefined
          })
        })
      );
    });
  });

  describe('listToolServers in development environment', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.cwd = jest.fn().mockReturnValue('/test/project');
    });

    it('should read manifest from current working directory', async () => {
      const manifestContent = {
        mcpServers: [
          { mcpServerName: 'mailServer' },
          { mcpServerName: 'sharePointServer' }
        ]
      };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(manifestContent));

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(mockedFs.existsSync).toHaveBeenCalledWith('\\test\\project\\ToolingManifest.json');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith('\\test\\project\\ToolingManifest.json', 'utf-8');
      expect(result).toHaveLength(2);
      expect(result[0].mcpServerName).toBe('mailServer');
      expect(result[1].mcpServerName).toBe('sharePointServer');
    });

    it('should return empty array when manifest not found', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(result).toEqual([]);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('ToolingManifest.json not found')
      );
    });

    it('should handle JSON parsing errors', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue('invalid json');

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error reading or parsing ToolingManifest.json')
      );
    });

    it('should handle file read errors', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(result).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error reading or parsing ToolingManifest.json: Permission denied')
      );
    });

    it('should handle manifest with no mcpServers property', async () => {
      const manifestContent = { someOtherProperty: 'value' };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(manifestContent));

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(result).toEqual([]);
    });

    it('should handle empty mcpServers array', async () => {
      const manifestContent = { mcpServers: [] };

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(manifestContent));

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(result).toEqual([]);
    });

    it('should fallback to argv[1] location when manifest not found in cwd', async () => {
      process.argv[1] = '/app/dist/server.js';
      
      const manifestContent = { mcpServers: [{ mcpServerName: 'testServer' }] };

      mockedFs.existsSync
        .mockReturnValueOnce(false) // First call for cwd path
        .mockReturnValueOnce(true);  // Second call for argv path
      mockedFs.readFileSync.mockReturnValue(JSON.stringify(manifestContent));

      const result = await service.listToolServers('agent-123', 'env-456', 'token');

      expect(mockedFs.existsSync).toHaveBeenCalledWith('\\test\\project\\ToolingManifest.json');
      expect(mockedFs.existsSync).toHaveBeenCalledWith('\\app\\dist\\ToolingManifest.json');
      expect(result).toHaveLength(1);
      expect(result[0].mcpServerName).toBe('testServer');
    });
  });

  describe('environment detection', () => {
    it('should use development path when NODE_ENV is development', async () => {
      process.env.NODE_ENV = 'development';
      mockedFs.existsSync.mockReturnValue(false);

      await service.listToolServers('agent-123', 'env-456', 'token');

      // Should try to read manifest instead of making HTTP request
      expect(mockedFs.existsSync).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should use development path when NODE_ENV is Development (case insensitive)', async () => {
      process.env.NODE_ENV = 'Development';
      mockedFs.existsSync.mockReturnValue(false);

      await service.listToolServers('agent-123', 'env-456', 'token');

      expect(mockedFs.existsSync).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should use production path when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production';
      mockedAxios.get.mockResolvedValue({ data: [] });

      await service.listToolServers('agent-123', 'env-456', 'token');

      expect(mockedAxios.get).toHaveBeenCalled();
      expect(mockedFs.existsSync).not.toHaveBeenCalled();
    });

    it('should default to development when NODE_ENV is not set', async () => {
      delete process.env.NODE_ENV;
      mockedFs.existsSync.mockReturnValue(false);

      await service.listToolServers('agent-123', 'env-456', 'token');

      expect(mockedFs.existsSync).toHaveBeenCalled();
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });
});