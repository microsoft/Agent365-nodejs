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
  /** Enable baggage propagation middleware. Defaults to true. */
  enableBaggage?: boolean;

  /** Enable output logging middleware for tracing outgoing messages. Defaults to false. */
  enableOutputLogging?: boolean;
}

/**
 * Singleton manager for configuring hosting-layer observability middleware.
 *
 * @example
 * ```typescript
 * ObservabilityHostingManager.configure(adapter, {
 *   enableOutputLogging: true,
 * });
 * ```
 */
export class ObservabilityHostingManager {
  private static _instance?: ObservabilityHostingManager;

  private constructor() {}

  /**
   * Configures the singleton instance and registers middleware on the adapter.
   */
  static configure(
    adapter?: { use(...middlewares: Array<Middleware>): void },
    options?: ObservabilityHostingOptions
  ): ObservabilityHostingManager {
    if (ObservabilityHostingManager._instance) {
      logger.warn('[ObservabilityHostingManager] Already configured. Subsequent configure() calls are ignored.');
      return ObservabilityHostingManager._instance;
    }

    const instance = new ObservabilityHostingManager();

    if (adapter) {
      const enableBaggage = options?.enableBaggage !== false;
      const enableOutputLogging = options?.enableOutputLogging === true;

      if (enableBaggage) {
        adapter.use(new BaggageMiddleware());
        logger.info('[ObservabilityHostingManager] BaggageMiddleware registered.');
      }
      if (enableOutputLogging) {
        adapter.use(new OutputLoggingMiddleware());
        logger.info('[ObservabilityHostingManager] OutputLoggingMiddleware registered.');
      }

      logger.info(`[ObservabilityHostingManager] Configured. Baggage: ${enableBaggage}, OutputLogging: ${enableOutputLogging}.`);
    } else {
      logger.warn('[ObservabilityHostingManager] No adapter provided. No middleware registered.');
    }

    ObservabilityHostingManager._instance = instance;
    return instance;
  }

  /**
   * Returns the current singleton instance, or null if not configured.
   */
  static getInstance(): ObservabilityHostingManager | null {
    return ObservabilityHostingManager._instance ?? null;
  }
}
