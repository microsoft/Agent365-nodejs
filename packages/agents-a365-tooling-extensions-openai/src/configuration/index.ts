// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { OpenAIToolingConfiguration } from './OpenAIToolingConfiguration';

export * from './OpenAIToolingConfigurationOptions';
export * from './OpenAIToolingConfiguration';

/**
 * Shared default provider for OpenAIToolingConfiguration.
 */
export const defaultOpenAIToolingConfigurationProvider =
  new DefaultConfigurationProvider(() => new OpenAIToolingConfiguration());
