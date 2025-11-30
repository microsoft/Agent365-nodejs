// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { 
  MCPServerConfig, 
  McpClientTool, 
  InputSchema 
} from '@microsoft/agents-a365-tooling';

describe('Tooling Contracts', () => {
  describe('MCPServerConfig Interface', () => {
    it('should support all required properties', () => {
      // Arrange
      const config: MCPServerConfig = {
        mcpServerName: 'test-server',
        url: 'https://example.com/mcp'
      };

      // Assert
      expect(config.mcpServerName).toBe('test-server');
      expect(config.url).toBe('https://example.com/mcp');
    });

    it('should support various URL formats', () => {
      // Arrange & Assert
      const configs: MCPServerConfig[] = [
        { mcpServerName: 'local', url: 'http://localhost:3000' },
        { mcpServerName: 'secure', url: 'https://api.example.com/v1' },
        { mcpServerName: 'with-port', url: 'https://example.com:8080/api' },
        { mcpServerName: 'with-path', url: 'https://example.com/path/to/mcp' }
      ];

      configs.forEach(config => {
        expect(config.mcpServerName).toBeDefined();
        expect(config.url).toBeDefined();
        expect(typeof config.url).toBe('string');
      });
    });

    it('should support server names with various formats', () => {
      // Arrange & Assert
      const serverNames = [
        'simple-server',
        'complex_server_name',
        'server123',
        'my-custom-server-v2',
        'UPPERCASE_SERVER'
      ];

      serverNames.forEach(name => {
        const config: MCPServerConfig = {
          mcpServerName: name,
          url: 'https://example.com/mcp'
        };
        
        expect(config.mcpServerName).toBe(name);
        expect(typeof config.mcpServerName).toBe('string');
      });
    });
  });

  describe('InputSchema Interface', () => {
    it('should support basic schema properties', () => {
      // Arrange
      const schema: InputSchema = {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The name field' },
          age: { type: 'number', description: 'The age field' }
        }
      };

      // Assert
      expect(schema.type).toBe('object');
      expect(schema.properties.name.type).toBe('string');
      expect(schema.properties.name.description).toBe('The name field');
      expect(schema.properties.age.type).toBe('number');
      expect(schema.required).toBeUndefined();
      expect(schema.additionalProperties).toBeUndefined();
    });

    it('should support required fields', () => {
      // Arrange
      const schema: InputSchema = {
        type: 'object',
        properties: {
          requiredField: { type: 'string' },
          optionalField: { type: 'number' }
        },
        required: ['requiredField']
      };

      // Assert
      expect(schema.required).toEqual(['requiredField']);
    });

    it('should support enum properties', () => {
      // Arrange
      const schema: InputSchema = {
        type: 'object',
        properties: {
          status: { 
            type: 'string', 
            description: 'Status value',
            enum: ['active', 'inactive', 'pending'] 
          }
        }
      };

      // Assert
      expect(schema.properties.status.enum).toEqual(['active', 'inactive', 'pending']);
    });

    it('should support additionalProperties flag', () => {
      // Arrange
      const schemaAllowingAdditional: InputSchema = {
        type: 'object',
        properties: {},
        additionalProperties: true
      };

      const schemaNotAllowingAdditional: InputSchema = {
        type: 'object',
        properties: {},
        additionalProperties: false
      };

      // Assert
      expect(schemaAllowingAdditional.additionalProperties).toBe(true);
      expect(schemaNotAllowingAdditional.additionalProperties).toBe(false);
    });

    it('should support complex nested properties', () => {
      // Arrange
      const schema: InputSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            description: 'User object'
          },
          tags: {
            type: 'array',
            description: 'Array of tags'
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata'
          }
        },
        required: ['user'],
        additionalProperties: false
      };

      // Assert
      expect(schema.properties.user.type).toBe('object');
      expect(schema.properties.tags.type).toBe('array');
      expect(schema.properties.metadata.type).toBe('object');
      expect(schema.required).toContain('user');
      expect(schema.additionalProperties).toBe(false);
    });
  });

  describe('McpClientTool Interface', () => {
    it('should support all required properties', () => {
      // Arrange
      const tool: McpClientTool = {
        name: 'test-tool',
        description: 'A test tool for validation',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input parameter' }
          }
        }
      };

      // Assert
      expect(tool.name).toBe('test-tool');
      expect(tool.description).toBe('A test tool for validation');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties.input.type).toBe('string');
    });

    it('should support tool with complex input schema', () => {
      // Arrange
      const tool: McpClientTool = {
        name: 'complex-tool',
        description: 'A tool with complex input schema',
        inputSchema: {
          type: 'object',
          properties: {
            query: { 
              type: 'string', 
              description: 'Search query' 
            },
            limit: { 
              type: 'number', 
              description: 'Maximum results' 
            },
            filters: {
              type: 'object',
              description: 'Filter criteria'
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Sort order'
            }
          },
          required: ['query'],
          additionalProperties: false
        }
      };

      // Assert
      expect(tool.inputSchema.properties.query.type).toBe('string');
      expect(tool.inputSchema.properties.limit.type).toBe('number');
      expect(tool.inputSchema.properties.filters.type).toBe('object');
      expect(tool.inputSchema.properties.sortOrder.enum).toEqual(['asc', 'desc']);
      expect(tool.inputSchema.required).toEqual(['query']);
      expect(tool.inputSchema.additionalProperties).toBe(false);
    });

    it('should support tool with minimal schema', () => {
      // Arrange
      const tool: McpClientTool = {
        name: 'simple-tool',
        description: 'Simple tool with minimal schema',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      };

      // Assert
      expect(tool.name).toBe('simple-tool');
      expect(tool.description).toBe('Simple tool with minimal schema');
      expect(tool.inputSchema.properties).toEqual({});
    });

    it('should support tool names with various formats', () => {
      // Arrange & Assert
      const toolNames = [
        'simple-tool',
        'complex_tool_name',
        'tool123',
        'my-custom-tool-v2',
        'UPPERCASE_TOOL'
      ];

      toolNames.forEach(name => {
        const tool: McpClientTool = {
          name,
          description: `Tool with name ${name}`,
          inputSchema: { type: 'object', properties: {} }
        };
        
        expect(tool.name).toBe(name);
        expect(typeof tool.name).toBe('string');
      });
    });
  });
});