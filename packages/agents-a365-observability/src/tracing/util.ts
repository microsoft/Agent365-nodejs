// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import logger from '../utils/logging';
import { OpenTelemetryConstants } from './constants';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';
/**
 * Check if exporter is enabled via environment variables
 */
export const isAgent365ExporterEnabled: () => boolean = (): boolean => {
  const enableA365Exporter = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER]?.toLowerCase();

  return (
    enableA365Exporter === 'true' ||
    enableA365Exporter === '1' ||
    enableA365Exporter === 'yes' ||
    enableA365Exporter === 'on'
  );
};

/**
   * Gets the enable telemetry configuration value
   */
export const isAgent365TelemetryEnabled: () => boolean = (): boolean => {
  const enableObservability = process.env[OpenTelemetryConstants.ENABLE_OBSERVABILITY]?.toLowerCase();
  const enableA365 = process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY]?.toLowerCase();

  return (
    enableObservability === 'true' ||
    enableObservability === '1' ||
    enableA365 === 'true' ||
    enableA365 === '1'
  );
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
