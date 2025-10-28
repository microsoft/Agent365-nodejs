import {
  ObservabilityManager,
  Builder,
} from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-instrument-extensions-openai';

// Configure observability
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
