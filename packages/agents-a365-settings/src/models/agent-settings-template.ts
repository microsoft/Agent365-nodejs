// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentSettingProperty } from './agent-setting-property';

/**
 * Represents a settings template for an agent type.
 * Templates define the available settings schema for a particular agent type.
 */
export interface AgentSettingsTemplate {
  /**
   * The type of agent this template applies to.
   */
  agentType: string;

  /**
   * The properties defined in this template.
   */
  properties: AgentSettingProperty[];
}
