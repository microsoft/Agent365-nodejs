// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Middleware } from '@microsoft/agents-hosting';
import { MessageLoggingMiddleware, MessageLoggingMiddlewareOptions } from './MessageLoggingMiddleware';

/**
 * Fluent builder for registering observability middleware on an adapter.
 *
 * @example
 * ```typescript
 * new ObservabilityMiddlewareRegistrar()
 *   .withMessageLogging()
 *   .apply(adapter);
 * ```
 */
export class ObservabilityMiddlewareRegistrar {
  private readonly _middlewareFactories: Array<() => Middleware> = [];

  /**
   * Configures message logging middleware for tracing input/output messages.
   * @param options Optional configuration for message logging behavior.
   * @returns This registrar instance for chaining.
   */
  withMessageLogging(options?: MessageLoggingMiddlewareOptions): this {
    this._middlewareFactories.push(() => new MessageLoggingMiddleware(options));
    return this;
  }

  /**
   * Instantiates and registers all configured middleware on the adapter.
   * @param adapter The adapter to register middleware on. Must have a `use` method.
   */
  apply(adapter: { use(...middlewares: Array<Middleware>): void }): void {
    for (const createMiddleware of this._middlewareFactories) {
      adapter.use(createMiddleware());
    }
  }
}
