// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PerRequestSpanProcessor } from '@microsoft/agents-a365-observability/src/tracing/PerRequestSpanProcessor';
import { isPerRequestExportEnabled } from '@microsoft/agents-a365-observability/src/tracing/exporter/utils';
import { ObservabilityBuilder } from '@microsoft/agents-a365-observability/src/ObservabilityBuilder';
import {
  setPerRequestProcessorInternalOverrides,
  getPerRequestProcessorInternalOverrides,
} from '@microsoft/agents-a365-observability/src/internal/PerRequestProcessorOverrides';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { ExportResultCode } from '@opentelemetry/core';

// Mock Agent365Exporter to avoid network calls
jest.mock('@microsoft/agents-a365-observability/src/tracing/exporter/Agent365Exporter', () => ({
  Agent365Exporter: class {
    export() {/* no-op */}
    shutdown() {/* no-op */}
    forceFlush() {/* no-op */}
  },
}));

// Suppress logger output
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setPerRequestProcessorInternalOverrides(undefined);
  jest.restoreAllMocks();
});

const noopExporter: SpanExporter = {
  export: (_spans: ReadableSpan[], cb: (result: { code: number }) => void) =>
    cb({ code: ExportResultCode.SUCCESS }),
  shutdown: async () => {},
};

describe('PerRequestProcessorOverrides', () => {
  it('get/set round-trips correctly', () => {
    expect(getPerRequestProcessorInternalOverrides()).toBeUndefined();

    setPerRequestProcessorInternalOverrides({ perRequestExportEnabled: true });
    expect(getPerRequestProcessorInternalOverrides()?.perRequestExportEnabled).toBe(true);

    setPerRequestProcessorInternalOverrides(undefined);
    expect(getPerRequestProcessorInternalOverrides()).toBeUndefined();
  });

  it('isPerRequestExportEnabled returns override value, ignoring env var', () => {
    process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT = 'true';
    setPerRequestProcessorInternalOverrides({ perRequestExportEnabled: false });
    expect(isPerRequestExportEnabled()).toBe(false);

    setPerRequestProcessorInternalOverrides({ perRequestExportEnabled: true });
    expect(isPerRequestExportEnabled()).toBe(true);
  });

  it('PerRequestSpanProcessor uses overrides for guardrails', () => {
    setPerRequestProcessorInternalOverrides({
      perRequestProcessorSettings: { maxBufferedTraces: 7, maxConcurrentExports: 3 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processor = new PerRequestSpanProcessor(noopExporter) as any;
    expect(processor.maxBufferedTraces).toBe(7);
    expect(processor.maxConcurrentExports).toBe(3);
    // unset field falls back to config default
    expect(processor.maxSpansPerTrace).toBe(5000);
  });

  it('PerRequestSpanProcessor uses config defaults when no overrides set', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processor = new PerRequestSpanProcessor(noopExporter) as any;
    expect(processor.maxBufferedTraces).toBe(1000);
    expect(processor.maxSpansPerTrace).toBe(5000);
    expect(processor.maxConcurrentExports).toBe(20);
  });

  it('ObservabilityBuilder uses PerRequestSpanProcessor when override enables it', () => {
    setPerRequestProcessorInternalOverrides({ perRequestExportEnabled: true });

    const builder = new ObservabilityBuilder().withService('test-agent');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const processor = (builder as any).createExportProcessor();
    expect(processor.constructor.name).toBe('PerRequestSpanProcessor');
  });
});
