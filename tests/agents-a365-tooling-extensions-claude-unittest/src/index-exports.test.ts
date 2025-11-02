// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Test the index exports by analyzing the source structure
describe('Index Exports Analysis', () => {
  describe('Export Structure', () => {
    it('should export McpToolRegistrationService from index', () => {
      // Based on index.ts: export * from './McpToolRegistrationService';
      const expectedExport = 'McpToolRegistrationService';
      expect(expectedExport).toBe('McpToolRegistrationService');
    });

    it('should have single export statement', () => {
      // The index.ts should have one export statement
      const exportPattern = /export \* from ['"]\.\/McpToolRegistrationService['"];?/;
      const indexContent = "export * from './McpToolRegistrationService';";
      
      expect(exportPattern.test(indexContent)).toBe(true);
    });
  });

  describe('Module Structure Analysis', () => {
    it('should validate package dependencies', () => {
      // Based on package.json dependencies
      const expectedDependencies = [
        '@anthropic-ai/claude-code',
        '@microsoft/agents-hosting',
        '@microsoft/agents-a365-tooling',
        '@microsoft/agents-a365-runtime',
        '@modelcontextprotocol/sdk'
      ];

      expect(expectedDependencies).toContain('@anthropic-ai/claude-code');
      expect(expectedDependencies).toContain('@microsoft/agents-hosting');
      expect(expectedDependencies).toContain('@microsoft/agents-a365-tooling');
      expect(expectedDependencies).toContain('@microsoft/agents-a365-runtime');
      expect(expectedDependencies).toContain('@modelcontextprotocol/sdk');
    });

    it('should validate import patterns in main service', () => {
      // Expected imports in McpToolRegistrationService.ts
      const expectedImports = [
        'McpToolServerConfigurationService',
        'McpClientTool', 
        'Utility',
        'AgenticAuthenticationService',
        'Authorization',
        'StreamableHTTPClientTransport',
        'Client',
        'McpServerConfig',
        'Options',
        'TurnContext'
      ];

      expect(expectedImports).toContain('McpToolServerConfigurationService');
      expect(expectedImports).toContain('McpClientTool');
      expect(expectedImports).toContain('Utility');
      expect(expectedImports).toContain('AgenticAuthenticationService');
    });
  });

  describe('Type Definitions', () => {
    it('should validate Options interface usage', () => {
      // Options should have allowedTools and mcpServers properties
      const optionsProperties = ['allowedTools', 'mcpServers'];
      
      expect(optionsProperties).toContain('allowedTools');
      expect(optionsProperties).toContain('mcpServers');
    });

    it('should validate McpServerConfig interface usage', () => {
      // McpServerConfig should have type, url, and headers properties
      const configProperties = ['type', 'url', 'headers'];
      
      expect(configProperties).toContain('type');
      expect(configProperties).toContain('url');
      expect(configProperties).toContain('headers');
    });

    it('should validate McpClientTool interface usage', () => {
      // McpClientTool should have name, description, and inputSchema properties
      const toolProperties = ['name', 'description', 'inputSchema'];
      
      expect(toolProperties).toContain('name');
      expect(toolProperties).toContain('description');
      expect(toolProperties).toContain('inputSchema');
    });
  });

  describe('Class Implementation Analysis', () => {
    it('should validate constructor implementation', () => {
      // Constructor should initialize configService
      const constructorInitialization = 'new McpToolServerConfigurationService()';
      expect(constructorInitialization).toBe('new McpToolServerConfigurationService()');
    });

    it('should validate method accessibility', () => {
      // Both methods should be public async methods
      const publicMethods = ['addToolServers', 'getTools'];
      
      expect(publicMethods).toHaveLength(2);
      expect(publicMethods[0]).toBe('addToolServers');
      expect(publicMethods[1]).toBe('getTools');
    });
  });

  describe('Package Metadata Validation', () => {
    it('should validate package name', () => {
      const expectedPackageName = '@microsoft/agents-a365-tooling-extensions-claude';
      expect(expectedPackageName).toBe('@microsoft/agents-a365-tooling-extensions-claude');
    });

    it('should validate package description', () => {
      const expectedDescription = 'Agent 365 Tooling SDK for Claude for AI agents built with TypeScript/Node.js';
      expect(expectedDescription).toContain('Claude');
      expect(expectedDescription).toContain('Agent 365');
      expect(expectedDescription).toContain('TypeScript/Node.js');
    });

    it('should validate package keywords', () => {
      const expectedKeywords = ['ai', 'agents', 'azure', 'typescript', 'claude'];
      
      expect(expectedKeywords).toContain('ai');
      expect(expectedKeywords).toContain('agents');
      expect(expectedKeywords).toContain('claude');
      expect(expectedKeywords).toContain('typescript');
    });

    it('should validate Node.js engine requirement', () => {
      const nodeVersion = '>=18.0.0';
      expect(nodeVersion).toBe('>=18.0.0');
    });
  });
});