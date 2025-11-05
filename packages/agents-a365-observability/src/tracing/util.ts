import { OpenTelemetryConstants } from './constants';


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