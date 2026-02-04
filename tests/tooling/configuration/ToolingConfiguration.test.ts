// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ToolingConfiguration,
  defaultToolingConfigurationProvider
} from '../../../packages/agents-a365-tooling/src';
import { RuntimeConfiguration, DefaultConfigurationProvider } from '../../../packages/agents-a365-runtime/src';

describe('ToolingConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('inheritance from RuntimeConfiguration', () => {
    it('should inherit runtime settings', () => {
      const config = new ToolingConfiguration({ clusterCategory: () => 'gov' });
      expect(config.clusterCategory).toBe('gov');
      expect(config.isDevelopmentEnvironment).toBe(false);
    });

    it('should be instanceof RuntimeConfiguration', () => {
      const config = new ToolingConfiguration();
      expect(config).toBeInstanceOf(RuntimeConfiguration);
    });

    it('should inherit clusterCategory from env var', () => {
      process.env.CLUSTER_CATEGORY = 'dev';
      const config = new ToolingConfiguration({});
      expect(config.clusterCategory).toBe('dev');
      expect(config.isDevelopmentEnvironment).toBe(true);
    });
  });

  describe('mcpPlatformEndpoint', () => {
    it('should use override function when provided', () => {
      const config = new ToolingConfiguration({
        mcpPlatformEndpoint: () => 'https://custom.endpoint'
      });
      expect(config.mcpPlatformEndpoint).toBe('https://custom.endpoint');
    });

    it('should fall back to env var when override not provided', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://env.endpoint';
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://env.endpoint');
    });

    it('should fall back to default when neither override nor env var', () => {
      delete process.env.MCP_PLATFORM_ENDPOINT;
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://agent365.svc.cloud.microsoft');
    });

    it('should fall back to default when env var is empty string', () => {
      process.env.MCP_PLATFORM_ENDPOINT = '';
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://agent365.svc.cloud.microsoft');
    });

    it('should remove trailing slashes from env var', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://env.endpoint///';
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://env.endpoint');
    });

    it('should remove trailing slashes from override', () => {
      const config = new ToolingConfiguration({
        mcpPlatformEndpoint: () => 'https://custom.endpoint/'
      });
      expect(config.mcpPlatformEndpoint).toBe('https://custom.endpoint');
    });

    it('should trim whitespace from env var', () => {
      process.env.MCP_PLATFORM_ENDPOINT = '  https://env.endpoint  ';
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformEndpoint).toBe('https://env.endpoint');
    });

    it('should call override function on each access', () => {
      let callCount = 0;
      const config = new ToolingConfiguration({
        mcpPlatformEndpoint: () => {
          callCount++;
          return 'https://dynamic.endpoint';
        }
      });
      config.mcpPlatformEndpoint;
      config.mcpPlatformEndpoint;
      expect(callCount).toBe(2);
    });
  });

  describe('mcpPlatformAuthenticationScope', () => {
    it('should use override function when provided', () => {
      const config = new ToolingConfiguration({
        mcpPlatformAuthenticationScope: () => 'custom-scope/.default'
      });
      expect(config.mcpPlatformAuthenticationScope).toBe('custom-scope/.default');
    });

    it('should fall back to env var when override not provided', () => {
      process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE = 'env-scope/.default';
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformAuthenticationScope).toBe('env-scope/.default');
    });

    it('should fall back to default when neither override nor env var', () => {
      delete process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE;
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformAuthenticationScope).toBe('ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default');
    });

    it('should fall back to default when env var is empty string', () => {
      process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE = '';
      const config = new ToolingConfiguration({});
      expect(config.mcpPlatformAuthenticationScope).toBe('ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default');
    });
  });

  describe('useToolingManifest', () => {
    it('should use override function when provided', () => {
      const config = new ToolingConfiguration({
        useToolingManifest: () => true
      });
      expect(config.useToolingManifest).toBe(true);
    });

    it('should return false override when provided', () => {
      process.env.NODE_ENV = 'development';
      const config = new ToolingConfiguration({
        useToolingManifest: () => false
      });
      // Override takes precedence over NODE_ENV
      expect(config.useToolingManifest).toBe(false);
    });

    it('should return true when NODE_ENV is development (lowercase)', () => {
      process.env.NODE_ENV = 'development';
      const config = new ToolingConfiguration({});
      expect(config.useToolingManifest).toBe(true);
    });

    it('should return true when NODE_ENV is Development (mixed case)', () => {
      process.env.NODE_ENV = 'Development';
      const config = new ToolingConfiguration({});
      expect(config.useToolingManifest).toBe(true);
    });

    it('should return true when NODE_ENV is DEVELOPMENT (uppercase)', () => {
      process.env.NODE_ENV = 'DEVELOPMENT';
      const config = new ToolingConfiguration({});
      expect(config.useToolingManifest).toBe(true);
    });

    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      const config = new ToolingConfiguration({});
      expect(config.useToolingManifest).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      const config = new ToolingConfiguration({});
      expect(config.useToolingManifest).toBe(false);
    });

    it('should return false when NODE_ENV is empty string', () => {
      process.env.NODE_ENV = '';
      const config = new ToolingConfiguration({});
      expect(config.useToolingManifest).toBe(false);
    });

    it('should call override function on each access', () => {
      let callCount = 0;
      const config = new ToolingConfiguration({
        useToolingManifest: () => {
          callCount++;
          return true;
        }
      });
      config.useToolingManifest;
      config.useToolingManifest;
      expect(callCount).toBe(2);
    });
  });

  describe('combined overrides', () => {
    it('should allow overriding both runtime and tooling settings', () => {
      const config = new ToolingConfiguration({
        clusterCategory: () => 'dev',
        mcpPlatformEndpoint: () => 'https://dev.endpoint'
      });
      expect(config.clusterCategory).toBe('dev');
      expect(config.isDevelopmentEnvironment).toBe(true);
      expect(config.mcpPlatformEndpoint).toBe('https://dev.endpoint');
    });

    it('should support dynamic per-tenant configuration', () => {
      let currentTenant = 'tenant-a';
      const tenantEndpoints: Record<string, string> = {
        'tenant-a': 'https://tenant-a.endpoint',
        'tenant-b': 'https://tenant-b.endpoint'
      };

      const config = new ToolingConfiguration({
        mcpPlatformEndpoint: () => tenantEndpoints[currentTenant]
      });

      expect(config.mcpPlatformEndpoint).toBe('https://tenant-a.endpoint');
      currentTenant = 'tenant-b';
      expect(config.mcpPlatformEndpoint).toBe('https://tenant-b.endpoint');
    });
  });
});

describe('defaultToolingConfigurationProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be an instance of DefaultConfigurationProvider', () => {
    expect(defaultToolingConfigurationProvider).toBeInstanceOf(DefaultConfigurationProvider);
  });

  it('should return ToolingConfiguration from getConfiguration', () => {
    const config = defaultToolingConfigurationProvider.getConfiguration();
    expect(config).toBeInstanceOf(ToolingConfiguration);
  });

  it('should return the same configuration instance on multiple calls', () => {
    const config1 = defaultToolingConfigurationProvider.getConfiguration();
    const config2 = defaultToolingConfigurationProvider.getConfiguration();
    expect(config1).toBe(config2);
  });
});
