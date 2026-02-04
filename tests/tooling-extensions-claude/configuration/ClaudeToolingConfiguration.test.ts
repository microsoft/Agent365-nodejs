// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ClaudeToolingConfiguration,
  defaultClaudeToolingConfigurationProvider
} from '../../../packages/agents-a365-tooling-extensions-claude/src';
import { ToolingConfiguration } from '../../../packages/agents-a365-tooling/src';
import { RuntimeConfiguration, DefaultConfigurationProvider } from '../../../packages/agents-a365-runtime/src';

describe('ClaudeToolingConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('inheritance from ToolingConfiguration', () => {
    it('should inherit tooling settings', () => {
      const config = new ClaudeToolingConfiguration({
        mcpPlatformEndpoint: () => 'https://custom.endpoint'
      });
      expect(config.mcpPlatformEndpoint).toBe('https://custom.endpoint');
    });

    it('should be instanceof ToolingConfiguration', () => {
      const config = new ClaudeToolingConfiguration();
      expect(config).toBeInstanceOf(ToolingConfiguration);
    });

    it('should be instanceof RuntimeConfiguration', () => {
      const config = new ClaudeToolingConfiguration();
      expect(config).toBeInstanceOf(RuntimeConfiguration);
    });
  });

  describe('inherited runtime settings', () => {
    it('should inherit clusterCategory from override', () => {
      const config = new ClaudeToolingConfiguration({ clusterCategory: () => 'gov' });
      expect(config.clusterCategory).toBe('gov');
    });

    it('should inherit clusterCategory from env var', () => {
      process.env.CLUSTER_CATEGORY = 'dev';
      const config = new ClaudeToolingConfiguration({});
      expect(config.clusterCategory).toBe('dev');
    });

    it('should inherit isDevelopmentEnvironment', () => {
      const config = new ClaudeToolingConfiguration({ clusterCategory: () => 'local' });
      expect(config.isDevelopmentEnvironment).toBe(true);
    });
  });

  describe('inherited tooling settings', () => {
    it('should inherit mcpPlatformEndpoint from env var', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://env.endpoint';
      const config = new ClaudeToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://env.endpoint');
    });

    it('should inherit mcpPlatformAuthenticationScope from override', () => {
      const config = new ClaudeToolingConfiguration({
        mcpPlatformAuthenticationScope: () => 'custom-scope/.default'
      });
      expect(config.mcpPlatformAuthenticationScope).toBe('custom-scope/.default');
    });

    it('should use default mcpPlatformEndpoint when not overridden', () => {
      delete process.env.MCP_PLATFORM_ENDPOINT;
      const config = new ClaudeToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://agent365.svc.cloud.microsoft');
    });
  });

  describe('combined overrides', () => {
    it('should allow overriding runtime, tooling settings together', () => {
      const config = new ClaudeToolingConfiguration({
        clusterCategory: () => 'dev',
        mcpPlatformEndpoint: () => 'https://dev.endpoint',
        mcpPlatformAuthenticationScope: () => 'dev-scope/.default'
      });
      expect(config.clusterCategory).toBe('dev');
      expect(config.isDevelopmentEnvironment).toBe(true);
      expect(config.mcpPlatformEndpoint).toBe('https://dev.endpoint');
      expect(config.mcpPlatformAuthenticationScope).toBe('dev-scope/.default');
    });

    it('should support dynamic per-tenant configuration', () => {
      let currentTenant = 'tenant-a';
      const tenantEndpoints: Record<string, string> = {
        'tenant-a': 'https://tenant-a.claude.endpoint',
        'tenant-b': 'https://tenant-b.claude.endpoint'
      };

      const config = new ClaudeToolingConfiguration({
        mcpPlatformEndpoint: () => tenantEndpoints[currentTenant]
      });

      expect(config.mcpPlatformEndpoint).toBe('https://tenant-a.claude.endpoint');
      currentTenant = 'tenant-b';
      expect(config.mcpPlatformEndpoint).toBe('https://tenant-b.claude.endpoint');
    });
  });

  describe('constructor', () => {
    it('should accept no overrides', () => {
      const config = new ClaudeToolingConfiguration();
      expect(config).toBeInstanceOf(ClaudeToolingConfiguration);
    });

    it('should accept empty overrides object', () => {
      const config = new ClaudeToolingConfiguration({});
      expect(config).toBeInstanceOf(ClaudeToolingConfiguration);
    });

    it('should accept undefined overrides', () => {
      const config = new ClaudeToolingConfiguration(undefined);
      expect(config).toBeInstanceOf(ClaudeToolingConfiguration);
    });
  });
});

describe('defaultClaudeToolingConfigurationProvider', () => {
  it('should be an instance of DefaultConfigurationProvider', () => {
    expect(defaultClaudeToolingConfigurationProvider).toBeInstanceOf(DefaultConfigurationProvider);
  });

  it('should return ClaudeToolingConfiguration from getConfiguration', () => {
    const config = defaultClaudeToolingConfigurationProvider.getConfiguration();
    expect(config).toBeInstanceOf(ClaudeToolingConfiguration);
  });

  it('should return the same configuration instance on multiple calls', () => {
    const config1 = defaultClaudeToolingConfigurationProvider.getConfiguration();
    const config2 = defaultClaudeToolingConfigurationProvider.getConfiguration();
    expect(config1).toBe(config2);
  });
});
