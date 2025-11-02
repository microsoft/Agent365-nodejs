// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as toolingIndex from '../../../packages/agents-a365-tooling/src/index';
import { Utility, ToolsMode } from '../../../packages/agents-a365-tooling/src/Utility';
import { McpToolServerConfigurationService } from '../../../packages/agents-a365-tooling/src/McpToolServerConfigurationService';
import { MCPServerConfig, McpClientTool, InputSchema } from '../../../packages/agents-a365-tooling/src/contracts';

describe('Index Exports', () => {
  describe('re-exported modules', () => {
    it('should export Utility class', () => {
      expect(toolingIndex.Utility).toBeDefined();
      expect(toolingIndex.Utility).toBe(Utility);
    });

    it('should export ToolsMode enum', () => {
      expect(toolingIndex.ToolsMode).toBeDefined();
      expect(toolingIndex.ToolsMode).toBe(ToolsMode);
      expect(toolingIndex.ToolsMode.MockMCPServer).toBe('MockMCPServer');
      expect(toolingIndex.ToolsMode.MCPPlatform).toBe('MCPPlatform');
    });

    it('should export McpToolServerConfigurationService class', () => {
      expect(toolingIndex.McpToolServerConfigurationService).toBeDefined();
      expect(toolingIndex.McpToolServerConfigurationService).toBe(McpToolServerConfigurationService);
    });

    it('should export contract interfaces and types', () => {
      // TypeScript interfaces can't be directly tested at runtime,
      // but we can verify the module structure and that types can be used
      const mockConfig: MCPServerConfig = {
        mcpServerName: 'test',
        url: 'https://test.com'
      };
      
      const mockInputSchema: InputSchema = {
        type: 'object',
        properties: {}
      };

      const mockTool: McpClientTool = {
        name: 'testTool',
        description: 'Test tool',
        inputSchema: mockInputSchema
      };

      expect(mockConfig.mcpServerName).toBe('test');
      expect(mockTool.name).toBe('testTool');
      expect(mockInputSchema.type).toBe('object');
    });
  });

  describe('module structure', () => {
    it('should have the expected export structure', () => {
      const exportedKeys = Object.keys(toolingIndex);
      
      expect(exportedKeys).toContain('Utility');
      expect(exportedKeys).toContain('ToolsMode');
      expect(exportedKeys).toContain('McpToolServerConfigurationService');
    });

    it('should allow instantiating exported classes', () => {
      const service = new toolingIndex.McpToolServerConfigurationService();
      expect(service).toBeInstanceOf(toolingIndex.McpToolServerConfigurationService);
    });

    it('should allow accessing static methods from exported classes', () => {
      const result = toolingIndex.Utility.GetToolsMode();
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should allow using exported enums', () => {
      const mockMode = toolingIndex.ToolsMode.MockMCPServer;
      const platformMode = toolingIndex.ToolsMode.MCPPlatform;
      
      expect(mockMode).toBe('MockMCPServer');
      expect(platformMode).toBe('MCPPlatform');
    });
  });

  describe('type compatibility', () => {
    it('should maintain type compatibility for MCPServerConfig', () => {
      const config: MCPServerConfig = {
        mcpServerName: 'exampleServer',
        url: 'https://example.com/mcp'
      };

      expect(config).toHaveProperty('mcpServerName');
      expect(config).toHaveProperty('url');
      expect(typeof config.mcpServerName).toBe('string');
      expect(typeof config.url).toBe('string');
    });

    it('should maintain type compatibility for InputSchema', () => {
      const schema: InputSchema = {
        type: 'object',
        properties: {
          param1: { type: 'string', description: 'Parameter 1' },
          param2: { type: 'number' }
        },
        required: ['param1']
      };

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('param1');
      expect(schema.properties).toHaveProperty('param2');
      expect(schema.required).toEqual(['param1']);
    });

    it('should maintain type compatibility for McpClientTool', () => {
      const tool: McpClientTool = {
        name: 'calculateSum',
        description: 'Calculates the sum of two numbers',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['a', 'b']
        }
      };

      expect(tool.name).toBe('calculateSum');
      expect(tool.description).toBe('Calculates the sum of two numbers');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.required).toEqual(['a', 'b']);
    });
  });
});