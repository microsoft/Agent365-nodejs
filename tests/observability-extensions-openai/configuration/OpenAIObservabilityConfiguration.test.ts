// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  OpenAIObservabilityConfiguration,
  defaultOpenAIObservabilityConfigurationProvider
} from '../../../packages/agents-a365-observability-extensions-openai/src';
import { ObservabilityConfiguration } from '../../../packages/agents-a365-observability/src';
import { RuntimeConfiguration, DefaultConfigurationProvider, ClusterCategory } from '../../../packages/agents-a365-runtime/src';

describe('OpenAIObservabilityConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('inheritance from ObservabilityConfiguration', () => {
    it('should inherit observability settings', () => {
      const config = new OpenAIObservabilityConfiguration({
        isObservabilityExporterEnabled: () => true
      });
      expect(config.isObservabilityExporterEnabled).toBe(true);
    });

    it('should be instanceof ObservabilityConfiguration', () => {
      const config = new OpenAIObservabilityConfiguration();
      expect(config).toBeInstanceOf(ObservabilityConfiguration);
    });

    it('should be instanceof RuntimeConfiguration', () => {
      const config = new OpenAIObservabilityConfiguration();
      expect(config).toBeInstanceOf(RuntimeConfiguration);
    });
  });

  describe('inherited runtime settings', () => {
    it('should inherit clusterCategory from override', () => {
      const config = new OpenAIObservabilityConfiguration({ clusterCategory: () => ClusterCategory.gov });
      expect(config.clusterCategory).toBe(ClusterCategory.gov);
    });

    it('should inherit clusterCategory from env var', () => {
      process.env.CLUSTER_CATEGORY = 'dev';
      const config = new OpenAIObservabilityConfiguration({});
      expect(config.clusterCategory).toBe('dev');
    });

    it('should inherit isDevelopmentEnvironment', () => {
      const config = new OpenAIObservabilityConfiguration({ clusterCategory: () => ClusterCategory.local });
      expect(config.isDevelopmentEnvironment).toBe(true);
    });
  });

  describe('inherited observability settings', () => {
    it('should inherit isObservabilityExporterEnabled from env var', () => {
      process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = 'true';
      const config = new OpenAIObservabilityConfiguration({});
      expect(config.isObservabilityExporterEnabled).toBe(true);
    });

    it('should inherit observabilityAuthenticationScopes from override', () => {
      const config = new OpenAIObservabilityConfiguration({
        observabilityAuthenticationScopes: () => ['custom-scope/.default']
      });
      expect(config.observabilityAuthenticationScopes).toEqual(['custom-scope/.default']);
    });

    it('should inherit useCustomDomainForObservability from override', () => {
      const config = new OpenAIObservabilityConfiguration({
        useCustomDomainForObservability: () => true
      });
      expect(config.useCustomDomainForObservability).toBe(true);
    });

    it('should inherit observabilityDomainOverride from override', () => {
      const config = new OpenAIObservabilityConfiguration({
        observabilityDomainOverride: () => 'https://custom.domain'
      });
      expect(config.observabilityDomainOverride).toBe('https://custom.domain');
    });

    it('should inherit observabilityLogLevel from override', () => {
      const config = new OpenAIObservabilityConfiguration({
        observabilityLogLevel: () => 'debug'
      });
      expect(config.observabilityLogLevel).toBe('debug');
    });

    it('should use default isObservabilityExporterEnabled when not overridden', () => {
      delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
      const config = new OpenAIObservabilityConfiguration({});
      expect(config.isObservabilityExporterEnabled).toBe(false);
    });
  });

  describe('combined overrides', () => {
    it('should allow overriding runtime and observability settings together', () => {
      const config = new OpenAIObservabilityConfiguration({
        clusterCategory: () => ClusterCategory.dev,
        isObservabilityExporterEnabled: () => true,
        observabilityLogLevel: () => 'info'
      });
      expect(config.clusterCategory).toBe(ClusterCategory.dev);
      expect(config.isDevelopmentEnvironment).toBe(true);
      expect(config.isObservabilityExporterEnabled).toBe(true);
      expect(config.observabilityLogLevel).toBe('info');
    });

    it('should support dynamic per-tenant configuration', () => {
      let currentTenant = 'tenant-a';
      const tenantSettings: Record<string, boolean> = {
        'tenant-a': true,
        'tenant-b': false
      };

      const config = new OpenAIObservabilityConfiguration({
        isObservabilityExporterEnabled: () => tenantSettings[currentTenant]
      });

      expect(config.isObservabilityExporterEnabled).toBe(true);
      currentTenant = 'tenant-b';
      expect(config.isObservabilityExporterEnabled).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should accept no overrides', () => {
      const config = new OpenAIObservabilityConfiguration();
      expect(config).toBeInstanceOf(OpenAIObservabilityConfiguration);
    });

    it('should accept empty overrides object', () => {
      const config = new OpenAIObservabilityConfiguration({});
      expect(config).toBeInstanceOf(OpenAIObservabilityConfiguration);
    });

    it('should accept undefined overrides', () => {
      const config = new OpenAIObservabilityConfiguration(undefined);
      expect(config).toBeInstanceOf(OpenAIObservabilityConfiguration);
    });
  });
});

describe('defaultOpenAIObservabilityConfigurationProvider', () => {
  it('should be an instance of DefaultConfigurationProvider', () => {
    expect(defaultOpenAIObservabilityConfigurationProvider).toBeInstanceOf(DefaultConfigurationProvider);
  });

  it('should return OpenAIObservabilityConfiguration from getConfiguration', () => {
    const config = defaultOpenAIObservabilityConfigurationProvider.getConfiguration();
    expect(config).toBeInstanceOf(OpenAIObservabilityConfiguration);
  });

  it('should return the same configuration instance on multiple calls', () => {
    const config1 = defaultOpenAIObservabilityConfigurationProvider.getConfiguration();
    const config2 = defaultOpenAIObservabilityConfigurationProvider.getConfiguration();
    expect(config1).toBe(config2);
  });
});
