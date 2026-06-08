// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Middleware } from '@microsoft/agents-hosting';
import { logger } from '@microsoft/agents-a365-observability';
import { BaggageMiddleware } from './BaggageMiddleware';
import { OutputLoggingMiddleware } from './OutputLoggingMiddleware';

/**
 * Configuration options for the hosting observability layer.
 */
export interface ObservabilityHostingOptions {
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

    if (enableBaggage) {
      adapter.use(new BaggageMiddleware());
      logger.info('[ObservabilityHostingManager] BaggageMiddleware registered.');
    }
    if (enableOutputLogging) {
      adapter.use(new OutputLoggingMiddleware());
      logger.info('[ObservabilityHostingManager] OutputLoggingMiddleware registered.');
    }

    logger.info(`[ObservabilityHostingManager] Configured. Baggage: ${enableBaggage}, OutputLogging: ${enableOutputLogging}.`);
    this._configured = true;
  }
}
