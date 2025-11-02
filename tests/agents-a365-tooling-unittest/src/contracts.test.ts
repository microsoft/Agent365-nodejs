// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { MCPServerConfig, McpClientTool, InputSchema } from '../../../packages/agents-a365-tooling/src/contracts';

describe('Contracts', () => {
  describe('MCPServerConfig', () => {
    it('should define MCPServerConfig interface with required properties', () => {
      const config: MCPServerConfig = {
        mcpServerName: 'testServer',
        url: 'https://example.com'
      };

      expect(config.mcpServerName).toBe('testServer');
      expect(config.url).toBe('https://example.com');
    });

    it('should allow valid MCPServerConfig objects', () => {
      const configs: MCPServerConfig[] = [
        {
          mcpServerName: 'mailServer',
          url: 'https://mail.example.com'
        },
        {
          mcpServerName: 'sharePointServer',
          url: 'https://sharepoint.example.com'
        }
      ];

      configs.forEach(config => {
        expect(config).toHaveProperty('mcpServerName');
        expect(config).toHaveProperty('url');
        expect(typeof config.mcpServerName).toBe('string');
        expect(typeof config.url).toBe('string');
      });
    });
  });

  describe('InputSchema', () => {
    it('should define InputSchema interface with required type property', () => {
      const schema: InputSchema = {
        type: 'object',
        properties: {}
      };

      expect(schema.type).toBe('object');
      expect(schema.properties).toEqual({});
    });

    it('should support complex InputSchema with all optional properties', () => {
      const schema: InputSchema = {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name field'
          },
          age: {
            type: 'number',
            description: 'The age field'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive']
          }
        },
        required: ['name'],
        additionalProperties: false
      };

      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('name');
      expect(schema.properties).toHaveProperty('age');
      expect(schema.properties).toHaveProperty('status');
      expect(schema.required).toEqual(['name']);
      expect(schema.additionalProperties).toBe(false);
      expect(schema.properties.status.enum).toEqual(['active', 'inactive']);
    });

    it('should support InputSchema with no properties', () => {
      const schema: InputSchema = {
        type: 'string',
        properties: {}
      };

      expect(schema.type).toBe('string');
      expect(Object.keys(schema.properties)).toHaveLength(0);
    });
  });

  describe('McpClientTool', () => {
    it('should define McpClientTool interface with all required properties', () => {
      const tool: McpClientTool = {
        name: 'sendEmail',
        description: 'Send an email message',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body' }
          },
          required: ['to', 'subject', 'body']
        }
      };

      expect(tool.name).toBe('sendEmail');
      expect(tool.description).toBe('Send an email message');
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('to');
      expect(tool.inputSchema.required).toEqual(['to', 'subject', 'body']);
    });

    it('should support McpClientTool with minimal inputSchema', () => {
      const tool: McpClientTool = {
        name: 'simpleAction',
        description: 'A simple action',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      };

      expect(tool.name).toBe('simpleAction');
      expect(tool.description).toBe('A simple action');
      expect(tool.inputSchema.type).toBe('object');
      expect(Object.keys(tool.inputSchema.properties)).toHaveLength(0);
    });

    it('should support McpClientTool with complex nested properties', () => {
      const tool: McpClientTool = {
        name: 'complexTool',
        description: 'A complex tool with nested properties',
        inputSchema: {
          type: 'object',
          properties: {
            config: {
              type: 'object',
              description: 'Configuration object'
            },
            options: {
              type: 'array',
              description: 'Array of options'
            },
            mode: {
              type: 'string',
              enum: ['development', 'production'],
              description: 'Operating mode'
            }
          },
          required: ['config'],
          additionalProperties: true
        }
      };

      expect(tool.name).toBe('complexTool');
      expect(tool.inputSchema.properties.mode.enum).toEqual(['development', 'production']);
      expect(tool.inputSchema.additionalProperties).toBe(true);
    });
  });
});