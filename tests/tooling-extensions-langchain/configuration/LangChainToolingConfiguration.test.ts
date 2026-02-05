// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  LangChainToolingConfiguration,
  defaultLangChainToolingConfigurationProvider
} from '../../../packages/agents-a365-tooling-extensions-langchain/src';
import { ToolingConfiguration } from '../../../packages/agents-a365-tooling/src';
import { RuntimeConfiguration, DefaultConfigurationProvider, ClusterCategory } from '../../../packages/agents-a365-runtime/src';

describe('LangChainToolingConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('inheritance from ToolingConfiguration', () => {
    it('should inherit tooling settings', () => {
      const config = new LangChainToolingConfiguration({
        mcpPlatformEndpoint: () => 'https://custom.endpoint'
      });
      expect(config.mcpPlatformEndpoint).toBe('https://custom.endpoint');
    });

    it('should be instanceof ToolingConfiguration', () => {
      const config = new LangChainToolingConfiguration();
      expect(config).toBeInstanceOf(ToolingConfiguration);
    });

    it('should be instanceof RuntimeConfiguration', () => {
      const config = new LangChainToolingConfiguration();
      expect(config).toBeInstanceOf(RuntimeConfiguration);
    });
  });

  describe('inherited runtime settings', () => {
    it('should inherit clusterCategory from override', () => {
      const config = new LangChainToolingConfiguration({ clusterCategory: () => ClusterCategory.gov });
      expect(config.clusterCategory).toBe(ClusterCategory.gov);
    });

    it('should inherit clusterCategory from env var', () => {
      process.env.CLUSTER_CATEGORY = 'dev';
      const config = new LangChainToolingConfiguration({});
      expect(config.clusterCategory).toBe('dev');
    });

    it('should inherit isDevelopmentEnvironment', () => {
      const config = new LangChainToolingConfiguration({ clusterCategory: () => ClusterCategory.local });
      expect(config.isDevelopmentEnvironment).toBe(true);
    });
  });

  describe('inherited tooling settings', () => {
    it('should inherit mcpPlatformEndpoint from env var', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://env.endpoint';
      const config = new LangChainToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://env.endpoint');
    });

    it('should inherit mcpPlatformAuthenticationScope from override', () => {
      const config = new LangChainToolingConfiguration({
        mcpPlatformAuthenticationScope: () => 'custom-scope/.default'
      });
      expect(config.mcpPlatformAuthenticationScope).toBe('custom-scope/.default');
    });

    it('should use default mcpPlatformEndpoint when not overridden', () => {
      delete process.env.MCP_PLATFORM_ENDPOINT;
      const config = new LangChainToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://agent365.svc.cloud.microsoft');
    });
  });

  describe('combined overrides', () => {
    it('should allow overriding runtime, tooling settings together', () => {
      const config = new LangChainToolingConfiguration({
        clusterCategory: () => ClusterCategory.dev,
        mcpPlatformEndpoint: () => 'https://dev.endpoint',
        mcpPlatformAuthenticationScope: () => 'dev-scope/.default'
      });
      expect(config.clusterCategory).toBe(ClusterCategory.dev);
      expect(config.isDevelopmentEnvironment).toBe(true);
      expect(config.mcpPlatformEndpoint).toBe('https://dev.endpoint');
      expect(config.mcpPlatformAuthenticationScope).toBe('dev-scope/.default');
    });

    it('should support dynamic per-tenant configuration', () => {
      let currentTenant = 'tenant-a';
      const tenantEndpoints: Record<string, string> = {
        'tenant-a': 'https://tenant-a.langchain.endpoint',
        'tenant-b': 'https://tenant-b.langchain.endpoint'
      };

      const config = new LangChainToolingConfiguration({
        mcpPlatformEndpoint: () => tenantEndpoints[currentTenant]
      });

      expect(config.mcpPlatformEndpoint).toBe('https://tenant-a.langchain.endpoint');
      currentTenant = 'tenant-b';
      expect(config.mcpPlatformEndpoint).toBe('https://tenant-b.langchain.endpoint');
    });
  });

  describe('constructor', () => {
    it('should accept no overrides', () => {
      const config = new LangChainToolingConfiguration();
      expect(config).toBeInstanceOf(LangChainToolingConfiguration);
    });

    it('should accept empty overrides object', () => {
      const config = new LangChainToolingConfiguration({});
      expect(config).toBeInstanceOf(LangChainToolingConfiguration);
    });

    it('should accept undefined overrides', () => {
      const config = new LangChainToolingConfiguration(undefined);
      expect(config).toBeInstanceOf(LangChainToolingConfiguration);
    });
  });
});

describe('defaultLangChainToolingConfigurationProvider', () => {
  it('should be an instance of DefaultConfigurationProvider', () => {
    expect(defaultLangChainToolingConfigurationProvider).toBeInstanceOf(DefaultConfigurationProvider);
  });

  it('should return LangChainToolingConfiguration from getConfiguration', () => {
    const config = defaultLangChainToolingConfigurationProvider.getConfiguration();
    expect(config).toBeInstanceOf(LangChainToolingConfiguration);
  });

  it('should return the same configuration instance on multiple calls', () => {
    const config1 = defaultLangChainToolingConfigurationProvider.getConfiguration();
    const config2 = defaultLangChainToolingConfigurationProvider.getConfiguration();
    expect(config1).toBe(config2);
  });
});
