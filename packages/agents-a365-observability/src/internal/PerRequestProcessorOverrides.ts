// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export type perRequestProcessorSettings = Partial<{
  maxBufferedTraces: number;
  maxSpansPerTrace: number;
  maxConcurrentExports: number;
  maxBatchSize: number;
}>;

export type InternalPerRequestProcessorOverrides = Partial<{
  perRequestExportEnabled: boolean;
  perRequestProcessorSettings: perRequestProcessorSettings;
}>;

let overrides: InternalPerRequestProcessorOverrides | undefined;

export function getPerRequestProcessorInternalOverrides(): InternalPerRequestProcessorOverrides | undefined {
  return overrides;
}

// Only for tests / internal usage
export function setPerRequestProcessorInternalOverrides(next?: InternalPerRequestProcessorOverrides) {
  overrides = next;
}
