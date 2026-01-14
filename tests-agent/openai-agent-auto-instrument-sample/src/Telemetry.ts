// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import {
  ObservabilityManager,
  Builder,
  runWithExportToken,
  getExportToken,
} from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-observability-extensions-openai';

/**
 * Configure observability with per-request token export support.
 * 
 * When ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT=true:
 * - The token resolver automatically reads from OTel Context
 * - Developers don't need to provide an explicit tokenResolver
 * - Just call runWithExportToken(token, () => { ... }) to set the token
 */
export const a365Observability = ObservabilityManager.configure(
  (builder: Builder) =>
    builder
      .withService('OpenAI Agent Instrumentation Sample', '1.0.0')
      // .withConnectionString(process.env.CONNECTION_STRING || '')
);

// Initialize OpenAI Agents instrumentation
export const openAIAgentsTraceInstrumentor = new OpenAIAgentsTraceInstrumentor({
  enabled: true,
  tracerName: 'openai-agent-auto-instrumentation',
  tracerVersion: '1.0.0'
});

// Export token context helpers for per-request export
export { runWithExportToken, getExportToken };
