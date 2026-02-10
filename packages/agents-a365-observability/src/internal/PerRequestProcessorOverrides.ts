// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export type PerRequestProcessorSettings = Partial<{
  maxBufferedTraces: number;
  maxSpansPerTrace: number;
  maxConcurrentExports: number;
}>;

export type InternalPerRequestProcessorOverrides = Partial<{
  perRequestExportEnabled: boolean;
  perRequestProcessorSettings: PerRequestProcessorSettings;
}>;

let overrides: InternalPerRequestProcessorOverrides | undefined;

export function getPerRequestProcessorInternalOverrides(): InternalPerRequestProcessorOverrides | undefined {
  return overrides;
}

// Only for tests / internal usage
export function setPerRequestProcessorInternalOverrides(value?: InternalPerRequestProcessorOverrides) {
  if (value?.perRequestProcessorSettings) {
    const setting = value.perRequestProcessorSettings;
    if (typeof setting.maxBufferedTraces === 'number' && setting.maxBufferedTraces < 0) {
      throw new Error(`maxBufferedTraces must be >= 0, got ${setting.maxBufferedTraces}`);
    }
    if (typeof setting.maxSpansPerTrace === 'number' && setting.maxSpansPerTrace < 0) {
      throw new Error(`maxSpansPerTrace must be >= 0, got ${setting.maxSpansPerTrace}`);
    }
    if (typeof setting.maxConcurrentExports === 'number' && setting.maxConcurrentExports < 0) {
      throw new Error(`maxConcurrentExports must be >= 0, got ${setting.maxConcurrentExports}`);
    }
  }
  overrides = value;
}
