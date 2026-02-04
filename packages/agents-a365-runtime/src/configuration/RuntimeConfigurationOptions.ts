// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ClusterCategory } from '../power-platform-api-discovery';

/**
 * Runtime configuration options - all optional functions.
 * Functions are called on each property access, enabling dynamic resolution.
 * Unset values fall back to environment variables.
 */
export type RuntimeConfigurationOptions = {
  clusterCategory?: () => ClusterCategory;
  /**
   * Override for NODE_ENV-based development mode detection.
   * Falls back to NODE_ENV === 'development' check.
   */
  isNodeEnvDevelopment?: () => boolean;
};
