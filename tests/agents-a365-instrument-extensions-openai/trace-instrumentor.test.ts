// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Unit tests for OpenAIAgentsTraceInstrumentor
 * Tests the enable/disable lifecycle and integration with OpenAI Agents SDK
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock OpenAI Agents SDK first
const mockSetTraceProcessors = jest.fn();
const mockSetTracingDisabled = jest.fn();

jest.mock('@openai/agents', () => ({
  setTraceProcessors: mockSetTraceProcessors,
  setTracingDisabled: mockSetTracingDisabled,
}));

// Import and configure ObservabilityManager after mocks
import { ObservabilityManager } from '@microsoft/agents-a365-observability';

// Configure ObservabilityManager for testing
export const observability = ObservabilityManager.start({
  serviceName: 'TypeScript Test Agent',
  serviceVersion: '1.0.0'
});

import { OpenAIAgentsTraceInstrumentor } from '@microsoft/agents-a365-instrument-extensions-openai';

describe('OpenAIAgentsTraceInstrumentor', () => {
  let instrumentor: OpenAIAgentsTraceInstrumentor;
  beforeEach(() => {
    jest.clearAllMocks();
    // ObservabilityManager is now configured using real configuration above
  });

  afterEach(() => {
    if (instrumentor) {
      instrumentor.disable();
    }
  });

  describe('Constructor', () => {
    it('should create instrumentor when observabilityManager is configured', () => {
      expect(() => {
        instrumentor = new OpenAIAgentsTraceInstrumentor();
      }).not.toThrow();
      
      expect(instrumentor).toBeDefined();
    });

    it('should accept custom configuration', () => {
      instrumentor = new OpenAIAgentsTraceInstrumentor({
        tracerName: 'custom-tracer',
        tracerVersion: '2.0.0',
      });

      expect(instrumentor).toBeDefined();
    });

    it('should default enabled to false', () => {
      instrumentor = new OpenAIAgentsTraceInstrumentor();
      
      // Access the _config property to check enabled value
      // Note: This is accessing a private property for testing purposes
      expect((instrumentor as any)._config.enabled).toBe(false);
    });

    it('should respect explicit enabled configuration', () => {
      instrumentor = new OpenAIAgentsTraceInstrumentor({
        enabled: true,
      });
      
      expect((instrumentor as any)._config.enabled).toBe(true);
    });

    it('should respect explicit enabled: false configuration', () => {
      instrumentor = new OpenAIAgentsTraceInstrumentor({
        enabled: false,
      });
      
      expect((instrumentor as any)._config.enabled).toBe(false);
    });

    it('should auto-enable when enabled: true is passed', () => {
      // Mock the OpenAI Agents functions to verify they get called
      const setTracingDisabledSpy = jest.spyOn(require('@openai/agents'), 'setTracingDisabled');
      const setTraceProcessorsSpy = jest.spyOn(require('@openai/agents'), 'setTraceProcessors');
      
      instrumentor = new OpenAIAgentsTraceInstrumentor({
        enabled: true,
      });
      
      // Verify the config was set correctly
      expect((instrumentor as any)._config.enabled).toBe(true);
      
      // Verify that OpenTelemetry automatically called enable() which triggered our setup
      expect(setTracingDisabledSpy).toHaveBeenCalledWith(false);
      expect(setTraceProcessorsSpy).toHaveBeenCalled();
      
      // Verify processor was created
      expect(instrumentor.getProcessor()).toBeDefined();
      
      setTracingDisabledSpy.mockRestore();
      setTraceProcessorsSpy.mockRestore();
    });
  });

  describe('enable()', () => {
    beforeEach(() => {
      instrumentor = new OpenAIAgentsTraceInstrumentor();
    });

    it('should enable tracing in OpenAI Agents SDK', () => {
      instrumentor.enable();

      expect(mockSetTracingDisabled).toHaveBeenCalledWith(false);
    });

    it('should create and register trace processor', () => {
      instrumentor.enable();

      expect(mockSetTraceProcessors).toHaveBeenCalled();
      const calls = mockSetTraceProcessors.mock.calls;
      expect(calls[0][0]).toHaveLength(1); // Should register one processor
    });

    it('should get processor instance', () => {
      instrumentor.enable();

      const processor = instrumentor.getProcessor();
      expect(processor).toBeDefined();
    });
  });

  describe('disable()', () => {
    beforeEach(() => {
      instrumentor = new OpenAIAgentsTraceInstrumentor();
      instrumentor.enable();
    });

    it('should shutdown processor', () => {
      const processor = instrumentor.getProcessor();
      const shutdownSpy = jest.spyOn(processor!, 'shutdown');

      instrumentor.disable();

      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should clear processor reference', () => {
      instrumentor.disable();

      const processor = instrumentor.getProcessor();
      expect(processor).toBeUndefined();
    });

    it('should reset trace processors', () => {
      instrumentor.disable();

      expect(mockSetTraceProcessors).toHaveBeenCalledWith([]);
    });

    it('should allow re-enabling after disable', () => {
      instrumentor.disable();
      
      expect(() => {
        instrumentor.enable();
      }).not.toThrow();

      expect(instrumentor.getProcessor()).toBeDefined();
    });
  });

  describe('instrumentationDependencies()', () => {
    beforeEach(() => {
      instrumentor = new OpenAIAgentsTraceInstrumentor();
    });

    it('should return OpenAI Agents dependency', () => {
      const deps = instrumentor.instrumentationDependencies();

      expect(deps).toContain('@openai/agents >= 0.1.5');
    });
  });

  describe('Integration', () => {
    it('should complete full lifecycle', () => {
      instrumentor = new OpenAIAgentsTraceInstrumentor({
        tracerName: 'test-tracer',
        tracerVersion: '1.0.0',
      });

      // Enable
      instrumentor.enable();
      expect(mockSetTracingDisabled).toHaveBeenCalledWith(false);
      expect(instrumentor.getProcessor()).toBeDefined();

      // Disable
      instrumentor.disable();
      expect(mockSetTraceProcessors).toHaveBeenCalledWith([]);
      expect(instrumentor.getProcessor()).toBeUndefined();
    });
  });
});
