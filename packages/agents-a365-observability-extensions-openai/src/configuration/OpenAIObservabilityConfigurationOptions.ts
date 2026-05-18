// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ObservabilityConfigurationOptions } from '@microsoft/agents-a365-observability';

/**
 * OpenAI observability configuration options - extends observability options.
 * All overrides are functions called on each property access.
 *
 * Currently no additional settings; this type exists for future extensibility.
 */
export type OpenAIObservabilityConfigurationOptions = ObservabilityConfigurationOptions;
