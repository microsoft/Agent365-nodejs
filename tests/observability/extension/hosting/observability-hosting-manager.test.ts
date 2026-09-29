// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from '@jest/globals';
import { ObservabilityHostingManager } from '../../../../packages/agents-a365-observability-hosting/src/middleware/ObservabilityHostingManager';
import { BaggageMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/BaggageMiddleware';
import { OutputLoggingMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/OutputLoggingMiddleware';
import { InvocationIdentityMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/InvocationIdentityMiddleware';

function mockAdapter() {
  const registered: any[] = [];
  return { use(...mw: any[]) { registered.push(...mw); }, registered };
}

describe('ObservabilityHostingManager', () => {
  it.each([
    ['the flag is omitted', {}],
    ['the flag is false', { enableInvocationIdentity: false }],
    ['only identity options are supplied', {
      strictIdentityValidation: true,
      resolveValidatedPrincipal: () => undefined,
      targetIdentity: { agentId: '77777777-7777-4777-8777-777777777777' },
    }],
  ])('does not register InvocationIdentityMiddleware when %s', (_label, options) => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, options);
    expect(adapter.registered).toHaveLength(0);
  });

  it('registers BaggageMiddleware when enableBaggage is true', () => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, { enableBaggage: true });
    expect(adapter.registered).toHaveLength(1);
    expect(adapter.registered[0]).toBeInstanceOf(BaggageMiddleware);
  });

  it('registers both middleware when enableBaggage and enableOutputLogging are true', () => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, { enableBaggage: true, enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(2);
    expect(adapter.registered[0]).toBeInstanceOf(BaggageMiddleware);
    expect(adapter.registered[1]).toBeInstanceOf(OutputLoggingMiddleware);
  });

  it('registers middleware in Identity-Baggage-Output order', () => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, {
      enableInvocationIdentity: true,
      enableBaggage: true,
      enableOutputLogging: true,
    });

    expect(adapter.registered).toHaveLength(3);
    expect(adapter.registered[0]).toBeInstanceOf(InvocationIdentityMiddleware);
    expect(adapter.registered[1]).toBeInstanceOf(BaggageMiddleware);
    expect(adapter.registered[2]).toBeInstanceOf(OutputLoggingMiddleware);
  });

  it('registers only OutputLoggingMiddleware when enableOutputLogging is true and enableBaggage is omitted', () => {
    const adapter = mockAdapter();
    new ObservabilityHostingManager().configure(adapter, { enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(1);
    expect(adapter.registered[0]).toBeInstanceOf(OutputLoggingMiddleware);
  });

  it('subsequent configure calls on same instance are no-ops', () => {
    const adapter = mockAdapter();
    const manager = new ObservabilityHostingManager();
    manager.configure(adapter, { enableBaggage: true, enableOutputLogging: true });
    manager.configure(adapter, { enableBaggage: true, enableOutputLogging: true });
    expect(adapter.registered).toHaveLength(2);
  });

  it('deduplicates identity middleware for the same adapter across manager instances', () => {
    const adapter = mockAdapter();

    new ObservabilityHostingManager().configure(adapter, { enableInvocationIdentity: true });
    new ObservabilityHostingManager().configure(adapter, { enableInvocationIdentity: true });

    expect(adapter.registered).toHaveLength(1);
    expect(adapter.registered[0]).toBeInstanceOf(InvocationIdentityMiddleware);
  });
});
