// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Middleware } from '@microsoft/agents-hosting';
import { logger } from '@microsoft/agents-a365-observability';
import { BaggageMiddleware } from './BaggageMiddleware';
import { OutputLoggingMiddleware } from './OutputLoggingMiddleware';
import {
  InvocationIdentityMiddleware,
  InvocationIdentityMiddlewareOptions,
} from './InvocationIdentityMiddleware';

const identityConfiguredAdapters = new WeakSet<object>();

/**
 * Configuration options for the hosting observability layer.
 */
export interface ObservabilityHostingOptions extends InvocationIdentityMiddlewareOptions {
  /** Enable request-local invocation identity enrichment. Defaults to false. */
  enableInvocationIdentity?: boolean;

  /** Enable baggage propagation middleware. Defaults to false. */
  enableBaggage?: boolean;

  /** Enable output logging middleware for tracing outgoing messages. Defaults to false. */
  enableOutputLogging?: boolean;
}

/**
 * Manager for configuring hosting-layer observability middleware.
 *
 * @example
 * ```typescript
 * const manager = new ObservabilityHostingManager();
 * manager.configure(adapter, { enableOutputLogging: true });
 * ```
 */
export class ObservabilityHostingManager {
  private _configured = false;

  /**
   * Registers observability middleware on the adapter.
   * Subsequent calls are ignored.
   */
  configure(
    adapter: { use(...middlewares: Array<Middleware>): void },
    options: ObservabilityHostingOptions
  ): void {
    if (this._configured) {
      logger.warn('[ObservabilityHostingManager] Already configured. Subsequent configure() calls are ignored.');
      return;
    }

    const enableBaggage = options.enableBaggage === true;
    const enableOutputLogging = options.enableOutputLogging === true;
    const enableInvocationIdentity = options.enableInvocationIdentity === true;

    if (enableInvocationIdentity && !identityConfiguredAdapters.has(adapter)) {
      adapter.use(new InvocationIdentityMiddleware(options));
      identityConfiguredAdapters.add(adapter);
      logger.info('[ObservabilityHostingManager] InvocationIdentityMiddleware registered.');
    }
    if (enableBaggage) {
      adapter.use(new BaggageMiddleware());
      logger.info('[ObservabilityHostingManager] BaggageMiddleware registered.');
    }
    if (enableOutputLogging) {
      adapter.use(new OutputLoggingMiddleware());
      logger.info('[ObservabilityHostingManager] OutputLoggingMiddleware registered.');
    }

    logger.info(
      `[ObservabilityHostingManager] Configured. InvocationIdentity: ${enableInvocationIdentity}, Baggage: ${enableBaggage}, OutputLogging: ${enableOutputLogging}.`,
    );
    this._configured = true;
  }
}
