// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentSettingProperty } from './agent-setting-property';

/**
 * Represents settings for a specific agent instance.
 */
export interface AgentSettings {
  /**
   * The unique identifier of the settings.
   */
  id?: string;

  /**
   * The unique identifier of the agent instance.
   */
  agentInstanceId: string;

  /**
   * The template identifier these settings are based on.
   */
  templateId?: string;

  /**
   * The agent type.
   */
  agentType?: string;

  /**
   * The settings properties for this agent instance.
   */
  properties: AgentSettingProperty[];

  /**
   * The date and time when these settings were created.
   */
  createdAt?: string;

  /**
   * The date and time when these settings were last modified.
   */
  modifiedAt?: string;
}
