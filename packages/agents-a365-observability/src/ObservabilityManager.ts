// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { ObservabilityBuilder, BuilderOptions } from './ObservabilityBuilder';

/**
 * Main entry point for Agent365 providing OpenTelemetry tracing for AI agents and tools
 */
export class ObservabilityManager {
  private static instance?: ObservabilityBuilder;


  /**
   * Configures Kairo with OpenTelemetry tracing for AI agents and tools
   * @param configure Optional configuration callback for the Builder
   * @returns The configured Builder instance
   */
  public static configure(
    configure?: (builder: ObservabilityBuilder) => void
  ): ObservabilityBuilder {
    const builder = new ObservabilityBuilder();

    configure?.(builder);

    ObservabilityManager.instance = builder;
    return builder;
  }

  /**
   * Configures and starts Agent365 with simplified options
   * @param options Configuration options
   * @returns The configured and started Builder instance
   */
  public static start(options?: BuilderOptions): ObservabilityBuilder {
    const builder = new ObservabilityBuilder();

    if (options?.serviceName) {
      builder.withService(options.serviceName, options.serviceVersion);
    }

    if (options?.tokenResolver) {
      builder.withTokenResolver(options.tokenResolver);
    }

    if (options?.clusterCategory) {
      builder.withClusterCategory(options.clusterCategory);
    }

    builder.start();

    ObservabilityManager.instance = builder;
    return builder;
  }

  /**
   * Gets the current Agent365 instance
   * @returns The current instance or null if not configured
   */
  public static getInstance(): ObservabilityBuilder | null {
    return ObservabilityManager.instance || null;
  }

  /**
   * Shuts down Agent365
   */
  public static async shutdown(): Promise<void> {
    if (ObservabilityManager.instance) {
      await ObservabilityManager.instance.shutdown();
      ObservabilityManager.instance = undefined;
    }
  }
}