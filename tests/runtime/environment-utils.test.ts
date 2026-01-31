// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  getObservabilityAuthenticationScope,
  getClusterCategory,
  isDevelopmentEnvironment,
  getMcpPlatformAuthenticationScope,
  PROD_OBSERVABILITY_SCOPE,
  PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE,
} from '@microsoft/agents-a365-runtime';

describe('environment-utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getObservabilityAuthenticationScope', () => {
    it('should return production observability scope when override is not set', () => {
      delete process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
      delete process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE;

      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual([PROD_OBSERVABILITY_SCOPE]);
      expect(scopes[0]).toEqual('https://api.powerplatform.com/.default');
    });

    it('should return overridden observability scope when A365_OBSERVABILITY_SCOPES_OVERRIDE is set', () => {
      delete process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE;
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = 'https://override.example.com/.default';

      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual(['https://override.example.com/.default']);
    });

    it('should support multiple scopes separated by whitespace', () => {
      delete process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE;
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = 'scope-one/.default scope-two/.default';

      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual(['scope-one/.default', 'scope-two/.default']);
    });

    it('should fall back to production scope when override is empty or whitespace', () => {
      delete process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE;
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = '   ';

      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual([PROD_OBSERVABILITY_SCOPE]);
    });

    it('should return overridden observability scope when A365_OBSERVABILITY_SCOPE_OVERRIDE is set (singular form for .NET SDK compatibility)', () => {
      delete process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
      process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE = 'https://override.singular.com/.default';

      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual(['https://override.singular.com/.default']);
    });

    it('should prioritize A365_OBSERVABILITY_SCOPE_OVERRIDE (singular) over A365_OBSERVABILITY_SCOPES_OVERRIDE (plural) when both are set', () => {
      process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE = 'https://singular.example.com/.default';
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = 'https://plural.example.com/.default';

      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual(['https://singular.example.com/.default']);
    });

    it('should fall back to production scope when singular override is empty or whitespace', () => {
      delete process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE;
      process.env.A365_OBSERVABILITY_SCOPE_OVERRIDE = '   ';

      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual([PROD_OBSERVABILITY_SCOPE]);
    });
  });

  describe('getClusterCategory', () => {
    it('should return prod when CLUSTER_CATEGORY is not set', () => {
      delete process.env.CLUSTER_CATEGORY;

      expect(getClusterCategory()).toEqual('prod');
    });

    it('should return lowercase cluster category from environment', () => {
      process.env.CLUSTER_CATEGORY = 'DEV';

      expect(getClusterCategory()).toEqual('dev');
    });

    it.each([
      { input: 'local', expected: 'local' },
      { input: 'dev', expected: 'dev' },
      { input: 'test', expected: 'test' },
      { input: 'PROD', expected: 'prod' },
      { input: 'Gov', expected: 'gov' },
    ])('should return $expected for input $input', ({ input, expected }) => {
      process.env.CLUSTER_CATEGORY = input;

      expect(getClusterCategory()).toEqual(expected);
    });
  });

  describe('isDevelopmentEnvironment', () => {
    it('should return true for local cluster', () => {
      process.env.CLUSTER_CATEGORY = 'local';

      expect(isDevelopmentEnvironment()).toBe(true);
    });

    it('should return true for dev cluster', () => {
      process.env.CLUSTER_CATEGORY = 'dev';

      expect(isDevelopmentEnvironment()).toBe(true);
    });

    it('should return false for prod cluster', () => {
      process.env.CLUSTER_CATEGORY = 'prod';

      expect(isDevelopmentEnvironment()).toBe(false);
    });

    it('should return false for test cluster', () => {
      process.env.CLUSTER_CATEGORY = 'test';

      expect(isDevelopmentEnvironment()).toBe(false);
    });

    it('should return false when no cluster category set', () => {
      delete process.env.CLUSTER_CATEGORY;

      expect(isDevelopmentEnvironment()).toBe(false);
    });

    it.each([
      { cluster: 'local', expected: true },
      { cluster: 'dev', expected: true },
      { cluster: 'test', expected: false },
      { cluster: 'preprod', expected: false },
      { cluster: 'prod', expected: false },
      { cluster: 'gov', expected: false },
    ])('should return $expected for $cluster cluster', ({ cluster, expected }) => {
      process.env.CLUSTER_CATEGORY = cluster;

      expect(isDevelopmentEnvironment()).toBe(expected);
    });
  });

  describe('getMcpPlatformAuthenticationScope', () => {
    it('should return production scope when environment variable is not set', () => {
      delete process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE;

      expect(getMcpPlatformAuthenticationScope()).toEqual(PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE);
      expect(getMcpPlatformAuthenticationScope()).toEqual('ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default');
    });

    it('should return custom scope from environment variable', () => {
      process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE = 'custom-scope/.default';

      expect(getMcpPlatformAuthenticationScope()).toEqual('custom-scope/.default');
    });

    it('should return empty string if environment variable is empty', () => {
      process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE = '';

      expect(getMcpPlatformAuthenticationScope()).toEqual(PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE);
    });
  });
});
