// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  ObservabilityConfiguration,
  defaultObservabilityConfigurationProvider
} from '../../../packages/agents-a365-observability/src';
import { RuntimeConfiguration, DefaultConfigurationProvider, ClusterCategory } from '../../../packages/agents-a365-runtime/src';

describe('ObservabilityConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('inheritance from RuntimeConfiguration', () => {
    it('should inherit runtime settings', () => {
      const config = new ObservabilityConfiguration({ clusterCategory: () => ClusterCategory.gov });
      expect(config.clusterCategory).toBe(ClusterCategory.gov);
      expect(config.isDevelopmentEnvironment).toBe(false);
    });

    it('should be instanceof RuntimeConfiguration', () => {
      const config = new ObservabilityConfiguration();
      expect(config).toBeInstanceOf(RuntimeConfiguration);
    });
  });

  describe('observabilityAuthenticationScopes', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        observabilityAuthenticationScopes: () => ['scope1/.default', 'scope2/.default']
      });
      expect(config.observabilityAuthenticationScopes).toEqual(['scope1/.default', 'scope2/.default']);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = 'scope-a/.default scope-b/.default';
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityAuthenticationScopes).toEqual(['scope-a/.default', 'scope-b/.default']);
    });

    it('should fall back to default when neither override nor env var', () => {
      delete process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityAuthenticationScopes).toEqual(['https://api.powerplatform.com/.default']);
    });

    it('should fall back to default when env var is empty string', () => {
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = '';
      const config = new ObservabilityConfiguration();
      expect(config.observabilityAuthenticationScopes).toEqual(['https://api.powerplatform.com/.default']);
    });

    it('should fall back to default when env var is whitespace only', () => {
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = '   ';
      const config = new ObservabilityConfiguration();
      expect(config.observabilityAuthenticationScopes).toEqual(['https://api.powerplatform.com/.default']);
    });

    it('should return readonly array', () => {
      const config = new ObservabilityConfiguration({});
      const scopes = config.observabilityAuthenticationScopes;
      expect(Array.isArray(scopes)).toBe(true);
    });
  });

  describe('isObservabilityExporterEnabled', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        isObservabilityExporterEnabled: () => true
      });
      expect(config.isObservabilityExporterEnabled).toBe(true);
    });

    it.each([
      ['true', true],
      ['TRUE', true],
      ['1', true],
      ['yes', true],
      ['on', true],
      ['false', false],
      ['0', false],
      ['no', false],
      ['', false]
    ])('should return %s when env var is "%s"', (envValue, expected) => {
      process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = envValue;
      const config = new ObservabilityConfiguration({});
      expect(config.isObservabilityExporterEnabled).toBe(expected);
    });

    it('should return false when env var is not set', () => {
      delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
      const config = new ObservabilityConfiguration({});
      expect(config.isObservabilityExporterEnabled).toBe(false);
    });

    it('should call override function on each access (dynamic resolution)', () => {
      let callCount = 0;
      const config = new ObservabilityConfiguration({
        isObservabilityExporterEnabled: () => {
          callCount++;
          return true;
        }
      });
      void config.isObservabilityExporterEnabled;
      void config.isObservabilityExporterEnabled;
      expect(callCount).toBe(2);
    });
  });

  describe('isPerRequestExportEnabled', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        isPerRequestExportEnabled: () => true
      });
      expect(config.isPerRequestExportEnabled).toBe(true);
    });

    it.each([
      ['true', true],
      ['1', true],
      ['yes', true],
      ['on', true],
      ['false', false],
      ['0', false],
      ['', false]
    ])('should return %s when env var is "%s"', (envValue, expected) => {
      process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT = envValue;
      const config = new ObservabilityConfiguration({});
      expect(config.isPerRequestExportEnabled).toBe(expected);
    });

    it('should return false when env var is not set', () => {
      delete process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT;
      const config = new ObservabilityConfiguration({});
      expect(config.isPerRequestExportEnabled).toBe(false);
    });

    it('should call override function on each access (dynamic resolution)', () => {
      let callCount = 0;
      const config = new ObservabilityConfiguration({
        isPerRequestExportEnabled: () => {
          callCount++;
          return true;
        }
      });
      void config.isPerRequestExportEnabled;
      void config.isPerRequestExportEnabled;
      expect(callCount).toBe(2);
    });
  });

  describe('useCustomDomainForObservability', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        useCustomDomainForObservability: () => true
      });
      expect(config.useCustomDomainForObservability).toBe(true);
    });

    it.each([
      ['true', true],
      ['1', true],
      ['yes', true],
      ['on', true],
      ['false', false],
      ['0', false],
      ['', false]
    ])('should return %s when env var is "%s"', (envValue, expected) => {
      process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN = envValue;
      const config = new ObservabilityConfiguration({});
      expect(config.useCustomDomainForObservability).toBe(expected);
    });

    it('should return false when env var is not set', () => {
      delete process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN;
      const config = new ObservabilityConfiguration({});
      expect(config.useCustomDomainForObservability).toBe(false);
    });

    it('should call override function on each access (dynamic resolution)', () => {
      let callCount = 0;
      const config = new ObservabilityConfiguration({
        useCustomDomainForObservability: () => {
          callCount++;
          return true;
        }
      });
      void config.useCustomDomainForObservability;
      void config.useCustomDomainForObservability;
      expect(callCount).toBe(2);
    });
  });

  describe('observabilityDomainOverride', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        observabilityDomainOverride: () => 'https://custom.domain'
      });
      expect(config.observabilityDomainOverride).toBe('https://custom.domain');
    });

    it('should return trimmed value from env var', () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = '  https://env.domain  ';
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityDomainOverride).toBe('https://env.domain');
    });

    it('should remove trailing slashes', () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = 'https://env.domain///';
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityDomainOverride).toBe('https://env.domain');
    });

    it('should return null when env var is not set', () => {
      delete process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE;
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityDomainOverride).toBeNull();
    });

    it('should return null when env var is whitespace', () => {
      process.env.A365_OBSERVABILITY_DOMAIN_OVERRIDE = '   ';
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityDomainOverride).toBeNull();
    });
  });

  describe('observabilityLogLevel', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        observabilityLogLevel: () => 'info|warn'
      });
      expect(config.observabilityLogLevel).toBe('info|warn');
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_OBSERVABILITY_LOG_LEVEL = 'error';
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityLogLevel).toBe('error');
    });

    it('should fall back to none when neither override nor env var', () => {
      delete process.env.A365_OBSERVABILITY_LOG_LEVEL;
      const config = new ObservabilityConfiguration({});
      expect(config.observabilityLogLevel).toBe('none');
    });
  });

  describe('perRequestMaxTraces', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        perRequestMaxTraces: () => 500
      });
      expect(config.perRequestMaxTraces).toBe(500);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '2000';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxTraces).toBe(2000);
    });

    it('should fall back to default 1000 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_MAX_TRACES;
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = 'invalid';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '-100';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '0';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for negative override', () => {
      const config = new ObservabilityConfiguration({
        perRequestMaxTraces: () => -50
      });
      expect(config.perRequestMaxTraces).toBe(1000);
    });
  });

  describe('perRequestMaxSpansPerTrace', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        perRequestMaxSpansPerTrace: () => 10000
      });
      expect(config.perRequestMaxSpansPerTrace).toBe(10000);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '8000';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(8000);
    });

    it('should fall back to default 5000 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE;
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = 'not-a-number';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '-500';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '0';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for negative override', () => {
      const config = new ObservabilityConfiguration({
        perRequestMaxSpansPerTrace: () => -100
      });
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });
  });

  describe('perRequestMaxConcurrentExports', () => {
    it('should use override function when provided', () => {
      const config = new ObservabilityConfiguration({
        perRequestMaxConcurrentExports: () => 50
      });
      expect(config.perRequestMaxConcurrentExports).toBe(50);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '30';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(30);
    });

    it('should fall back to default 20 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS;
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '-10';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '0';
      const config = new ObservabilityConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for negative override', () => {
      const config = new ObservabilityConfiguration({
        perRequestMaxConcurrentExports: () => -5
      });
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });
  });
});

describe('defaultObservabilityConfigurationProvider', () => {
  it('should be an instance of DefaultConfigurationProvider', () => {
    expect(defaultObservabilityConfigurationProvider).toBeInstanceOf(DefaultConfigurationProvider);
  });

  it('should return ObservabilityConfiguration from getConfiguration', () => {
    const config = defaultObservabilityConfigurationProvider.getConfiguration();
    expect(config).toBeInstanceOf(ObservabilityConfiguration);
  });

  it('should return the same configuration instance on multiple calls', () => {
    const config1 = defaultObservabilityConfigurationProvider.getConfiguration();
    const config2 = defaultObservabilityConfigurationProvider.getConfiguration();
    expect(config1).toBe(config2);
  });
});
