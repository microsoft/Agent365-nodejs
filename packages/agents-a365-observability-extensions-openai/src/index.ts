// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Wraps the OpenAI Agents SDK tracer to integrate with Agent 365 Observability.
 */

export { OpenAIAgentsTraceInstrumentor, OpenAIAgentsInstrumentationConfig } from './OpenAIAgentsTraceInstrumentor';
export { OpenAIAgentsTraceProcessor } from './OpenAIAgentsTraceProcessor';
export {
  OpenAIObservabilityConfiguration,
  OpenAIObservabilityConfigurationOptions,
  defaultOpenAIObservabilityConfigurationProvider
} from './configuration';
