// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ToolingConfiguration,
  defaultToolingConfigurationProvider,
  resolveTokenScopeForServer
} from '../../../packages/agents-a365-tooling/src';
import { RuntimeConfiguration, DefaultConfigurationProvider, ClusterCategory } from '../../../packages/agents-a365-runtime/src';

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
      const config = new ToolingConfiguration({ clusterCategory: () => ClusterCategory.gov });
      expect(config.clusterCategory).toBe(ClusterCategory.gov);
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

    it('should fall back to env var when override returns empty string', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://env.endpoint';
      const config = new ToolingConfiguration({
        mcpPlatformEndpoint: () => ''
      });
      expect(config.mcpPlatformEndpoint).toBe('https://env.endpoint');
    });

    it('should fall back to default when override returns empty string and no env var', () => {
      delete process.env.MCP_PLATFORM_ENDPOINT;
      const config = new ToolingConfiguration({
        mcpPlatformEndpoint: () => ''
      });
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

    it('should fall back to env var when override returns empty string', () => {
      process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE = 'env-scope/.default';
      const config = new ToolingConfiguration({
        mcpPlatformAuthenticationScope: () => ''
      });
      expect(config.mcpPlatformAuthenticationScope).toBe('env-scope/.default');
    });

    it('should fall back to default when override returns empty string and no env var', () => {
      delete process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE;
      const config = new ToolingConfiguration({
        mcpPlatformAuthenticationScope: () => ''
      });
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

  describe('getBearerTokenForServer', () => {
    it('should return per-server token when BEARER_TOKEN_<NAME> is set', () => {
      process.env.BEARER_TOKEN_MYSERVER = 'per-server-token';
      const config = new ToolingConfiguration({});
      expect(config.getBearerTokenForServer('myserver')).toBe('per-server-token');
    });

    it('should fall back to BEARER_TOKEN when per-server var is not set', () => {
      delete process.env.BEARER_TOKEN_MYSERVER;
      process.env.BEARER_TOKEN = 'shared-token';
      const config = new ToolingConfiguration({});
      expect(config.getBearerTokenForServer('myserver')).toBe('shared-token');
    });

    it('should return undefined when neither per-server nor shared token is set', () => {
      delete process.env.BEARER_TOKEN_MYSERVER;
      delete process.env.BEARER_TOKEN;
      const config = new ToolingConfiguration({});
      expect(config.getBearerTokenForServer('myserver')).toBeUndefined();
    });

    it('should prefer per-server token over shared BEARER_TOKEN when both are set', () => {
      process.env.BEARER_TOKEN_MYSERVER = 'per-server-token';
      process.env.BEARER_TOKEN = 'shared-token';
      const config = new ToolingConfiguration({});
      expect(config.getBearerTokenForServer('myserver')).toBe('per-server-token');
    });

    it('should uppercase the server name when looking up the env var', () => {
      process.env.BEARER_TOKEN_MY_SERVER = 'upper-token';
      const config = new ToolingConfiguration({});
      expect(config.getBearerTokenForServer('my_server')).toBe('upper-token');
    });
  });

  describe('combined overrides', () => {
    it('should allow overriding both runtime and tooling settings', () => {
      const config = new ToolingConfiguration({
        clusterCategory: () => ClusterCategory.dev,
        mcpPlatformEndpoint: () => 'https://dev.endpoint'
      });
      expect(config.clusterCategory).toBe(ClusterCategory.dev);
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

describe('resolveTokenScopeForServer', () => {
  const ATG_SCOPE = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default';
  const ATG_APP_ID = 'ea9ffc3e-8a23-4a7d-836d-234d7c7565c1';

  it('should return ATG scope when audience is undefined (V1 server)', () => {
    expect(resolveTokenScopeForServer({ mcpServerName: 'mail', url: 'https://mail.example.com' })).toBe(ATG_SCOPE);
  });

  it('should return ATG scope when audience equals the shared ATG AppId', () => {
    expect(resolveTokenScopeForServer({ mcpServerName: 'mail', url: 'https://mail.example.com', audience: ATG_APP_ID })).toBe(ATG_SCOPE);
  });

  it('should return ATG scope when audience is the ATG api:// URI form', () => {
    const atgAppIdUri = `api://${ATG_APP_ID}`;
    expect(resolveTokenScopeForServer({ mcpServerName: 'mail', url: 'https://mail.example.com', audience: atgAppIdUri })).toBe(ATG_SCOPE);
  });

  it('should return per-server scope when audience is a non-ATG api:// URI (V2 server)', () => {
    const v2AppIdUri = 'api://custom-app-id';
    expect(resolveTokenScopeForServer({ mcpServerName: 'mail', url: 'https://mail.example.com', audience: v2AppIdUri })).toBe(`${v2AppIdUri}/.default`);
  });

  it('should return per-server scope for a V2 GUID audience', () => {
    const v2AppId = 'aaaabbbb-1234-5678-abcd-111122223333';
    expect(resolveTokenScopeForServer({ mcpServerName: 'tools', url: 'https://tools.example.com', audience: v2AppId })).toBe(`${v2AppId}/.default`);
  });

  it('should return per-server scope using explicit scope field when provided (V2)', () => {
    const v2AppId = 'aaaabbbb-1234-5678-abcd-111122223333';
    expect(resolveTokenScopeForServer({
      mcpServerName: 'tools',
      url: 'https://tools.example.com',
      audience: v2AppId,
      scope: 'Tools.ListInvoke.All'
    })).toBe(`${v2AppId}/Tools.ListInvoke.All`);
  });

  describe('custom sharedScope (configurable mcpPlatformAuthenticationScope)', () => {
    const customScope = 'api://custom-atg/.default';
    const customAudience = 'api://custom-atg';

    it('should return customScope for a V1 server with no audience when sharedScope is overridden', () => {
      expect(resolveTokenScopeForServer(
        { mcpServerName: 'mail', url: 'https://mail.example.com' },
        customScope
      )).toBe(customScope);
    });

    it('should return customScope when server audience matches the custom shared audience (api:// form)', () => {
      expect(resolveTokenScopeForServer(
        { mcpServerName: 'mail', url: 'https://mail.example.com', audience: customAudience },
        customScope
      )).toBe(customScope);
    });

    it('should return customScope when server audience matches the custom shared audience (plain form)', () => {
      // audience field may arrive as plain GUID/id even when sharedScope uses api:// prefix
      expect(resolveTokenScopeForServer(
        { mcpServerName: 'mail', url: 'https://mail.example.com', audience: 'custom-atg' },
        customScope
      )).toBe(customScope);
    });

    it('should still treat a V2 server as V2 even when sharedScope is custom', () => {
      const v2Audience = 'aaaabbbb-1234-5678-abcd-111122223333';
      expect(resolveTokenScopeForServer(
        { mcpServerName: 'tools', url: 'https://tools.example.com', audience: v2Audience },
        customScope
      )).toBe(`${v2Audience}/.default`);
    });

    it('should not raise false migration error in legacy prod acquirer when sharedScope is overridden', () => {
      // Regression guard: with the old hardcoded constant, resolveTokenScopeForServer returned
      // 'ea9ffc3e-.../.default' while createLegacyProdTokenAcquirer compared against the custom
      // scope — mismatch → false throw. Now both sides use the same configured value.
      expect(resolveTokenScopeForServer(
        { mcpServerName: 'mail', url: 'https://mail.example.com' },
        customScope
      )).toBe(customScope); // returned scope === sharedScope → no throw
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
