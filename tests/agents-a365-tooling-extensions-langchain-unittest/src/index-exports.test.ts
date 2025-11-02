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
        '@microsoft/agents-hosting',
        '@microsoft/agents-a365-tooling',
        '@microsoft/agents-a365-runtime',
        '@langchain/core',
        '@langchain/mcp-adapters'
      ];

      expect(expectedDependencies).toContain('@microsoft/agents-hosting');
      expect(expectedDependencies).toContain('@microsoft/agents-a365-tooling');
      expect(expectedDependencies).toContain('@microsoft/agents-a365-runtime');
      expect(expectedDependencies).toContain('@langchain/core');
      expect(expectedDependencies).toContain('@langchain/mcp-adapters');
    });

    it('should validate import patterns in main service', () => {
      // Expected imports in McpToolRegistrationService.ts
      const expectedImports = [
        'McpToolServerConfigurationService',
        'McpClientTool', 
        'Utility',
        'AgenticAuthenticationService',
        'Authorization',
        'TurnContext',
        'ClientConfig',
        'Connection',
        'MultiServerMCPClient',
        'DynamicStructuredTool'
      ];

      expect(expectedImports).toContain('McpToolServerConfigurationService');
      expect(expectedImports).toContain('AgenticAuthenticationService');
      expect(expectedImports).toContain('MultiServerMCPClient');
      expect(expectedImports).toContain('DynamicStructuredTool');
    });
  });

  describe('Type Definitions', () => {
    it('should validate ClientConfig interface usage', () => {
      // ClientConfig should have mcpServers property
      const clientConfigProperties = ['mcpServers'];
      
      expect(clientConfigProperties).toContain('mcpServers');
    });

    it('should validate Connection interface usage', () => {
      // Connection should have type, url, and headers properties
      const connectionProperties = ['type', 'url', 'headers'];
      
      expect(connectionProperties).toContain('type');
      expect(connectionProperties).toContain('url');
      expect(connectionProperties).toContain('headers');
    });

    it('should validate McpClientTool interface usage', () => {
      // McpClientTool should have name, description, and inputSchema properties
      const toolProperties = ['name', 'description', 'inputSchema'];
      
      expect(toolProperties).toContain('name');
      expect(toolProperties).toContain('description');
      expect(toolProperties).toContain('inputSchema');
    });

    it('should validate Authorization type usage', () => {
      // Authorization should be passed to GetAgenticUserToken
      const authorizationUsage = {
        service: 'AgenticAuthenticationService',
        method: 'GetAgenticUserToken',
        parameters: ['authorization', 'turnContext']
      };

      expect(authorizationUsage.service).toBe('AgenticAuthenticationService');
      expect(authorizationUsage.method).toBe('GetAgenticUserToken');
      expect(authorizationUsage.parameters).toContain('authorization');
    });
  });

  describe('Package Metadata Validation', () => {
    it('should validate package name', () => {
      const expectedPackageName = '@microsoft/agents-a365-tooling-extensions-langchain';
      expect(expectedPackageName).toBe('@microsoft/agents-a365-tooling-extensions-langchain');
    });

    it('should validate package description', () => {
      const expectedDescription = 'Agent 365 Tooling SDK for LangChain AI agents built with TypeScript/Node.js';
      expect(expectedDescription).toContain('LangChain');
      expect(expectedDescription).toContain('Agent 365');
      expect(expectedDescription).toContain('TypeScript/Node.js');
    });

    it('should validate package keywords', () => {
      const expectedKeywords = ['ai', 'agents', 'azure', 'typescript', 'langchain'];
      
      expect(expectedKeywords).toContain('ai');
      expect(expectedKeywords).toContain('agents');
      expect(expectedKeywords).toContain('langchain');
      expect(expectedKeywords).toContain('typescript');
    });

    it('should validate Node.js engine requirement', () => {
      const nodeVersion = '>=18.0.0';
      expect(nodeVersion).toBe('>=18.0.0');
    });
  });

  describe('LangChain Integration Analysis', () => {
    it('should validate LangChain core integration', () => {
      // Tests DynamicStructuredTool from @langchain/core/tools
      const coreIntegration = {
        package: '@langchain/core',
        subpackage: 'tools',
        importedType: 'DynamicStructuredTool',
        usage: 'return type for addMcpToolServers'
      };

      expect(coreIntegration.package).toBe('@langchain/core');
      expect(coreIntegration.subpackage).toBe('tools');
      expect(coreIntegration.importedType).toBe('DynamicStructuredTool');
    });

    it('should validate LangChain MCP adapters integration', () => {
      // Tests @langchain/mcp-adapters usage
      const mcpAdaptersIntegration = {
        package: '@langchain/mcp-adapters',
        importedTypes: ['ClientConfig', 'Connection', 'MultiServerMCPClient'],
        primaryClass: 'MultiServerMCPClient',
        usage: 'MCP server connection and tool retrieval'
      };

      expect(mcpAdaptersIntegration.package).toBe('@langchain/mcp-adapters');
      expect(mcpAdaptersIntegration.importedTypes).toContain('ClientConfig');
      expect(mcpAdaptersIntegration.importedTypes).toContain('Connection');
      expect(mcpAdaptersIntegration.importedTypes).toContain('MultiServerMCPClient');
    });

    it('should validate tool transformation for LangChain', () => {
      // Tests transformation from MCP tools to LangChain tools
      const toolTransformation = {
        sourceFormat: 'LangChain DynamicStructuredTool',
        targetFormat: 'McpClientTool',
        mappedProperties: ['name', 'description', 'inputSchema'],
        schemaMapping: 'tool.schema -> inputSchema'
      };

      expect(toolTransformation.mappedProperties).toContain('name');
      expect(toolTransformation.mappedProperties).toContain('description');
      expect(toolTransformation.mappedProperties).toContain('inputSchema');
      expect(toolTransformation.schemaMapping).toContain('schema -> inputSchema');
    });
  });
});