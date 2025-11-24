// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Represents an individual setting property with name, value, type, and metadata.
 */
export interface AgentSettingProperty {
  /**
   * The name of the setting property.
   */
  name: string;

  /**
   * The value of the setting property.
   */
  value: string;

  /**
   * The type of the setting property (e.g., "string", "integer", "boolean").
   */
  type: string;

  /**
   * Indicates whether this setting is required.
   */
  required: boolean;

  /**
   * Optional description of the setting property.
   */
  description?: string;
}
