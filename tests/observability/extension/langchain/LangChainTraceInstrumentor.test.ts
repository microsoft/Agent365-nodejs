// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { trace } from '@opentelemetry/api';
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { LangChainTraceInstrumentor } from '@microsoft/agents-a365-observability-extensions-langchain';

// Configure ObservabilityManager for testing (real configuration, in-memory)
ObservabilityManager.start({
  serviceName: 'LangChain Test Service',
  serviceVersion: '1.0.0'
});

describe('LangChainTraceInstrumentor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LangChainTraceInstrumentor.resetInstance();
  });

  it('constructs when ObservabilityManager is configured', () => {
    expect(() => {
      // When ObservabilityManager is configured, constructor should not throw
      new LangChainTraceInstrumentor();
    }).not.toThrow();
  });

  it('merges config with defaults and sets tracer', () => {
    const tracerSpy = jest.spyOn(trace, 'getTracer');

    const instrumentor = new LangChainTraceInstrumentor({
      enabled: true,
      tracerName: 'custom-lc-tracer',
      tracerVersion: '2.0.0'
    });

    const config = (instrumentor as any)._config;
    expect(config.enabled).toBe(true);
    expect(config.tracerName).toBe('custom-lc-tracer');
    expect(config.tracerVersion).toBe('2.0.0');
    expect(tracerSpy).toHaveBeenCalledWith('custom-lc-tracer', '2.0.0');

    tracerSpy.mockRestore();
  });

  it('reports @langchain/core as instrumentation dependency', () => {
    const instrumentor = new LangChainTraceInstrumentor();
    const deps = instrumentor.instrumentationDependencies();

    expect(deps).toContain('@langchain/core >= 0.2.0');
  });
});
