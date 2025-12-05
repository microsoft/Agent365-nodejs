// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SpanProcessor } from './tracing/processors/SpanProcessor';
import { isAgent365ExporterEnabled } from './tracing/util';
import { Agent365Exporter } from './tracing/exporter/Agent365Exporter';
import type { TokenResolver } from './tracing/exporter/Agent365ExporterOptions';
import { Agent365ExporterOptions } from './tracing/exporter/Agent365ExporterOptions';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace } from '@opentelemetry/api';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';
import { OpenTelemetryConstants } from './tracing/constants';
/**
 * Configuration options for Agent 365 Observability Builder
 */
export interface BuilderOptions {
  /** Custom service name for telemetry */
  serviceName?: string;

  /** Custom service version for telemetry */
  serviceVersion?: string;

  tokenResolver?: TokenResolver;
  /** Environment / cluster category (e.g., "preprod", "prod"). */
  clusterCategory?: ClusterCategory;
  /**
   * Optional partial set of exporter options allowing agent developers to customize.
   * Any values omitted will fall back to the defaults defined in Agent365ExporterOptions.
   * Values provided here will be overridden by explicitly configured tokenResolver or clusterCategory
   * from dedicated builder methods.
   */
  exporterOptions?: Partial<Agent365ExporterOptions>;

}

/**
 * Builder for configuring Agent 365 with OpenTelemetry tracing
 */
export class ObservabilityBuilder {
  private options: BuilderOptions = {};
  private isBuilt = false;
  private sdk?: NodeSDK;

  /**
   * Configures the service name and version for telemetry
   * @param serviceName The service name
   * @param serviceVersion The service version
   * @returns The builder instance for method chaining
   */
  public withService(serviceName: string, serviceVersion?: string): ObservabilityBuilder {
    this.options.serviceName = serviceName;
    this.options.serviceVersion = serviceVersion;
    return this;
  }

  /**
   * Configures the token resolver for Agent 365 exporter
   * @param tokenResolver Function to resolve authentication tokens
   * @returns The builder instance for method chaining
   */
  public withTokenResolver(tokenResolver: TokenResolver): ObservabilityBuilder {
    this.options.tokenResolver = tokenResolver;
    return this;
  }

  /**
   * Configures the cluster category for Agent 365 exporter
   * @param clusterCategory The cluster category (e.g., "preprod", "prod")
   * @returns The builder instance for method chaining
   */
  public withClusterCategory(clusterCategory: ClusterCategory): ObservabilityBuilder {
    this.options.clusterCategory = clusterCategory;
    return this;
  }

  /**
   * Provide a partial set of Agent365ExporterOptions. These will be merged with
   * defaults and any explicitly configured clusterCategory/tokenResolver.
   * @param exporterOptions Partial exporter options
   * @returns The builder instance for chaining
   */
  public withExporterOptions(exporterOptions: Partial<Agent365ExporterOptions>): ObservabilityBuilder {
    this.options.exporterOptions = {
      ...(this.options.exporterOptions || {}),
      ...exporterOptions
    };
    return this;
  }

  private createBatchProcessor(): BatchSpanProcessor {
    // Check if we should use Agent365Exporter:
    // 1. tokenResolver is explicitly provided via withTokenResolver, OR
    // 2. tokenResolver is provided via exporterOptions, OR
    // 3. ENABLE_A365_OBSERVABILITY_EXPORTER is explicitly enabled (for backward compatibility)
    const hasTokenResolver = this.options.tokenResolver || this.options.exporterOptions?.tokenResolver;
    const isExporterExplicitlyEnabled = isAgent365ExporterEnabled() && 
      process.env[OpenTelemetryConstants.ENABLE_A365_OBSERVABILITY_EXPORTER];
    
    // If no token resolver and exporter is not explicitly enabled, use console exporter
    if (!hasTokenResolver && !isExporterExplicitlyEnabled) {
      return new BatchSpanProcessor(new ConsoleSpanExporter());
    }

    // If explicitly disabled via env var, use console exporter
    if (!isAgent365ExporterEnabled()) {
      return new BatchSpanProcessor(new ConsoleSpanExporter());
    }

    const opts = new Agent365ExporterOptions();
    if (this.options.exporterOptions) {
      Object.assign(opts, this.options.exporterOptions);
    }
    opts.clusterCategory = this.options.clusterCategory || opts.clusterCategory || 'prod';
    if (this.options.tokenResolver) {
      opts.tokenResolver = this.options.tokenResolver;
    }
    
    // If we still don't have a token resolver at this point, use console exporter
    if (!opts.tokenResolver) {
      return new BatchSpanProcessor(new ConsoleSpanExporter());
    }
    
    return new BatchSpanProcessor(new Agent365Exporter(opts), {
      maxQueueSize: opts.maxQueueSize,
      scheduledDelayMillis: opts.scheduledDelayMilliseconds,
      exportTimeoutMillis: opts.exporterTimeoutMilliseconds,
      maxExportBatchSize: opts.maxExportBatchSize
    });
  }

  private createResource() {
    const serviceName = this.options.serviceVersion
      ? `${this.options.serviceName}-${this.options.serviceVersion}`
      : this.options.serviceName ?? 'Agent365-TypeScript';

    return resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    });
  }

  /**
   * Builds and initializes the Agent 365 configuration
   * @returns The configured NodeSDK instance
   */
  public build(): boolean {
    if (this.isBuilt) {
      return this.isBuilt;
    }
    // Create processors in the desired order:
    // 1. baggage enricher (copies baggage -> span attributes)
    const spanProcessor = new SpanProcessor();

    // 2. batch processor that actually ships spans out
    const batchProcessor = this.createBatchProcessor();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalProvider: any = trace.getTracerProvider();

    const canAddProcessors =
      typeof globalProvider?.addSpanProcessor === 'function' &&
      typeof globalProvider?.resource !== 'undefined';

    if (canAddProcessors) {
      // Someone else already created a provider (maybe their own NodeSDK).
      // We DO NOT create a new NodeSDK.
      // We just add our baggage enricher + batch exporter to their provider,
      // but only if they aren't already there.

      this.attachProcessorIfMissing(globalProvider, spanProcessor);
      this.attachProcessorIfMissing(globalProvider, batchProcessor);

      this.isBuilt = true;
      this.sdk = undefined; // we didn't create/own one
      return this.isBuilt;
    }


    // Create & configure the NodeSDK manually so we can inject processors + resource.
    this.sdk = new NodeSDK({
      resource: this.createResource(),
      spanProcessors: [
        spanProcessor,
        batchProcessor,
      ],
    });

    this.isBuilt = true;
    return this.isBuilt;
  }

  /**
   * Starts the OpenTelemetry SDK
   */
  public start(): void {
    if (!this.isBuilt) {
      this.build();
    }
    if (this.sdk) {
      this.sdk.start();
    }
  }

  /**
   * Shuts down the OpenTelemetry SDK
   */
  public async shutdown(): Promise<void> {
    if (this.sdk) {
      await this.sdk.shutdown();
    }
  }

  /**
   * Helper to avoid double-registering same processor type.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private attachProcessorIfMissing(provider: any, processor: any) {
    const active = provider._activeSpanProcessor?._spanProcessors;
    const alreadyAdded = Array.isArray(active) &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      active.some((p: any) => p?.constructor?.name === processor.constructor.name);

    if (!alreadyAdded) {
      provider.addSpanProcessor(processor);
    }
  }
}
