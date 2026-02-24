// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from '@jest/globals';
import { ObservabilityMiddlewareRegistrar } from '../../../../packages/agents-a365-observability-hosting/src/middleware/ObservabilityMiddlewareRegistrar';
import { MessageLoggingMiddleware } from '../../../../packages/agents-a365-observability-hosting/src/middleware/MessageLoggingMiddleware';

describe('ObservabilityMiddlewareRegistrar', () => {
  it('should register middleware on adapter via chained withMessageLogging() and apply()', () => {
    const registered: any[] = [];
    const mockAdapter = { use(...middlewares: any[]) { registered.push(...middlewares); } };

    const registrar = new ObservabilityMiddlewareRegistrar();
    const result = registrar.withMessageLogging();
    expect(result).toBe(registrar); // chaining returns this

    registrar.apply(mockAdapter);

    expect(registered.length).toBe(1);
    expect(registered[0]).toBeInstanceOf(MessageLoggingMiddleware);
  });

  it('should register multiple middleware instances', () => {
    const registered: any[] = [];
    const mockAdapter = { use(...middlewares: any[]) { registered.push(...middlewares); } };

    new ObservabilityMiddlewareRegistrar()
      .withMessageLogging()
      .withMessageLogging({ logUserMessages: false })
      .apply(mockAdapter);

    expect(registered.length).toBe(2);
  });

  it('should not call adapter.use when no middleware is configured', () => {
    const useFn = jest.fn();
    new ObservabilityMiddlewareRegistrar().apply({ use: useFn });
    expect(useFn).not.toHaveBeenCalled();
  });
});
