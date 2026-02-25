// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ObservabilityHostingManager } from '../../../../packages/agents-a365-observability-hosting/src/middleware/ObservabilityHostingManager';
import { BaggageMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/BaggageMiddleware';
import { OutputLoggingMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/OutputLoggingMiddleware';

function mockAdapter() {
  const registered: any[] = [];
  return { use(...mw: any[]) { registered.push(...mw); }, registered };
}

describe('ObservabilityHostingManager', () => {
  beforeEach(() => {
    (ObservabilityHostingManager as any)._instance = undefined;
  });

  it('registers BaggageMiddleware by default', () => {
    const adapter = mockAdapter();
    ObservabilityHostingManager.configure(adapter);
    expect(adapter.registered).toHaveLength(1);
    expect(adapter.registered[0]).toBeInstanceOf(BaggageMiddleware);
  });

  it('registers both middleware when enableOutputLogging is true', () => {
    const adapter = mockAdapter();
    ObservabilityHostingManager.configure(adapter, { enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(2);
    expect(adapter.registered[0]).toBeInstanceOf(BaggageMiddleware);
    expect(adapter.registered[1]).toBeInstanceOf(OutputLoggingMiddleware);
  });

  it('skips BaggageMiddleware when enableBaggage is false', () => {
    const adapter = mockAdapter();
    ObservabilityHostingManager.configure(adapter, { enableBaggage: false, enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(1);
    expect(adapter.registered[0]).toBeInstanceOf(OutputLoggingMiddleware);
  });

  it('is a singleton — subsequent calls are no-ops', () => {
    const adapter = mockAdapter();
    const first = ObservabilityHostingManager.configure(adapter, { enableOutputLogging: true });
    const second = ObservabilityHostingManager.configure(adapter, { enableOutputLogging: true });
    expect(first).toBe(second);
    expect(adapter.registered).toHaveLength(2);
  });

  it('works without adapter', () => {
    const manager = ObservabilityHostingManager.configure();
    expect(ObservabilityHostingManager.getInstance()).toBe(manager);
  });
});
