// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ClaudeToolingConfiguration } from './ClaudeToolingConfiguration';

export * from './ClaudeToolingConfigurationOptions';
export * from './ClaudeToolingConfiguration';

/**
 * Shared default provider for ClaudeToolingConfiguration.
 */
export const defaultClaudeToolingConfigurationProvider =
  new DefaultConfigurationProvider(() => new ClaudeToolingConfiguration());
