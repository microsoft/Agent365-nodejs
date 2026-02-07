/**
 * Cluster categories for Power Platform API discovery.
 * String enum provides both compile-time type safety and runtime validation.
 */
export enum ClusterCategory {
  local = 'local',
  dev = 'dev',
  test = 'test',
  preprod = 'preprod',
  firstrelease = 'firstrelease',
  prod = 'prod',
  gov = 'gov',
  high = 'high',
  dod = 'dod',
  mooncake = 'mooncake',
  ex = 'ex',
  rx = 'rx',
}

export class PowerPlatformApiDiscovery {
  readonly clusterCategory: ClusterCategory;

  constructor(clusterCategory: ClusterCategory) {
    this.clusterCategory = clusterCategory;
  }

  public getTokenAudience(): string {
    return `https://${this._getEnvironmentApiHostNameSuffix()}`;
  }

  public getTokenEndpointHost(): string {
    return this._getEnvironmentApiHostNameSuffix();
  }

  public getTenantEndpoint(tenantId: string): string {
    return this._generatePowerPlatformApiDomain(tenantId);
  }

  public getTenantIslandClusterEndpoint(tenantId: string): string {
    return this._generatePowerPlatformApiDomain(tenantId, 'il-');
  }

  private _generatePowerPlatformApiDomain(
    hostNameIdentifier: string,
    hostNamePrefix: string = ''
  ): string {
    if (!/^[a-zA-Z0-9-]+$/.test(hostNameIdentifier)) {
      throw new Error(
        `Cannot generate Power Platform API endpoint because the tenant identifier contains invalid host name characters, only alphanumeric and dash characters are expected: ${hostNameIdentifier}`
      );
    }

    const hostNameInfix = 'tenant';
    const hexNameSuffixLength = this._getHexApiSuffixLength();
    const hexName = hostNameIdentifier.toLowerCase().replace(/-/g, '');

    if (hexNameSuffixLength >= hexName.length) {
      throw new Error(
        `Cannot generate Power Platform API endpoint because the normalized tenant identifier must be at least ${
          hexNameSuffixLength + 1
        } characters in length: ${hexName}`
      );
    }

    const hexNameSuffix = hexName.substring(
      hexName.length - hexNameSuffixLength
    );
    const hexNamePrefix = hexName.substring(
      0,
      hexName.length - hexNameSuffixLength
    );
    const hostNameSuffix = this._getEnvironmentApiHostNameSuffix();

    return `${hostNamePrefix}${hexNamePrefix}.${hexNameSuffix}.${hostNameInfix}.${hostNameSuffix}`;
  }

  private _getHexApiSuffixLength(): number {
    switch (this.clusterCategory) {
    case ClusterCategory.firstrelease:
    case ClusterCategory.prod:
      return 2;
    default:
      return 1;
    }
  }

  private _getEnvironmentApiHostNameSuffix(): string {
    const apiHostNameSuffixMap: Readonly<Record<ClusterCategory, string>> = {
      local: 'api.powerplatform.localhost',
      dev: 'api.powerplatform.com', //default to prod
      test: 'api.powerplatform.com', //default to prod
      preprod: 'api.powerplatform.com', //default to prod
      firstrelease: 'api.powerplatform.com',
      prod: 'api.powerplatform.com',
      gov: 'api.gov.powerplatform.microsoft.us',
      high: 'api.high.powerplatform.microsoft.us',
      dod: 'api.appsplatform.us',
      mooncake: 'api.powerplatform.partner.microsoftonline.cn',
      ex: 'api.powerplatform.eaglex.ic.gov',
      rx: 'api.powerplatform.microsoft.scloud',
    };
    const suffix = apiHostNameSuffixMap[this.clusterCategory];
    if (!suffix) {
      throw new Error(
        `Invalid ClusterCategory value: ${this.clusterCategory}`
      );
    }
    return suffix;
  }
}
