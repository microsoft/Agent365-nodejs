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
 * Ensures the value is always a JSON-parseable string.
 * - Objects are serialized via JSON.stringify.
 * - Strings that are already valid JSON objects/arrays are passed through.
 * - All other strings (including bare JSON primitives) are wrapped: `{ [key]: value }`.
 * @param value The value to serialize.
 * @param key The key to use when wrapping a plain string.
 */
export function safeSerializeToJson(value: Record<string, unknown> | string, key: string): string {
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ error: 'serialization failed' });
    }
  }
  // String: check if it's already a valid JSON object/array, otherwise wrap it
  const str = value as string;
  try {
    const parsed = JSON.parse(str);
    // Only pass through objects/arrays; bare primitives (numbers, booleans, etc.) get wrapped
    if (parsed !== null && typeof parsed === 'object') {
      return str;
    }
  } catch {
    // not valid JSON — fall through to wrap
  }
  return JSON.stringify({ [key]: str });
}
