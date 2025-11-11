// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import { ClusterCategory } from '@microsoft/agents-a365-runtime';
import { TokenResolver } from './Agent365Exporter';

/**
 * Configuration for Agent365Exporter.
 * Only ClusterCategory and TokenResolver are required for core operation.
 */
export class Agent365ExporterOptions {
  /**
   * Environment / cluster category
   */
  public clusterCategory: ClusterCategory | string = 'preprod';

  /**
   * delegate used to resolve the auth token. REQUIRED.
   */
  public tokenResolver?: TokenResolver;

  /**
   * When true, uses the service-to-service (S2S) endpoint path: /maven/agent365/service/agents/{agentId}/traces
   * When false (default), uses the standard endpoint path: /maven/agent365/agents/{agentId}/traces
   */
  public useS2SEndpoint: boolean = false;

  /**
   * Maximum queue size for the batch processor.
   */
  public maxQueueSize: number = 2048;

  /**
   * Delay in milliseconds between export batches.
   */
  public scheduledDelayMilliseconds: number = 5000;

  /**
   * Timeout in milliseconds for the export operation.
   */
  public exporterTimeoutMilliseconds: number = 30000;

  /**
   * Maximum batch size for export operations.
   */
  public maxExportBatchSize: number = 512;
}
