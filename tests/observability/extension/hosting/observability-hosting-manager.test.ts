// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from '@jest/globals';
import { ObservabilityHostingManager } from '../../../../packages/agents-a365-observability-hosting/src/middleware/ObservabilityHostingManager';
import { BaggageMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/BaggageMiddleware';
import { OutputLoggingMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/OutputLoggingMiddleware';

function mockAdapter() {
  const registered: any[] = [];
  return { use(...mw: any[]) { registered.push(...mw); }, registered };
}

describe('ObservabilityHostingManager', () => {
  it('registers BaggageMiddleware by default', () => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, {});
    expect(adapter.registered).toHaveLength(1);
    expect(adapter.registered[0]).toBeInstanceOf(BaggageMiddleware);
  });

  it('registers both middleware when enableOutputLogging is true', () => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, { enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(2);
    expect(adapter.registered[0]).toBeInstanceOf(BaggageMiddleware);
    expect(adapter.registered[1]).toBeInstanceOf(OutputLoggingMiddleware);
  });

  it('skips BaggageMiddleware when enableBaggage is false', () => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, { enableBaggage: false, enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(1);
    expect(adapter.registered[0]).toBeInstanceOf(OutputLoggingMiddleware);
  });

  it('subsequent configure calls on same instance are no-ops', () => {
    const adapter = mockAdapter();
    const manager = new ObservabilityHostingManager();
    manager.configure(adapter, { enableOutputLogging: true });
    manager.configure(adapter, { enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(2);
  });
});
