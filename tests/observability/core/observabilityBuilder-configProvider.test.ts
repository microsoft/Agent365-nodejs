// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ObservabilityBuilder } from '@microsoft/agents-a365-observability/src/ObservabilityBuilder';
import { ObservabilityManager } from '@microsoft/agents-a365-observability/src/ObservabilityManager';
import { ObservabilityConfiguration } from '@microsoft/agents-a365-observability/src/configuration/ObservabilityConfiguration';
import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';

// Capture Agent365Exporter constructor options without performing network calls.
jest.mock('@microsoft/agents-a365-observability/src/tracing/exporter/Agent365Exporter', () => ({
  Agent365Exporter: class {
    constructor(opts: any) { (global as any).__capturedOpts = opts; }
    export() {/* no-op */}
    shutdown() {/* no-op */}
    forceFlush() {/* no-op */}
  }
}));

// Capture setLogger calls.
let capturedLogger: any = null;
jest.mock('@microsoft/agents-a365-observability/src/utils/logging', () => {
  const actual = jest.requireActual('@microsoft/agents-a365-observability/src/utils/logging') as any;
  return { ...actual, __esModule: true, default: actual.default, DefaultLogger: actual.DefaultLogger,
    setLogger: (l: any) => { capturedLogger = l; actual.setLogger(l); } };
});

const makeProvider = (exporterEnabled?: boolean) =>
  new DefaultConfigurationProvider(() => new ObservabilityConfiguration({
    ...(exporterEnabled !== undefined && { isObservabilityExporterEnabled: () => exporterEnabled }),
  }));

const capturedOpts = () => (global as any).__capturedOpts as any | undefined;

describe('ObservabilityBuilder configProvider', () => {
  beforeEach(() => {
    delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
    delete (global as any).__capturedOpts;
    capturedLogger = null;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    delete process.env.ENABLE_A365_OBSERVABILITY_EXPORTER;
    await ObservabilityManager.shutdown();
    jest.restoreAllMocks();
  });

  it('withConfigurationProvider returns the builder for chaining', () => {
    const builder = new ObservabilityBuilder();
    expect(builder.withConfigurationProvider(makeProvider())).toBe(builder);
  });

  it('threads configProvider into Agent365ExporterOptions alongside other options', () => {
    const provider = makeProvider(true);
    new ObservabilityBuilder()
      .withConfigurationProvider(provider)
      .withExporterOptions({ maxQueueSize: 42 })
      .withTokenResolver(() => 'tok')
      .build();

    expect(capturedOpts()).toBeDefined();
    expect(capturedOpts().configProvider).toBe(provider);
    expect(capturedOpts().maxQueueSize).toBe(42);
    expect(capturedOpts().tokenResolver('a', 'b')).toBe('tok');
  });

  it('creates DefaultLogger from configProvider when no custom logger is set', () => {
    new ObservabilityBuilder().withConfigurationProvider(makeProvider(false)).build();
    expect(capturedLogger).toBeDefined();
    expect(typeof capturedLogger.info).toBe('function');
  });

  it('custom logger takes precedence over configProvider-based logger', () => {
    const custom = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), event: jest.fn() };
    new ObservabilityBuilder()
      .withConfigurationProvider(makeProvider(false))
      .withCustomLogger(custom)
      .build();
    expect(capturedLogger).toBe(custom);
  });

  it('does not call setLogger when no configProvider or customLogger is provided', () => {
    new ObservabilityBuilder().build();
    expect(capturedLogger).toBeNull();
  });

  it('builds without configProvider using env var fallback (backward compat)', () => {
    process.env.ENABLE_A365_OBSERVABILITY_EXPORTER = 'true';
    new ObservabilityBuilder().withTokenResolver(() => 't').build();
    expect(capturedOpts()).toBeDefined();
    expect(capturedOpts().configProvider).toBeUndefined();
  });

  it('ObservabilityManager.start() passes configProvider through to exporter', () => {
    const provider = makeProvider(true);
    ObservabilityManager.start({ serviceName: 'svc', tokenResolver: () => 't', configProvider: provider });
    expect(capturedOpts()?.configProvider).toBe(provider);
  });
});
