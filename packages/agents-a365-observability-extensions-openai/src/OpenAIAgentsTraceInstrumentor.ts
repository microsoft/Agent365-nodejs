// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Instrumentor for OpenAI Agents SDK
 * Extends OpenTelemetry's InstrumentationBase to provide automatic tracing
 */

import { trace } from '@opentelemetry/api';
import { InstrumentationBase, InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation';
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { OpenAIAgentsTraceProcessor } from './OpenAIAgentsTraceProcessor';
import { setTraceProcessors, setTracingDisabled, TracingProcessor } from '@openai/agents';

/**
 * Configuration options for the OpenAI Agents instrument
 */
export interface OpenAIAgentsInstrumentationConfig extends InstrumentationConfig {
  // Override default behavior from parent
  enabled?: boolean;
  tracerName?: string;
  tracerVersion?: string;
}

/**
 * Instrumentor for OpenAI Agents SDK
 * Automatically instruments the @openai/agents package to send traces to OpenTelemetry
 */
export class OpenAIAgentsTraceInstrumentor extends InstrumentationBase<OpenAIAgentsInstrumentationConfig> {
  private processor?: OpenAIAgentsTraceProcessor;
  private _hasBeenEnabled = false;

  constructor(config: OpenAIAgentsInstrumentationConfig = {}) {
    if (!ObservabilityManager.getInstance()) {
      throw new Error(
        'ObservabilityManager is not configured yet. Please configure ObservabilityManager before initializing this instrumentor.'
      );
    }

    const configWithDefaults = {
      enabled: false,
      ...config
    };

    super(
      'agent365-openai-agents-instrumentor',
      '1.0.0',
      configWithDefaults
    );

    // If enabled is true in config, explicitly enable the instrumentation
    if (configWithDefaults.enabled) {
      this.enable();
    }
  }

  /**
   * Initialize the instrumentation modules
   * This defines which npm packages to instrument
   */
  protected init(): InstrumentationModuleDefinition {
    return {
      name: '@openai/agents',
      supportedVersions: ['>=0.1.5'],
      files: [],
    };
  }

  /**
   * Returns the packages this instrumentation depends on
   */
  public instrumentationDependencies(): readonly string[] {
    return ['@openai/agents >= 0.1.5'] as const;
  }

  /**
   * Enable instrumentation
   * Sets up the trace processor and registers it with the OpenAI Agents SDK
   */
  public override enable(): void {
    // Prevent double-enabling
    if (this._hasBeenEnabled) {
      return;
    }
    this._hasBeenEnabled = true;

    // Enable tracing in the OpenAI Agents SDK (it's disabled by default)
    setTracingDisabled(false);

    // Get tracer name and version from config
    const tracerName = this._config.tracerName;
    const tracerVersion = this._config.tracerVersion;

    // Get the configured tracer using OpenTelemetry API
    const agent365Tracer = trace.getTracer(tracerName ?? 'agent365-openai-agents', tracerVersion);

    // Get tracer provider
    trace.getTracerProvider();

    this.processor = new OpenAIAgentsTraceProcessor(agent365Tracer);

    // Register the processor directly using the imported setTraceProcessors function
    // This bypasses the OpenTelemetry instrumentation patching mechanism
    try {
      setTraceProcessors([this.processor as TracingProcessor]);
    } catch (_error) {
      // Silent failure - processor registration failed
    }

    super.enable();
  }

  /**
   * Disable instrumentation
   * Cleans up the trace processor and unregisters it
   */
  public override disable(): void {
    if (this.processor) {
      this.processor.shutdown();
      this.processor = undefined;
    }

    // Reset flag to allow re-enabling
    this._hasBeenEnabled = false;

    // Reset trace processors using direct import
    try {
      setTraceProcessors([]);
    } catch (_error) {
      // Silent failure - processor cleanup failed
    }

    super.disable();
  }

  /**
   * Get the trace processor instance
   */
  public getProcessor(): OpenAIAgentsTraceProcessor | undefined {
    return this.processor;
  }
}
