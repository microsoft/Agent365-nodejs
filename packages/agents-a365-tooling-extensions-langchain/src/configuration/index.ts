// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { LangChainToolingConfiguration } from './LangChainToolingConfiguration';

export * from './LangChainToolingConfigurationOptions';
export * from './LangChainToolingConfiguration';

/**
 * Shared default provider for LangChainToolingConfiguration.
 */
export const defaultLangChainToolingConfigurationProvider =
  new DefaultConfigurationProvider(() => new LangChainToolingConfiguration());
