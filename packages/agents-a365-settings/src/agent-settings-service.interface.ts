// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentSettingsTemplate, AgentSettings } from './models';

/**
 * Interface for managing agent settings templates and instance settings.
 */
export interface IAgentSettingsService {
  /**
   * Gets the settings template for a specific agent type.
   *
   * @param agentType - The agent type identifier.
   * @param authToken - The authentication token for API requests.
   * @returns A promise that resolves to the settings template.
   */
  getSettingsTemplateByAgentType(
    agentType: string,
    authToken: string
  ): Promise<AgentSettingsTemplate>;

  /**
   * Sets the settings template for a specific agent type.
   *
   * @param agentType - The agent type identifier.
   * @param template - The settings template to set.
   * @param authToken - The authentication token for API requests.
   * @returns A promise that resolves when the template is set.
   */
  setSettingsTemplateByAgentType(
    agentType: string,
    template: AgentSettingsTemplate,
    authToken: string
  ): Promise<void>;

  /**
   * Gets the settings for a specific agent instance.
   *
   * @param agentInstanceId - The agent instance identifier.
   * @param authToken - The authentication token for API requests.
   * @returns A promise that resolves to the agent settings.
   */
  getSettingsByAgentInstance(
    agentInstanceId: string,
    authToken: string
  ): Promise<AgentSettings>;

  /**
   * Sets the settings for a specific agent instance.
   *
   * @param agentInstanceId - The agent instance identifier.
   * @param settings - The settings to set.
   * @param authToken - The authentication token for API requests.
   * @returns A promise that resolves when the settings are set.
   */
  setSettingsByAgentInstance(
    agentInstanceId: string,
    settings: AgentSettings,
    authToken: string
  ): Promise<void>;
}
