// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { PerRequestSpanProcessorConfigurationOptions } from "../configuration/PerRequestSpanProcessorConfigurationOptions";

let overrides: PerRequestSpanProcessorConfigurationOptions | undefined;

// Only for tests / internal usage
export function setPerRequestProcessorInternalOverrides(value?: PerRequestSpanProcessorConfigurationOptions) { 
  overrides = value;
}

export function getPerRequestProcessorInternalOverrides(): PerRequestSpanProcessorConfigurationOptions | undefined {
  return overrides;
}
