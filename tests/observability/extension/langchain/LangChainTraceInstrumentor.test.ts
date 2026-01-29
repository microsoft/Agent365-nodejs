// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { trace, Tracer } from '@opentelemetry/api';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import * as LangChainCallbacks from '@langchain/core/callbacks/manager';
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { LangChainTraceInstrumentor, LangChainTracer } from '@microsoft/agents-a365-observability-extensions-langchain';
import { addTracerToHandlers } from '../../../../packages/agents-a365-observability-extensions-langchain/src/LangChainTraceInstrumentor';

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

class TestableLangChainTraceInstrumentor extends LangChainTraceInstrumentor {
  public callInit() {
    return this.init();
  }
}

class MockCallbackHandler extends BaseCallbackHandler {
  name = 'MockCallbackHandler';
  // Minimal implementation to satisfy BaseCallbackHandler requirements
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

describe('addTracerToHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LangChainTraceInstrumentor.resetInstance();
  });

  it('adds tracer when handlers is undefined', () => {
    const tracer = {} as Tracer;

    const result = addTracerToHandlers(tracer, undefined);

    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result).toHaveLength(1);
      expect(result[0]).toBeInstanceOf(LangChainTracer);
    }
  });

  it('adds tracer to an existing array of handlers', () => {
    const tracer = {} as Tracer;
    const handlers = [new MockCallbackHandler()];

    const result = addTracerToHandlers(tracer, handlers);

    expect(result).toBe(handlers);
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(MockCallbackHandler);
      expect(result[1]).toBeInstanceOf(LangChainTracer);
    }
  });

  it('Patches CallbackManager with LangChainTracer and verifies it gets called', async () => {
    const instrumentor = new TestableLangChainTraceInstrumentor();

    const instrumentationModuleDefinition = instrumentor.callInit();

    expect(instrumentationModuleDefinition.name).toBe('@langchain/core/callbacks/manager');
    expect(instrumentationModuleDefinition.supportedVersions).toContain('>=0.2.0');
    expect(typeof instrumentationModuleDefinition.patch).toBe('function');
    // simulate OTel calling patch with real @langchain/core exports
    const patched = instrumentationModuleDefinition.patch!(LangChainCallbacks);
    expect(patched).toBe(LangChainCallbacks);

    // Use the patched static _configureSync to obtain a CallbackManager instance
    const inheritableHandlers: LangChainCallbacks.Callbacks = [];
    const manager = (patched.CallbackManager as typeof LangChainCallbacks.CallbackManager)._configureSync(inheritableHandlers);
    expect(manager).toBeDefined();
    // _configureSync should have injected a LangChainTracer into the handlers
    expect(Array.isArray(inheritableHandlers)).toBe(true);
    expect(inheritableHandlers.length).toBe(1);

    let tracerStartTracingCalled = false;
    let originalStartTracing;

    if (Array.isArray(inheritableHandlers)) {
      const tracerHandler = inheritableHandlers.find(
        (h) => h instanceof LangChainTracer,
      ) as LangChainTracer | undefined;

      expect(tracerHandler).toBeDefined();
      if (tracerHandler) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        originalStartTracing = (tracerHandler as any).startTracing.bind(tracerHandler);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tracerHandler as any).startTracing = async (run: unknown) => {
          tracerStartTracingCalled = true;
          return originalStartTracing!(run);
        };
      }
    }

    // Simulate an LLM start event; this will cause CallbackManager to
    // invoke handleLLMStart on all handlers, including LangChainTracer
    
    if (manager) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fakeLlm = { id: ['langchain', 'test-llm'] } as any;
      await manager.handleLLMStart(fakeLlm, ['prompt'], 'run-id');
      expect(tracerStartTracingCalled).toBe(true);
    }
  });
});
