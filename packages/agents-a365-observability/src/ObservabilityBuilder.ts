// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SpanProcessor } from './tracing/processors/SpanProcessor';
import { isAgent365ExporterEnabled } from './tracing/util';
import { Agent365Exporter, TokenResolver } from './tracing/exporter/Agent365Exporter';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { trace } from '@opentelemetry/api';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';
/**
 * Configuration options for Kairo
 */
export interface BuilderOptions {
  /** Custom service name for telemetry */
  serviceName?: string;

  /** Custom service version for telemetry */
  serviceVersion?: string;

  tokenResolver?: TokenResolver;
  /** Environment / cluster category (e.g., "preprod", "prod"). */
  clusterCategory?: ClusterCategory;

}

/**
 * Builder for configuring Kairo with OpenTelemetry tracing
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
   * Configures the token resolver for Agent365 exporter
   * @param tokenResolver Function to resolve authentication tokens
   * @returns The builder instance for method chaining
   */
  public withTokenResolver(tokenResolver: TokenResolver): ObservabilityBuilder {
    this.options.tokenResolver = tokenResolver;
    return this;
  }

  /**
   * Configures the cluster category for Agent365 exporter
   * @param clusterCategory The cluster category (e.g., "preprod", "prod")
   * @returns The builder instance for method chaining
   */
  public withClusterCategory(clusterCategory: ClusterCategory): ObservabilityBuilder {
    this.options.clusterCategory = clusterCategory;
    return this;
  }

  private getTraceExporter() {
    if (isAgent365ExporterEnabled()){
      if (!this.options.tokenResolver) {
        throw new Error('tokenResolver must be provided when Agent365 exporter is enabled');
      }
      return new Agent365Exporter(
        this.options.tokenResolver,
        this.options.clusterCategory || 'prod'
      );
    } else {
      return new ConsoleSpanExporter();
    }
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
   * Builds and initializes the Kairo configuration
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
    const batchProcessor = new BatchSpanProcessor(this.getTraceExporter());

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
  private attachProcessorIfMissing(provider: any, processor: any) {
    const active = provider._activeSpanProcessor?._spanProcessors;
    const alreadyAdded = Array.isArray(active) &&
      active.some((p: any) => p?.constructor?.name === processor.constructor.name);

    if (!alreadyAdded) {
      provider.addSpanProcessor(processor);
    }
  }
}

