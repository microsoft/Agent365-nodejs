// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ObservabilityConfiguration } from './ObservabilityConfiguration';

export * from './ObservabilityConfigurationOptions';
export * from './ObservabilityConfiguration';

/**
 * Shared default provider for ObservabilityConfiguration.
 */
export const defaultObservabilityConfigurationProvider =
  new DefaultConfigurationProvider(() => new ObservabilityConfiguration());
