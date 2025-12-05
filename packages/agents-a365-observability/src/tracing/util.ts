// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { OpenTelemetryConstants } from './constants';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';
/**
 * Check if exporter is enabled via environment variables
 * Enabled by default, can be disabled by setting to 'false', '0', 'no', or 'off'
 */
export const isAgent365ExporterEnabled: () => boolean = (): boolean => {
  const enableA365Exporter = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER]?.toLowerCase();

  // If not set, default to enabled (true)
  if (!enableA365Exporter) {
    return true;
  }

  // Only return false if explicitly disabled
  return !(
    enableA365Exporter === 'false' ||
    enableA365Exporter === '0' ||
    enableA365Exporter === 'no' ||
    enableA365Exporter === 'off'
  );
};

/**
   * Gets the enable telemetry configuration value
   * Enabled by default, can be disabled by setting to 'false', '0', 'no', or 'off'
   */
export const isAgent365TelemetryEnabled: () => boolean = (): boolean => {
  const enableObservability = process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY]?.toLowerCase();
  const enableA365 = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY]?.toLowerCase();

  // If neither is set, default to enabled (true)
  if (!enableObservability && !enableA365) {
    return true;
  }

  // Check if explicitly disabled
  const isObservabilityDisabled = 
    enableObservability === 'false' ||
    enableObservability === '0' ||
    enableObservability === 'no' ||
    enableObservability === 'off';

  const isA365Disabled = 
    enableA365 === 'false' ||
    enableA365 === '0' ||
    enableA365 === 'no' ||
    enableA365 === 'off';

  // If either is explicitly set and not disabled, return true
  // If both are explicitly set, both must not be disabled
  if (enableObservability && enableA365) {
    return !isObservabilityDisabled && !isA365Disabled;
  } else if (enableObservability) {
    return !isObservabilityDisabled;
  } else if (enableA365) {
    return !isA365Disabled;
  }

  return true;
};

/**
 * Single toggle to use custom domain for observability export.
 * When true exporter will send traces to custom Agent365 service endpoint
 * and include x-ms-tenant-id in headers.
 */
export const useCustomDomainForObservability = (): boolean => {
  const value = process.env.A365_OBSERVABILITY_USE_CUSTOM_DOMAIN?.toLowerCase();
  return (
    value === 'true' ||
    value === '1' ||
    value === 'yes' ||
    value === 'on'
  );
};

/**
 * Resolve the Agent365 service endpoint base URI for a given cluster category.
 */
export function resolveAgent365Endpoint(clusterCategory: ClusterCategory): string {
  switch (clusterCategory) {
  case 'prod':
  default:
    return 'https://agent365.svc.cloud.microsoft';
  }
}
