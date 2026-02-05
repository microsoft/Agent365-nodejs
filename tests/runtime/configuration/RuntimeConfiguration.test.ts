// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  RuntimeConfiguration,
  DefaultConfigurationProvider,
  defaultRuntimeConfigurationProvider,
  ClusterCategory
} from '../../../packages/agents-a365-runtime/src';

describe('RuntimeConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('clusterCategory', () => {
    it('should use override function when provided', () => {
      const config = new RuntimeConfiguration({ clusterCategory: () => ClusterCategory.gov });
      expect(config.clusterCategory).toBe('gov');
    });

    it('should fall back to env var when override not provided', () => {
      process.env.CLUSTER_CATEGORY = 'dev';
      const config = new RuntimeConfiguration({});
      expect(config.clusterCategory).toBe('dev');
    });

    it('should fall back to default when neither override nor env var', () => {
      delete process.env.CLUSTER_CATEGORY;
      const config = new RuntimeConfiguration({});
      expect(config.clusterCategory).toBe('prod');
    });

    it('should call override function on each access (dynamic resolution)', () => {
      let callCount = 0;
      const config = new RuntimeConfiguration({
        clusterCategory: () => {
          callCount++;
          return ClusterCategory.gov;
        }
      });
      config.clusterCategory;
      config.clusterCategory;
      expect(callCount).toBe(2); // Called twice, not cached
    });

    it('should support dynamic values from external state', () => {
      let currentTenant = 'tenant-a';
      const tenantConfigs: Record<string, ClusterCategory> = {
        'tenant-a': ClusterCategory.prod,
        'tenant-b': ClusterCategory.gov
      };
      const config = new RuntimeConfiguration({
        clusterCategory: () => tenantConfigs[currentTenant]
      });

      expect(config.clusterCategory).toBe('prod');
      currentTenant = 'tenant-b';
      expect(config.clusterCategory).toBe('gov'); // Dynamic!
    });

    it('should lowercase env var value', () => {
      process.env.CLUSTER_CATEGORY = 'DEV';
      const config = new RuntimeConfiguration({});
      expect(config.clusterCategory).toBe('dev');
    });

    it('should return prod for empty string env var', () => {
      process.env.CLUSTER_CATEGORY = '';
      const config = new RuntimeConfiguration({});
      expect(config.clusterCategory).toBe('prod');
    });

    it.each([
      'local', 'dev', 'test', 'preprod', 'firstrelease',
      'prod', 'gov', 'high', 'dod', 'mooncake', 'ex', 'rx'
    ])('should accept valid cluster category: %s', (category) => {
      process.env.CLUSTER_CATEGORY = category;
      const config = new RuntimeConfiguration({});
      expect(config.clusterCategory).toBe(category);
    });

    it.each([
      'invalid', 'foobar', 'production', 'development', 'staging', 'INVALID'
    ])('should fall back to prod for invalid cluster category: %s', (invalidCategory) => {
      process.env.CLUSTER_CATEGORY = invalidCategory;
      const config = new RuntimeConfiguration({});
      expect(config.clusterCategory).toBe('prod');
    });
  });

  describe('isDevelopmentEnvironment', () => {
    it('should return true for local cluster', () => {
      expect(new RuntimeConfiguration({ clusterCategory: () => ClusterCategory.local }).isDevelopmentEnvironment).toBe(true);
    });

    it('should return true for dev cluster', () => {
      expect(new RuntimeConfiguration({ clusterCategory: () => ClusterCategory.dev }).isDevelopmentEnvironment).toBe(true);
    });

    it('should return false for prod cluster', () => {
      expect(new RuntimeConfiguration({ clusterCategory: () => ClusterCategory.prod }).isDevelopmentEnvironment).toBe(false);
    });

    it('should return false for test cluster', () => {
      expect(new RuntimeConfiguration({ clusterCategory: () => ClusterCategory.test }).isDevelopmentEnvironment).toBe(false);
    });

    it('should return false for gov cluster', () => {
      expect(new RuntimeConfiguration({ clusterCategory: () => ClusterCategory.gov }).isDevelopmentEnvironment).toBe(false);
    });

    it('should derive from clusterCategory dynamically', () => {
      let currentCluster: ClusterCategory = ClusterCategory.prod;
      const config = new RuntimeConfiguration({
        clusterCategory: () => currentCluster
      });

      expect(config.isDevelopmentEnvironment).toBe(false);
      currentCluster = ClusterCategory.dev;
      expect(config.isDevelopmentEnvironment).toBe(true);
    });
  });

  describe('isNodeEnvDevelopment', () => {
    it('should use override function when provided', () => {
      const config = new RuntimeConfiguration({
        isNodeEnvDevelopment: () => true
      });
      expect(config.isNodeEnvDevelopment).toBe(true);
    });

    it('should return false override when provided', () => {
      process.env.NODE_ENV = 'development';
      const config = new RuntimeConfiguration({
        isNodeEnvDevelopment: () => false
      });
      // Override takes precedence over NODE_ENV
      expect(config.isNodeEnvDevelopment).toBe(false);
    });

    it('should return true when NODE_ENV is development (lowercase)', () => {
      process.env.NODE_ENV = 'development';
      const config = new RuntimeConfiguration({});
      expect(config.isNodeEnvDevelopment).toBe(true);
    });

    it('should return true when NODE_ENV is Development (mixed case)', () => {
      process.env.NODE_ENV = 'Development';
      const config = new RuntimeConfiguration({});
      expect(config.isNodeEnvDevelopment).toBe(true);
    });

    it('should return true when NODE_ENV is DEVELOPMENT (uppercase)', () => {
      process.env.NODE_ENV = 'DEVELOPMENT';
      const config = new RuntimeConfiguration({});
      expect(config.isNodeEnvDevelopment).toBe(true);
    });

    it('should return false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      const config = new RuntimeConfiguration({});
      expect(config.isNodeEnvDevelopment).toBe(false);
    });

    it('should return false when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      const config = new RuntimeConfiguration({});
      expect(config.isNodeEnvDevelopment).toBe(false);
    });

    it('should return false when NODE_ENV is empty string', () => {
      process.env.NODE_ENV = '';
      const config = new RuntimeConfiguration({});
      expect(config.isNodeEnvDevelopment).toBe(false);
    });

    it('should call override function on each access', () => {
      let callCount = 0;
      const config = new RuntimeConfiguration({
        isNodeEnvDevelopment: () => {
          callCount++;
          return true;
        }
      });
      config.isNodeEnvDevelopment;
      config.isNodeEnvDevelopment;
      expect(callCount).toBe(2);
    });
  });

  describe('constructor', () => {
    it('should accept no overrides', () => {
      delete process.env.CLUSTER_CATEGORY;
      const config = new RuntimeConfiguration();
      expect(config.clusterCategory).toBe('prod');
    });

    it('should accept empty overrides object', () => {
      delete process.env.CLUSTER_CATEGORY;
      const config = new RuntimeConfiguration({});
      expect(config.clusterCategory).toBe('prod');
    });

    it('should accept undefined overrides', () => {
      delete process.env.CLUSTER_CATEGORY;
      const config = new RuntimeConfiguration(undefined);
      expect(config.clusterCategory).toBe('prod');
    });
  });
});

describe('DefaultConfigurationProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return the same configuration instance on multiple calls', () => {
    const provider = new DefaultConfigurationProvider(() => new RuntimeConfiguration());
    const config1 = provider.getConfiguration();
    const config2 = provider.getConfiguration();
    expect(config1).toBe(config2);
  });

  it('should create configuration using the provided factory', () => {
    const provider = new DefaultConfigurationProvider(() =>
      new RuntimeConfiguration({ clusterCategory: () => ClusterCategory.gov })
    );
    expect(provider.getConfiguration().clusterCategory).toBe('gov');
  });
});

describe('defaultRuntimeConfigurationProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should be an instance of DefaultConfigurationProvider', () => {
    expect(defaultRuntimeConfigurationProvider).toBeInstanceOf(DefaultConfigurationProvider);
  });

  it('should return RuntimeConfiguration from getConfiguration', () => {
    const config = defaultRuntimeConfigurationProvider.getConfiguration();
    expect(config).toBeInstanceOf(RuntimeConfiguration);
  });
});

describe('RuntimeConfiguration static utility methods', () => {
  describe('parseEnvBoolean', () => {
    it('should return false for undefined', () => {
      expect(RuntimeConfiguration.parseEnvBoolean(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(RuntimeConfiguration.parseEnvBoolean('')).toBe(false);
    });

    it.each(['true', 'TRUE', 'True', 'TrUe'])('should return true for "%s"', (value) => {
      expect(RuntimeConfiguration.parseEnvBoolean(value)).toBe(true);
    });

    it.each(['1'])('should return true for "%s"', (value) => {
      expect(RuntimeConfiguration.parseEnvBoolean(value)).toBe(true);
    });

    it.each(['yes', 'YES', 'Yes'])('should return true for "%s"', (value) => {
      expect(RuntimeConfiguration.parseEnvBoolean(value)).toBe(true);
    });

    it.each(['on', 'ON', 'On'])('should return true for "%s"', (value) => {
      expect(RuntimeConfiguration.parseEnvBoolean(value)).toBe(true);
    });

    it.each(['false', 'FALSE', '0', 'no', 'off', 'random', 'anything'])('should return false for "%s"', (value) => {
      expect(RuntimeConfiguration.parseEnvBoolean(value)).toBe(false);
    });
  });

  describe('parseEnvInt', () => {
    it('should return fallback for undefined', () => {
      expect(RuntimeConfiguration.parseEnvInt(undefined, 42)).toBe(42);
    });

    it('should return fallback for empty string', () => {
      expect(RuntimeConfiguration.parseEnvInt('', 42)).toBe(42);
    });

    it('should parse valid integer string', () => {
      expect(RuntimeConfiguration.parseEnvInt('123', 0)).toBe(123);
    });

    it('should parse negative integer', () => {
      expect(RuntimeConfiguration.parseEnvInt('-456', 0)).toBe(-456);
    });

    it('should parse zero', () => {
      expect(RuntimeConfiguration.parseEnvInt('0', 42)).toBe(0);
    });

    it('should return fallback for non-numeric string', () => {
      expect(RuntimeConfiguration.parseEnvInt('abc', 42)).toBe(42);
    });

    it('should return fallback for NaN result', () => {
      expect(RuntimeConfiguration.parseEnvInt('not-a-number', 99)).toBe(99);
    });

    it('should truncate decimal values (parseInt behavior)', () => {
      expect(RuntimeConfiguration.parseEnvInt('3.14', 0)).toBe(3);
    });

    it('should parse string with leading zeros', () => {
      expect(RuntimeConfiguration.parseEnvInt('007', 0)).toBe(7);
    });

    it('should return fallback for Infinity', () => {
      expect(RuntimeConfiguration.parseEnvInt('Infinity', 42)).toBe(42);
    });

    it('should handle large integers', () => {
      expect(RuntimeConfiguration.parseEnvInt('1000000', 0)).toBe(1000000);
    });
  });
});
