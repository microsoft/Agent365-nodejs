// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Event names used by Agent365Exporter for logging and monitoring
 */
export const ExporterEventNames = {
  /**
   * Overall export operation event - logs the entire batch export success/failure and duration
   */
  EXPORT: 'agent365-export',

  /**
   * Group export operation event - logs individual tenant/agent group export success/failure and duration
   * Use with template: `export-group-${tenantId}-${agentId}`
   */
  EXPORT_GROUP: 'export-group',

  /**
   * Partition spans by identity (tenant or agent ID) before export event
   */
  EXPORT_PARTITION_SPAN_BY_IDENTITY: 'export-partition-span-by-identity'
} as const;
