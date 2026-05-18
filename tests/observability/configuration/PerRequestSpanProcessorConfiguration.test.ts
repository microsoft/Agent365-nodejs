// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  PerRequestSpanProcessorConfiguration,
  defaultPerRequestSpanProcessorConfigurationProvider,
} from '../../../packages/agents-a365-observability/src';
import { RuntimeConfiguration, DefaultConfigurationProvider, ClusterCategory } from '../../../packages/agents-a365-runtime/src';

describe('PerRequestSpanProcessorConfiguration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('inheritance', () => {
    it('should be instanceof RuntimeConfiguration', () => {
      const config = new PerRequestSpanProcessorConfiguration();
      expect(config).toBeInstanceOf(RuntimeConfiguration);
    });

    it('should inherit runtime settings', () => {
      const config = new PerRequestSpanProcessorConfiguration({ clusterCategory: () => ClusterCategory.gov });
      expect(config.clusterCategory).toBe(ClusterCategory.gov);
      expect(config.isDevelopmentEnvironment).toBe(false);
    });
  });

  describe('isPerRequestExportEnabled', () => {
    it('should use override function when provided', () => {
      const config = new PerRequestSpanProcessorConfiguration({
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
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.isPerRequestExportEnabled).toBe(expected);
    });

    it('should return false when env var is not set', () => {
      delete process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT;
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.isPerRequestExportEnabled).toBe(false);
    });

    it('should call override function on each access (dynamic resolution)', () => {
      let callCount = 0;
      const config = new PerRequestSpanProcessorConfiguration({
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

  describe('perRequestMaxTraces', () => {
    it('should use override function when provided', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxTraces: () => 500
      });
      expect(config.perRequestMaxTraces).toBe(500);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '2000';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraces).toBe(2000);
    });

    it('should fall back to default 1000 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_MAX_TRACES;
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = 'invalid';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '-100';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACES = '0';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraces).toBe(1000);
    });

    it('should fall back to default for negative override', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxTraces: () => -50
      });
      expect(config.perRequestMaxTraces).toBe(1000);
    });
  });

  describe('perRequestMaxSpansPerTrace', () => {
    it('should use override function when provided', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxSpansPerTrace: () => 10000
      });
      expect(config.perRequestMaxSpansPerTrace).toBe(10000);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '8000';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(8000);
    });

    it('should fall back to default 5000 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE;
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = 'not-a-number';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '-500';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_MAX_SPANS_PER_TRACE = '0';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });

    it('should fall back to default for negative override', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxSpansPerTrace: () => -100
      });
      expect(config.perRequestMaxSpansPerTrace).toBe(5000);
    });
  });

  describe('perRequestMaxConcurrentExports', () => {
    it('should use override function when provided', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxConcurrentExports: () => 50
      });
      expect(config.perRequestMaxConcurrentExports).toBe(50);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '30';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(30);
    });

    it('should fall back to default 20 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS;
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '-10';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS = '0';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });

    it('should fall back to default for negative override', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxConcurrentExports: () => -5
      });
      expect(config.perRequestMaxConcurrentExports).toBe(20);
    });
  });

  describe('perRequestFlushGraceMs', () => {
    it('should use override function when provided', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestFlushGraceMs: () => 100
      });
      expect(config.perRequestFlushGraceMs).toBe(100);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_FLUSH_GRACE_MS = '500';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestFlushGraceMs).toBe(500);
    });

    it('should fall back to default 250 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_FLUSH_GRACE_MS;
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestFlushGraceMs).toBe(250);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_FLUSH_GRACE_MS = 'invalid';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestFlushGraceMs).toBe(250);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_FLUSH_GRACE_MS = '-50';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestFlushGraceMs).toBe(250);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_FLUSH_GRACE_MS = '0';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestFlushGraceMs).toBe(250);
    });

    it('should fall back to default for negative override', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestFlushGraceMs: () => -10
      });
      expect(config.perRequestFlushGraceMs).toBe(250);
    });
  });

  describe('perRequestMaxTraceAgeMs', () => {
    it('should use override function when provided', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxTraceAgeMs: () => 60000
      });
      expect(config.perRequestMaxTraceAgeMs).toBe(60000);
    });

    it('should fall back to env var when override not provided', () => {
      process.env.A365_PER_REQUEST_MAX_TRACE_AGE_MS = '120000';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraceAgeMs).toBe(120000);
    });

    it('should fall back to default 1800000 when neither override nor env var', () => {
      delete process.env.A365_PER_REQUEST_MAX_TRACE_AGE_MS;
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraceAgeMs).toBe(1800000);
    });

    it('should fall back to default for invalid env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACE_AGE_MS = 'not-a-number';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraceAgeMs).toBe(1800000);
    });

    it('should fall back to default for negative values from env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACE_AGE_MS = '-1000';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraceAgeMs).toBe(1800000);
    });

    it('should fall back to default for zero from env var', () => {
      process.env.A365_PER_REQUEST_MAX_TRACE_AGE_MS = '0';
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config.perRequestMaxTraceAgeMs).toBe(1800000);
    });

    it('should fall back to default for negative override', () => {
      const config = new PerRequestSpanProcessorConfiguration({
        perRequestMaxTraceAgeMs: () => -5000
      });
      expect(config.perRequestMaxTraceAgeMs).toBe(1800000);
    });
  });

  describe('constructor', () => {
    it('should accept no overrides', () => {
      const config = new PerRequestSpanProcessorConfiguration();
      expect(config).toBeInstanceOf(PerRequestSpanProcessorConfiguration);
    });

    it('should accept empty overrides object', () => {
      const config = new PerRequestSpanProcessorConfiguration({});
      expect(config).toBeInstanceOf(PerRequestSpanProcessorConfiguration);
    });

    it('should accept undefined overrides', () => {
      const config = new PerRequestSpanProcessorConfiguration(undefined);
      expect(config).toBeInstanceOf(PerRequestSpanProcessorConfiguration);
    });
  });
});

describe('defaultPerRequestSpanProcessorConfigurationProvider', () => {
  it('should be an instance of DefaultConfigurationProvider', () => {
    expect(defaultPerRequestSpanProcessorConfigurationProvider).toBeInstanceOf(DefaultConfigurationProvider);
  });

  it('should return PerRequestSpanProcessorConfiguration from getConfiguration', () => {
    const config = defaultPerRequestSpanProcessorConfigurationProvider.getConfiguration();
    expect(config).toBeInstanceOf(PerRequestSpanProcessorConfiguration);
  });

  it('should return the same configuration instance on multiple calls', () => {
    const config1 = defaultPerRequestSpanProcessorConfigurationProvider.getConfiguration();
    const config2 = defaultPerRequestSpanProcessorConfigurationProvider.getConfiguration();
    expect(config1).toBe(config2);
  });
});
