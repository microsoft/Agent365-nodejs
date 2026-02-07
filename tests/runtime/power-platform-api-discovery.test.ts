// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from '@jest/globals';
import { PowerPlatformApiDiscovery, ClusterCategory } from '@microsoft/agents-a365-runtime';

const testTenantId = 'e3064512-cc6d-4703-be71-a2ecaecaa98a';

// Test data - all cluster configurations in one place
const clusterTestData: Array<{ cluster: ClusterCategory; audience: string; host: string }> = [
  { cluster: ClusterCategory.local, audience: 'https://api.powerplatform.localhost', host: 'api.powerplatform.localhost' },
  { cluster: ClusterCategory.dev, audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: ClusterCategory.test, audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: ClusterCategory.preprod, audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: ClusterCategory.firstrelease, audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: ClusterCategory.prod, audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: ClusterCategory.gov, audience: 'https://api.gov.powerplatform.microsoft.us', host: 'api.gov.powerplatform.microsoft.us' },
  { cluster: ClusterCategory.high, audience: 'https://api.high.powerplatform.microsoft.us', host: 'api.high.powerplatform.microsoft.us' },
  { cluster: ClusterCategory.dod, audience: 'https://api.appsplatform.us', host: 'api.appsplatform.us' },
  { cluster: ClusterCategory.mooncake, audience: 'https://api.powerplatform.partner.microsoftonline.cn', host: 'api.powerplatform.partner.microsoftonline.cn' },
  { cluster: ClusterCategory.ex, audience: 'https://api.powerplatform.eaglex.ic.gov', host: 'api.powerplatform.eaglex.ic.gov' },
  { cluster: ClusterCategory.rx, audience: 'https://api.powerplatform.microsoft.scloud', host: 'api.powerplatform.microsoft.scloud' },
];

const tenantEndpointTestData: Array<{ cluster: ClusterCategory; endpoint: string }> = [
  { cluster: ClusterCategory.local, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.localhost' },
  { cluster: ClusterCategory.dev, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.test, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.preprod, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.firstrelease, endpoint: 'e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.prod, endpoint: 'e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.gov, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.gov.powerplatform.microsoft.us' },
  { cluster: ClusterCategory.high, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.high.powerplatform.microsoft.us' },
  { cluster: ClusterCategory.dod, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.appsplatform.us' },
  { cluster: ClusterCategory.mooncake, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.partner.microsoftonline.cn' },
  { cluster: ClusterCategory.ex, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.eaglex.ic.gov' },
  { cluster: ClusterCategory.rx, endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.microsoft.scloud' },
];

const tenantIslandEndpointTestData: Array<{ cluster: ClusterCategory; endpoint: string }> = [
  { cluster: ClusterCategory.local, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.localhost' },
  { cluster: ClusterCategory.dev, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.test, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.preprod, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.firstrelease, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.prod, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: ClusterCategory.gov, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.gov.powerplatform.microsoft.us' },
  { cluster: ClusterCategory.high, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.high.powerplatform.microsoft.us' },
  { cluster: ClusterCategory.dod, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.appsplatform.us' },
  { cluster: ClusterCategory.mooncake, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.partner.microsoftonline.cn' },
  { cluster: ClusterCategory.ex, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.eaglex.ic.gov' },
  { cluster: ClusterCategory.rx, endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.microsoft.scloud' },
];

describe('PowerPlatformApiDiscovery', () => {
  describe('getTokenAudience', () => {
    it.each(clusterTestData)(
      'should return correct audience for $cluster cluster',
      ({ cluster, audience }) => {
        expect(new PowerPlatformApiDiscovery(cluster).getTokenAudience()).toEqual(audience);
      }
    );
  });

  describe('getTokenEndpointHost', () => {
    it.each(clusterTestData)(
      'should return correct host for $cluster cluster',
      ({ cluster, host }) => {
        expect(new PowerPlatformApiDiscovery(cluster).getTokenEndpointHost()).toEqual(host);
      }
    );
  });

  describe('getTenantEndpoint', () => {
    it.each(tenantEndpointTestData)(
      'should return correct tenant endpoint for $cluster cluster',
      ({ cluster, endpoint }) => {
        expect(new PowerPlatformApiDiscovery(cluster).getTenantEndpoint(testTenantId)).toEqual(endpoint);
      }
    );

    it('should reject tenant ids with invalid host name characters', () => {
      expect(() => new PowerPlatformApiDiscovery(ClusterCategory.local).getTenantEndpoint('invalid?')).toThrow(
        'Cannot generate Power Platform API endpoint because the tenant identifier contains invalid host name characters, only alphanumeric and dash characters are expected: invalid?'
      );
    });

    describe('should reject tenant ids of insufficient length', () => {
      it.each<{ tenantId: string; cluster: ClusterCategory; minLength: number; normalized: string }>([
        { tenantId: 'a', cluster: ClusterCategory.local, minLength: 2, normalized: 'a' },
        { tenantId: 'a-', cluster: ClusterCategory.local, minLength: 2, normalized: 'a' },
        { tenantId: 'aa', cluster: ClusterCategory.prod, minLength: 3, normalized: 'aa' },
        { tenantId: 'a-a', cluster: ClusterCategory.prod, minLength: 3, normalized: 'aa' },
      ])(
        'should throw error for tenantId "$tenantId" in $cluster cluster',
        ({ tenantId, cluster, minLength, normalized }) => {
          expect(() => new PowerPlatformApiDiscovery(cluster).getTenantEndpoint(tenantId)).toThrow(
            `Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least ${minLength} characters in length: ${normalized}`
          );
        }
      );
    });
  });

  describe('getTenantIslandClusterEndpoint', () => {
    it.each(tenantIslandEndpointTestData)(
      'should return correct tenant island endpoint for $cluster cluster',
      ({ cluster, endpoint }) => {
        expect(new PowerPlatformApiDiscovery(cluster).getTenantIslandClusterEndpoint(testTenantId)).toEqual(endpoint);
      }
    );

    it('should reject tenant ids with invalid host name characters', () => {
      expect(() => new PowerPlatformApiDiscovery(ClusterCategory.local).getTenantIslandClusterEndpoint('invalid?')).toThrow(
        'Cannot generate Power Platform API endpoint because the tenant identifier contains invalid host name characters, only alphanumeric and dash characters are expected: invalid?'
      );
    });
  });
});
