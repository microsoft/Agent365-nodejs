import { describe, it, expect } from '@jest/globals';
import { PowerPlatformApiDiscovery, ClusterCategory } from '@microsoft/agents-a365-runtime';

const tenantId = 'e3064512-cc6d-4703-be71-a2ecaecaa98a';

// Test data - all cluster configurations in one place
const clusterTestData: Array<{ cluster: ClusterCategory; audience: string; host: string }> = [
  { cluster: 'local', audience: 'https://api.powerplatform.localhost', host: 'api.powerplatform.localhost' },
  { cluster: 'dev', audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: 'test', audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: 'preprod', audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: 'firstrelease', audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: 'prod', audience: 'https://api.powerplatform.com', host: 'api.powerplatform.com' },
  { cluster: 'gov', audience: 'https://api.gov.powerplatform.microsoft.us', host: 'api.gov.powerplatform.microsoft.us' },
  { cluster: 'high', audience: 'https://api.high.powerplatform.microsoft.us', host: 'api.high.powerplatform.microsoft.us' },
  { cluster: 'dod', audience: 'https://api.appsplatform.us', host: 'api.appsplatform.us' },
  { cluster: 'mooncake', audience: 'https://api.powerplatform.partner.microsoftonline.cn', host: 'api.powerplatform.partner.microsoftonline.cn' },
  { cluster: 'ex', audience: 'https://api.powerplatform.eaglex.ic.gov', host: 'api.powerplatform.eaglex.ic.gov' },
  { cluster: 'rx', audience: 'https://api.powerplatform.microsoft.scloud', host: 'api.powerplatform.microsoft.scloud' },
];

const tenantEndpointTestData: Array<{ cluster: ClusterCategory; endpoint: string }> = [
  { cluster: 'local', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.localhost' },
  { cluster: 'dev', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: 'test', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: 'preprod', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: 'firstrelease', endpoint: 'e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: 'prod', endpoint: 'e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: 'gov', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.gov.powerplatform.microsoft.us' },
  { cluster: 'high', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.high.powerplatform.microsoft.us' },
  { cluster: 'dod', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.appsplatform.us' },
  { cluster: 'mooncake', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.partner.microsoftonline.cn' },
  { cluster: 'ex', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.eaglex.ic.gov' },
  { cluster: 'rx', endpoint: 'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.microsoft.scloud' },
];

const tenantIslandEndpointTestData: Array<{ cluster: ClusterCategory; endpoint: string }> = [
  { cluster: 'local', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.localhost' },
  { cluster: 'dev', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: 'test', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: 'preprod', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com' },
  { cluster: 'firstrelease', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: 'prod', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com' },
  { cluster: 'gov', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.gov.powerplatform.microsoft.us' },
  { cluster: 'high', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.high.powerplatform.microsoft.us' },
  { cluster: 'dod', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.appsplatform.us' },
  { cluster: 'mooncake', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.partner.microsoftonline.cn' },
  { cluster: 'ex', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.eaglex.ic.gov' },
  { cluster: 'rx', endpoint: 'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.microsoft.scloud' },
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
        expect(new PowerPlatformApiDiscovery(cluster).getTenantEndpoint(tenantId)).toEqual(endpoint);
      }
    );

    it('should reject tenant ids with invalid host name characters', () => {
      expect(() => new PowerPlatformApiDiscovery('local').getTenantEndpoint('invalid?')).toThrow(
        'Cannot generate Power Platform API endpoint because the tenant identifier contains invalid host name characters, only alphanumeric and dash characters are expected: invalid?'
      );
    });

    describe('should reject tenant ids of insufficient length', () => {
      it.each<{ tenantId: string; cluster: ClusterCategory; minLength: number; normalized: string }>([
        { tenantId: 'a', cluster: 'local', minLength: 2, normalized: 'a' },
        { tenantId: 'a-', cluster: 'local', minLength: 2, normalized: 'a' },
        { tenantId: 'aa', cluster: 'prod', minLength: 3, normalized: 'aa' },
        { tenantId: 'a-a', cluster: 'prod', minLength: 3, normalized: 'aa' },
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
        expect(new PowerPlatformApiDiscovery(cluster).getTenantIslandClusterEndpoint(tenantId)).toEqual(endpoint);
      }
    );

    it('should reject tenant ids with invalid host name characters', () => {
      expect(() => new PowerPlatformApiDiscovery('local').getTenantIslandClusterEndpoint('invalid?')).toThrow(
        'Cannot generate Power Platform API endpoint because the tenant identifier contains invalid host name characters, only alphanumeric and dash characters are expected: invalid?'
      );
    });

    describe('should reject tenant ids of insufficient length', () => {
      it.each<{ tenantId: string; cluster: ClusterCategory; minLength: number; normalized: string }>([
        { tenantId: 'a', cluster: 'local', minLength: 2, normalized: 'a' },
        { tenantId: 'a-', cluster: 'local', minLength: 2, normalized: 'a' },
        { tenantId: 'aa', cluster: 'prod', minLength: 3, normalized: 'aa' },
        { tenantId: 'a-a', cluster: 'prod', minLength: 3, normalized: 'aa' },
      ])(
        'should throw error for tenantId "$tenantId" in $cluster cluster',
        ({ tenantId, cluster, minLength, normalized }) => {
          expect(() => new PowerPlatformApiDiscovery(cluster).getTenantIslandClusterEndpoint(tenantId)).toThrow(
            `Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least ${minLength} characters in length: ${normalized}`
          );
        }
      );
    });
  });
});
