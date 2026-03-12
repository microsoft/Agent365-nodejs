// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ObservabilityConfiguration, defaultObservabilityConfigurationProvider } from '../configuration';

/**
 * Check if exporter is enabled via environment variables.
 *
 * NOTE: Exporter-specific helpers have been moved to
 * tracing/exporter/utils.ts. This file remains only for any
 * non-exporter tracing utilities that may be added in the future.
 *
 * @param configProvider Optional configuration provider. Defaults to defaultObservabilityConfigurationProvider if not specified.
 */
export const isAgent365ExporterEnabled = (
  configProvider?: IConfigurationProvider<ObservabilityConfiguration>
): boolean => {
  const provider = configProvider ?? defaultObservabilityConfigurationProvider;
  return provider.getConfiguration().isObservabilityExporterEnabled;
};

/**
 * Maximum length for span attribute values.
 * Values exceeding this limit will be truncated with a suffix.
 */
export const MAX_ATTRIBUTE_LENGTH = 8_192;

const TRUNCATION_SUFFIX = '...[truncated]';

/**
 * Truncate a string value to {@link MAX_ATTRIBUTE_LENGTH} characters.
 * If the value exceeds the limit, it is trimmed and a truncation suffix is appended,
 * with the total length capped at exactly {@link MAX_ATTRIBUTE_LENGTH}.
 * @param value The string to truncate
 * @returns The original string if within limits, otherwise the truncated string
 */
export function truncateValue(value: string): string {
  if (value.length > MAX_ATTRIBUTE_LENGTH) {
    return value.substring(0, MAX_ATTRIBUTE_LENGTH - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
  }
  return value;
}
