// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ClusterCategory } from '../power-platform-api-discovery';
import { RuntimeConfigurationOptions } from './RuntimeConfigurationOptions';

/**
 * Base configuration class for Agent365 SDK.
 * Other packages extend this to add their own settings.
 *
 * Override functions are called on each property access, enabling dynamic
 * resolution from async context (e.g., OpenTelemetry baggage) per-request.
 */
export class RuntimeConfiguration {
  protected readonly overrides: RuntimeConfigurationOptions;

  constructor(overrides?: RuntimeConfigurationOptions) {
    this.overrides = overrides ?? {};
  }

  get clusterCategory(): ClusterCategory {
    if (this.overrides.clusterCategory) {
      return this.overrides.clusterCategory();
    }
    const envValue = process.env.CLUSTER_CATEGORY;
    if (envValue) {
      return envValue.toLowerCase() as ClusterCategory;
    }
    return 'prod';
  }

  /**
   * Whether the cluster is a development environment (local or dev).
   * Based on clusterCategory.
   */
  get isDevelopmentEnvironment(): boolean {
    return ['local', 'dev'].includes(this.clusterCategory);
  }

  /**
   * Whether NODE_ENV indicates development mode.
   * Returns true when NODE_ENV is 'development' (case-insensitive).
   * This is the standard Node.js way of indicating development mode.
   */
  get isNodeEnvDevelopment(): boolean {
    const override = this.overrides.isNodeEnvDevelopment?.();
    if (override !== undefined) return override;

    const nodeEnv = process.env.NODE_ENV ?? '';
    return nodeEnv.toLowerCase() === 'development';
  }
}
