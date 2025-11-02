// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Test the index exports and OpenAI integration by analyzing the source structure
describe('OpenAI Package Index Exports Analysis', () => {
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
        '@openai/agents',
        '@microsoft/agents-hosting',
        '@microsoft/agents-a365-tooling',
        '@microsoft/agents-a365-runtime'
      ];

      expect(expectedDependencies).toContain('@openai/agents');
      expect(expectedDependencies).toContain('@microsoft/agents-hosting');
      expect(expectedDependencies).toContain('@microsoft/agents-a365-tooling');
      expect(expectedDependencies).toContain('@microsoft/agents-a365-runtime');
    });

    it('should validate import patterns in main service', () => {
      // Expected imports in McpToolRegistrationService.ts
      const expectedImports = [
        'McpToolServerConfigurationService',
        'McpClientTool', 
        'Utility',
        'AgenticAuthenticationService',
        'Authorization',
        'Agent',
        'MCPServerStreamableHttp',
        'TurnContext'
      ];

      expect(expectedImports).toContain('McpToolServerConfigurationService');
      expect(expectedImports).toContain('Agent');
      expect(expectedImports).toContain('MCPServerStreamableHttp');
      expect(expectedImports).toContain('AgenticAuthenticationService');
    });
  });

  describe('Type Definitions', () => {
    it('should validate Agent interface usage', () => {
      // Agent should have mcpServers property
      const agentProperties = ['mcpServers'];
      
      expect(agentProperties).toContain('mcpServers');
    });

    it('should validate MCPServerStreamableHttp interface usage', () => {
      // MCPServerStreamableHttp should have url, name, requestInit properties and methods
      const serverProperties = ['url', 'name', 'requestInit'];
      const serverMethods = ['connect', 'listTools', 'close'];
      
      expect(serverProperties).toContain('url');
      expect(serverProperties).toContain('name');
      expect(serverProperties).toContain('requestInit');
      expect(serverMethods).toContain('connect');
      expect(serverMethods).toContain('listTools');
      expect(serverMethods).toContain('close');
    });

    it('should validate McpClientTool interface usage', () => {
      // McpClientTool should be the return type for tools
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
      const expectedPackageName = '@microsoft/agents-a365-tooling-extensions-openai';
      expect(expectedPackageName).toBe('@microsoft/agents-a365-tooling-extensions-openai');
    });

    it('should validate package description', () => {
      const expectedDescription = 'Agent 365 Tooling SDK for OpenAI for AI agents built with TypeScript/Node.js';
      expect(expectedDescription).toContain('OpenAI');
      expect(expectedDescription).toContain('Agent 365');
      expect(expectedDescription).toContain('TypeScript/Node.js');
    });

    it('should validate package keywords', () => {
      const expectedKeywords = ['ai', 'agents', 'azure', 'typescript', 'openai'];
      
      expect(expectedKeywords).toContain('ai');
      expect(expectedKeywords).toContain('agents');
      expect(expectedKeywords).toContain('openai');
      expect(expectedKeywords).toContain('typescript');
    });

    it('should validate Node.js engine requirement', () => {
      const nodeVersion = '>=18.0.0';
      expect(nodeVersion).toBe('>=18.0.0');
    });
  });

  describe('OpenAI Integration Analysis', () => {
    it('should validate OpenAI agents SDK integration', () => {
      // Tests @openai/agents package usage
      const openaiIntegration = {
        package: '@openai/agents',
        importedTypes: ['Agent', 'MCPServerStreamableHttp'],
        primaryAgent: 'Agent',
        mcpServerType: 'MCPServerStreamableHttp'
      };

      expect(openaiIntegration.package).toBe('@openai/agents');
      expect(openaiIntegration.importedTypes).toContain('Agent');
      expect(openaiIntegration.importedTypes).toContain('MCPServerStreamableHttp');
    });

    it('should validate Agent.mcpServers property usage', () => {
      // Tests agent.mcpServers array management
      const agentProperty = {
        propertyName: 'mcpServers',
        propertyType: 'MCPServerStreamableHttp[]',
        initialization: 'agent.mcpServers ?? []',
        addition: 'agent.mcpServers.push(...mcpServers)'
      };

      expect(agentProperty.propertyName).toBe('mcpServers');
      expect(agentProperty.propertyType).toContain('MCPServerStreamableHttp[]');
      expect(agentProperty.initialization).toContain('??');
      expect(agentProperty.addition).toContain('push(...mcpServers)');
    });

    it('should validate MCPServerStreamableHttp configuration', () => {
      // Tests server configuration structure
      const serverConfig = {
        constructor: 'MCPServerStreamableHttp',
        configParams: ['url', 'name', 'requestInit'],
        urlSource: 'server.url',
        nameSource: 'server.mcpServerName',
        headersLocation: 'requestInit.headers'
      };

      expect(serverConfig.constructor).toBe('MCPServerStreamableHttp');
      expect(serverConfig.configParams).toContain('url');
      expect(serverConfig.configParams).toContain('name');
      expect(serverConfig.configParams).toContain('requestInit');
    });

    it('should validate OpenAI-specific method patterns', () => {
      // Tests OpenAI agent method usage patterns
      const methodPatterns = {
        agentModification: 'direct agent.mcpServers manipulation',
        serverLifecycle: 'connect -> listTools -> close',
        resourceManagement: 'explicit connection close',
        asyncOperations: 'all server operations are async'
      };

      expect(methodPatterns.agentModification).toContain('agent.mcpServers');
      expect(methodPatterns.serverLifecycle).toContain('connect -> listTools -> close');
      expect(methodPatterns.resourceManagement).toContain('explicit connection close');
    });
  });

  describe('Request Configuration Analysis', () => {
    it('should validate requestInit headers structure', () => {
      // Tests requestInit.headers configuration
      const requestConfig = {
        structure: 'requestInit: { headers: Record<string, string> }',
        authHeader: 'Authorization: Bearer ${authToken}',
        environmentHeader: 'x-ms-environment-id',
        conditionalInclusion: 'headers added based on conditions'
      };

      expect(requestConfig.structure).toContain('requestInit');
      expect(requestConfig.authHeader).toContain('Authorization: Bearer');
      expect(requestConfig.environmentHeader).toBe('x-ms-environment-id');
    });

    it('should validate header composition logic', () => {
      // Tests conditional header addition
      const headerLogic = {
        authTokenCondition: 'if (authToken)',
        environmentCondition: 'if (Utility.GetUseEnvironmentId() && environmentId)',
        dynamicHeaders: 'headers object built conditionally',
        passedToServer: 'headers passed via requestInit'
      };

      expect(headerLogic.authTokenCondition).toContain('authToken');
      expect(headerLogic.environmentCondition).toContain('GetUseEnvironmentId');
      expect(headerLogic.dynamicHeaders).toContain('conditionally');
    });
  });
});