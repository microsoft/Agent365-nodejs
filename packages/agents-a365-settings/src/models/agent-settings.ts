// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentSettingProperty } from './agent-setting-property';

/**
 * Represents settings for a specific agent instance.
 */
export interface AgentSettings {
  /**
   * The unique identifier of the agent instance.
   */
  agentInstanceId: string;

  /**
   * The settings properties for this agent instance.
   */
  properties: AgentSettingProperty[];
}
