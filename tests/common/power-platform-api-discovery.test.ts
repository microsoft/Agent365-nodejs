import { describe, it, expect } from '@jest/globals';
import { PowerPlatformApiDiscovery } from '@microsoft/agents-a365-runtime';

const tenantId = 'e3064512-cc6d-4703-be71-a2ecaecaa98a';

describe('getTokenAudience gets the correct token audiences for the environment', () => {
  it('should give the correct token audience in each cluster category', () => {
    expect(new PowerPlatformApiDiscovery('local').getTokenAudience()).toEqual(
      'https://api.powerplatform.localhost'
    );
    // Non-production categories now default to production domain
    expect(new PowerPlatformApiDiscovery('dev').getTokenAudience()).toEqual(
      'https://api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('test').getTokenAudience()).toEqual(
      'https://api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('preprod').getTokenAudience()).toEqual(
      'https://api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('firstrelease').getTokenAudience()).toEqual(
      'https://api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('prod').getTokenAudience()).toEqual('https://api.powerplatform.com');
    expect(new PowerPlatformApiDiscovery('gov').getTokenAudience()).toEqual(
      'https://api.gov.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('high').getTokenAudience()).toEqual(
      'https://api.high.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('dod').getTokenAudience()).toEqual('https://api.appsplatform.us');
    expect(new PowerPlatformApiDiscovery('mooncake').getTokenAudience()).toEqual(
      'https://api.powerplatform.partner.microsoftonline.cn'
    );
    expect(new PowerPlatformApiDiscovery('ex').getTokenAudience()).toEqual(
      'https://api.powerplatform.eaglex.ic.gov'
    );
    expect(new PowerPlatformApiDiscovery('rx').getTokenAudience()).toEqual(
      'https://api.powerplatform.microsoft.scloud'
    );
  });
});

describe('getTokenEndpointHost gets the correct host for the environment', () => {
  it('should give the correct token audience in each cluster category', () => {
    expect(new PowerPlatformApiDiscovery('local').getTokenEndpointHost()).toEqual(
      'api.powerplatform.localhost'
    );
    // Non-production categories now default to production domain
    expect(new PowerPlatformApiDiscovery('dev').getTokenEndpointHost()).toEqual('api.powerplatform.com');
    expect(new PowerPlatformApiDiscovery('test').getTokenEndpointHost()).toEqual(
      'api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('preprod').getTokenEndpointHost()).toEqual(
      'api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('firstrelease').getTokenEndpointHost()).toEqual(
      'api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('prod').getTokenEndpointHost()).toEqual('api.powerplatform.com');
    expect(new PowerPlatformApiDiscovery('gov').getTokenEndpointHost()).toEqual(
      'api.gov.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('high').getTokenEndpointHost()).toEqual(
      'api.high.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('dod').getTokenEndpointHost()).toEqual('api.appsplatform.us');
    expect(new PowerPlatformApiDiscovery('mooncake').getTokenEndpointHost()).toEqual(
      'api.powerplatform.partner.microsoftonline.cn'
    );
    expect(new PowerPlatformApiDiscovery('ex').getTokenEndpointHost()).toEqual(
      'api.powerplatform.eaglex.ic.gov'
    );
    expect(new PowerPlatformApiDiscovery('rx').getTokenEndpointHost()).toEqual(
      'api.powerplatform.microsoft.scloud'
    );
  });
});

describe('getTenantEndpoint generates the expected tenant endpoint', () => {
  it('should give the correct tenant endpoint in each cluster category', () => {
    expect(new PowerPlatformApiDiscovery('local').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.localhost'
    );
    // Non-production categories now default to production domain
    expect(new PowerPlatformApiDiscovery('dev').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('test').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('preprod').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('firstrelease').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('prod').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('gov').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.gov.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('high').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.high.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('dod').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.appsplatform.us'
    );
    expect(new PowerPlatformApiDiscovery('mooncake').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.partner.microsoftonline.cn'
    );
    expect(new PowerPlatformApiDiscovery('ex').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.eaglex.ic.gov'
    );
    expect(new PowerPlatformApiDiscovery('rx').getTenantEndpoint(tenantId)).toEqual(
      'e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.microsoft.scloud'
    );
  });

  it('should reject tenant ids with invalid host name characters', () => {
    expect(() => new PowerPlatformApiDiscovery('local').getTenantEndpoint('invalid?')).toThrow(
      'Cannot generate Power Platform API endpoint because the tenant identifier contains invalid host name characters, only alphanumeric and dash characters are expected: invalid?'
    );
  });

  it('should reject tenant ids of insufficient length', () => {
    expect(() => new PowerPlatformApiDiscovery('local').getTenantEndpoint('a')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 2 characters in length: a'
    );
    expect(() => new PowerPlatformApiDiscovery('local').getTenantEndpoint('a-')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 2 characters in length: a'
    );
    expect(() => new PowerPlatformApiDiscovery('prod').getTenantEndpoint('aa')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 3 characters in length: aa'
    );
    expect(() => new PowerPlatformApiDiscovery('prod').getTenantEndpoint('a-a')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 3 characters in length: aa'
    );
  });
});

describe('getTenantIslandClusterEndpoint generates the expected tenant island cluster endpoint', () => {
  it('should give the correct tenant endpoint in each cluster category', () => {
    expect(new PowerPlatformApiDiscovery('local').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.localhost'
    );
    // Non-production categories now default to production domain
    expect(new PowerPlatformApiDiscovery('dev').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('test').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('preprod').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('firstrelease').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('prod').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa9.8a.tenant.api.powerplatform.com'
    );
    expect(new PowerPlatformApiDiscovery('gov').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.gov.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('high').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.high.powerplatform.microsoft.us'
    );
    expect(new PowerPlatformApiDiscovery('dod').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.appsplatform.us'
    );
    expect(new PowerPlatformApiDiscovery('mooncake').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.partner.microsoftonline.cn'
    );
    expect(new PowerPlatformApiDiscovery('ex').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.eaglex.ic.gov'
    );
    expect(new PowerPlatformApiDiscovery('rx').getTenantIslandClusterEndpoint(tenantId)).toEqual(
      'il-e3064512cc6d4703be71a2ecaecaa98.a.tenant.api.powerplatform.microsoft.scloud'
    );
  });

  it('should reject tenant ids with invalid host name characters', () => {
    expect(() => new PowerPlatformApiDiscovery('local').getTenantIslandClusterEndpoint('invalid?')).toThrow(
      'Cannot generate Power Platform API endpoint because the tenant identifier contains invalid host name characters, only alphanumeric and dash characters are expected: invalid?'
    );
  });

  it('should reject tenant ids of insufficient length', () => {
    expect(() => new PowerPlatformApiDiscovery('local').getTenantIslandClusterEndpoint('a')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 2 characters in length: a'
    );
    expect(() => new PowerPlatformApiDiscovery('local').getTenantIslandClusterEndpoint('a-')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 2 characters in length: a'
    );
    expect(() => new PowerPlatformApiDiscovery('prod').getTenantIslandClusterEndpoint('aa')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 3 characters in length: aa'
    );
    expect(() => new PowerPlatformApiDiscovery('prod').getTenantIslandClusterEndpoint('a-a')).toThrow(
      'Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least 3 characters in length: aa'
    );
  });
});
