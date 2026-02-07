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

  describe('getObservabilityAuthenticationScope (deprecated)', () => {
    it('should always return production observability scope (hardcoded default)', () => {
      // This function is deprecated and now returns a hardcoded default
      // Use ObservabilityConfiguration for env var support
      const scopes = getObservabilityAuthenticationScope();

      expect(scopes).toEqual([PROD_OBSERVABILITY_SCOPE]);
      expect(scopes[0]).toEqual('https://api.powerplatform.com/.default');
    });

    it('should ignore A365_OBSERVABILITY_SCOPES_OVERRIDE env var (deprecated behavior)', () => {
      // The deprecated function no longer reads from env vars
      process.env.A365_OBSERVABILITY_SCOPES_OVERRIDE = 'https://override.example.com/.default';

      const scopes = getObservabilityAuthenticationScope();

      // Should still return the hardcoded default, not the env var value
      expect(scopes).toEqual([PROD_OBSERVABILITY_SCOPE]);
    });
  });

  describe('getClusterCategory', () => {
    it('should return prod when CLUSTER_CATEGORY is not set', () => {
      delete process.env.CLUSTER_CATEGORY;

      expect(getClusterCategory()).toEqual('prod');
    });

    it('should return the configured cluster category from environment variable', () => {
      process.env.CLUSTER_CATEGORY = 'dev';

      expect(getClusterCategory()).toEqual('dev');
    });

    it('should convert cluster category to lowercase', () => {
      process.env.CLUSTER_CATEGORY = 'GOV';

      expect(getClusterCategory()).toEqual('gov');
    });

    it('should return prod when CLUSTER_CATEGORY is empty string', () => {
      process.env.CLUSTER_CATEGORY = '';

      expect(getClusterCategory()).toEqual('prod');
    });

    it.each([
      'local',
      'dev',
      'test',
      'preprod',
      'firstrelease',
      'prod',
      'gov',
      'high',
      'dod',
      'mooncake',
      'ex',
      'rx',
    ])('should return valid cluster category: %s', (category) => {
      process.env.CLUSTER_CATEGORY = category;

      expect(getClusterCategory()).toEqual(category);
    });
  });

  describe('isDevelopmentEnvironment', () => {
    it('should return true when cluster category is local', () => {
      process.env.CLUSTER_CATEGORY = 'local';

      expect(isDevelopmentEnvironment()).toBe(true);
    });

    it('should return true when cluster category is dev', () => {
      process.env.CLUSTER_CATEGORY = 'dev';

      expect(isDevelopmentEnvironment()).toBe(true);
    });

    it('should return false when cluster category is prod', () => {
      process.env.CLUSTER_CATEGORY = 'prod';

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

    it.each([
      { cluster: 'LOCAL', expected: true },
      { cluster: 'DEV', expected: true },
      { cluster: 'Local', expected: true },
      { cluster: 'Dev', expected: true },
    ])('should handle uppercase cluster category: $cluster returns $expected', ({ cluster, expected }) => {
      process.env.CLUSTER_CATEGORY = cluster;

      expect(isDevelopmentEnvironment()).toBe(expected);
    });
  });

  describe('getMcpPlatformAuthenticationScope (deprecated)', () => {
    it('should always return production scope (hardcoded default)', () => {
      // This function is deprecated and now returns a hardcoded default
      // Use ToolingConfiguration for env var support
      delete process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE;

      expect(getMcpPlatformAuthenticationScope()).toEqual(PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE);
      expect(getMcpPlatformAuthenticationScope()).toEqual('ea9ffc3e-8a23-4a7d-836d-234d7c7565c1/.default');
    });

    it('should ignore MCP_PLATFORM_AUTHENTICATION_SCOPE env var (deprecated behavior)', () => {
      // The deprecated function no longer reads from env vars
      process.env.MCP_PLATFORM_AUTHENTICATION_SCOPE = 'custom-scope/.default';

      // Should still return the hardcoded default, not the env var value
      expect(getMcpPlatformAuthenticationScope()).toEqual(PROD_MCP_PLATFORM_AUTHENTICATION_SCOPE);
    });
  });
});
