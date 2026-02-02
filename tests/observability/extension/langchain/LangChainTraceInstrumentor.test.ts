// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Tracer } from '@opentelemetry/api';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import * as LangChainCallbacks from '@langchain/core/callbacks/manager';
import { ObservabilityManager } from '@microsoft/agents-a365-observability';
import { LangChainTraceInstrumentor, addTracerToHandlers } from '../../../../packages/agents-a365-observability-extensions-langchain/src/LangChainTraceInstrumentor';
import { LangChainTracer } from '../../../../packages/agents-a365-observability-extensions-langchain/src/tracer';

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

  it('throws error when enable is called before initialization', () => {
    expect(() => {
      LangChainTraceInstrumentor.enable();
    }).toThrow("LangChainTraceInstrumentor must be initialized first");
  });

  it('throws error when disable is called before initialization', () => {
    expect(() => {
      LangChainTraceInstrumentor.disable();
    }).toThrow("LangChainTraceInstrumentor must be initialized first");
  });

  it('initializes when Instrument is called', () => {
    expect(() => {
      LangChainTraceInstrumentor.Instrument(LangChainCallbacks as any);
    }).not.toThrow();
  });

  it('can enable/disable after initialization', () => {
    LangChainTraceInstrumentor.Instrument(LangChainCallbacks as any);
    
    expect(() => {
      LangChainTraceInstrumentor.disable();
    }).not.toThrow();

    expect(() => {
      LangChainTraceInstrumentor.enable();
    }).not.toThrow();
  });
});

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

  it('Patches CallbackManager with LangChainTracer when instrumented', async () => {
    // Initialize first
    LangChainTraceInstrumentor.Instrument(LangChainCallbacks as any);

    // Verify tracing works by checking if LangChainTracer is injected
    const inheritableHandlers: LangChainCallbacks.Callbacks = [];
    const manager = (LangChainCallbacks.CallbackManager as typeof LangChainCallbacks.CallbackManager)._configureSync(inheritableHandlers);
    
    expect(manager).toBeDefined();
    expect(Array.isArray(inheritableHandlers)).toBe(true);
    // Should have LangChainTracer injected
    expect(inheritableHandlers.length).toBeGreaterThanOrEqual(1);
    expect(inheritableHandlers.some((h) => h instanceof LangChainTracer)).toBe(true);
  });
});
