// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { OpenAIObservabilityConfiguration } from './OpenAIObservabilityConfiguration';

export * from './OpenAIObservabilityConfigurationOptions';
export * from './OpenAIObservabilityConfiguration';

/**
 * Shared default provider for OpenAIObservabilityConfiguration.
 */
export const defaultOpenAIObservabilityConfigurationProvider =
  new DefaultConfigurationProvider(() => new OpenAIObservabilityConfiguration());
