// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { ObservabilityBuilder } from '@microsoft/agents-a365-observability/src/ObservabilityBuilder';

// Mock the Agent365Exporter so we can capture the constructed options without performing network calls.
jest.mock('@microsoft/agents-a365-observability/src/tracing/exporter/Agent365Exporter', () => {
  return {
    Agent365Exporter: class {
      public static lastOptions: any;
      constructor(opts: any) {
        // Capture the options passed from ObservabilityBuilder
        (global as any).__capturedExporterOptions = opts;
        (global as any).__capturedExporterOptionsCallCount = ((global as any).__capturedExporterOptionsCallCount || 0) + 1;
        (this.constructor as any).lastOptions = opts;
      }
      export() {/* no-op */}
      shutdown() {/* no-op */}
      forceFlush() {/* no-op */}
    }
  };
});

describe('ObservabilityBuilder exporterOptions merging', () => {
  beforeEach(() => {
    // Clean up any captured options from previous tests
    delete (global as any).__capturedExporterOptions;
    delete (global as any).__capturedExporterOptionsCallCount;
  });

  afterEach(() => {
    // Clean up environment variable after each test
    delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
  });

  it('applies provided exporterOptions and allows builder overrides to take precedence', () => {
    // Enable Agent365 exporter to test the exporter options
    process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = 'true';

    const builder = new ObservabilityBuilder()
      .withExporterOptions({
        maxQueueSize: 10,
        scheduledDelayMilliseconds: 1111,
        exporterTimeoutMilliseconds: 2222,
        maxExportBatchSize: 33,
        // These should be overridden by explicit builder methods below
        clusterCategory: 'dev' as any,
        tokenResolver: () => 'token-from-exporterOptions'
      })
      .withClusterCategory('test')
      .withTokenResolver(() => 'token-from-builder');

    const built = builder.build();
    expect(built).toBe(true);

    const captured: any = (global as any).__capturedExporterOptions;
    expect(captured).toBeDefined();
    // Custom numeric options preserved
    expect(captured.maxQueueSize).toBe(10);
    expect(captured.scheduledDelayMilliseconds).toBe(1111);
    expect(captured.exporterTimeoutMilliseconds).toBe(2222);
    expect(captured.maxExportBatchSize).toBe(33);
    // Explicit builder overrides should win
    expect(captured.clusterCategory).toBe('test');
    expect(typeof captured.tokenResolver).toBe('function');
    expect(captured.tokenResolver('a','b')).toBe('token-from-builder');
  });

  it('defaults to prod clusterCategory when none provided', () => {
    // Enable Agent365 exporter to test the exporter options
    process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = 'true';

    const builder = new ObservabilityBuilder()
      .withExporterOptions({ maxQueueSize: 15 }) // no cluster category passed
      .withTokenResolver(() => 'test-token'); // Add token resolver so Agent365Exporter is used

    builder.build();
    const captured: any = (global as any).__capturedExporterOptions;
    expect(captured.clusterCategory).toBe('prod');
    expect(captured.maxQueueSize).toBe(15);
    expect(captured.scheduledDelayMilliseconds).toBe(5000); // default value
  });

  it('uses ConsoleSpanExporter when no tokenResolver is provided', () => {
    const builder = new ObservabilityBuilder()
      .withExporterOptions({ maxQueueSize: 15 }); // no token resolver

    const built = builder.build();
    expect(built).toBe(true);

    // Since no tokenResolver was provided, Agent365Exporter should NOT be created
    const captured: any = (global as any).__capturedExporterOptions;
    expect(captured).toBeUndefined();
  });

  it('uses ConsoleSpanExporter when ENABLE_A365_OBSERVABILITY_EXPORTER is not set', () => {
    // Even with tokenResolver, if env var is not set, should use ConsoleSpanExporter
    const builder = new ObservabilityBuilder()
      .withTokenResolver(() => 'test-token');

    const built = builder.build();
    expect(built).toBe(true);

    // Since ENABLE_A365_OBSERVABILITY_EXPORTER is not set, Agent365Exporter should NOT be created
    const captured: any = (global as any).__capturedExporterOptions;
    expect(captured).toBeUndefined();
  });
});
