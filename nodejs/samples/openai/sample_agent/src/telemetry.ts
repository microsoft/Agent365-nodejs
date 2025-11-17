// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  ObservabilityManager,
  Builder,
} from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-observability-extensions-openai';

/**
 * A365Observability instance for managing telemetry and observability.
 * This provides comprehensive tracing, caching, and monitoring capabilities
 * for the agent application.
 */
export const a365Observability = ObservabilityManager.configure(
  (builder: Builder) =>
    builder.withService('OpenAI Sample Agent', '1.0.0')
);

/**
 * OpenAI Agents Trace Instrumentor for auto-instrumentation of OpenAI SDK calls.
 * This enables automatic tracing of OpenAI API interactions, providing insights
 * into model requests, responses, and performance metrics.
 */
export const openAIAgentsTraceInstrumentor = new OpenAIAgentsTraceInstrumentor({
  enabled: true,
  tracerName: 'openai-sample-agent',
  tracerVersion: '1.0.0',
});
