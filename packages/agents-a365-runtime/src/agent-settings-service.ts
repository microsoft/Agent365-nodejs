// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { PowerPlatformApiDiscovery } from './power-platform-api-discovery';

/**
 * Represents an agent setting template.
 */
export interface AgentSettingTemplate {
  /**
   * The agent type identifier.
   */
  agentType: string;

  /**
   * The settings template as a key-value dictionary.
   */
  settings: Record<string, unknown>;

  /**
   * Optional metadata about the template.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Represents agent settings for a specific instance.
 */
export interface AgentSettings {
  /**
   * The agent instance identifier.
   */
  agentInstanceId: string;

  /**
   * The agent type identifier.
   */
  agentType: string;

  /**
   * The settings as a key-value dictionary.
   */
  settings: Record<string, unknown>;

  /**
   * Optional metadata about the settings.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Service for managing agent settings templates and instance-specific settings.
 */
export class AgentSettingsService {
  private readonly apiDiscovery: PowerPlatformApiDiscovery;
  private readonly tenantId: string;

  /**
   * Creates a new instance of AgentSettingsService.
   * @param apiDiscovery The Power Platform API discovery service.
   * @param tenantId The tenant identifier.
   */
  constructor(apiDiscovery: PowerPlatformApiDiscovery, tenantId: string) {
    this.apiDiscovery = apiDiscovery;
    this.tenantId = tenantId;
  }

  /**
   * Gets the base endpoint for agent settings API.
   * @returns The base endpoint URL.
   */
  private getBaseEndpoint(): string {
    const tenantEndpoint = this.apiDiscovery.getTenantEndpoint(this.tenantId);
    return `https://${tenantEndpoint}/agents/v1.0`;
  }

  /**
   * Gets the endpoint for agent setting templates.
   * @param agentType The agent type identifier.
   * @returns The endpoint URL for the agent type template.
   */
  public getAgentSettingTemplateEndpoint(agentType: string): string {
    return `${this.getBaseEndpoint()}/settings/templates/${encodeURIComponent(agentType)}`;
  }

  /**
   * Gets the endpoint for agent instance settings.
   * @param agentInstanceId The agent instance identifier.
   * @returns The endpoint URL for the agent instance settings.
   */
  public getAgentSettingsEndpoint(agentInstanceId: string): string {
    return `${this.getBaseEndpoint()}/settings/instances/${encodeURIComponent(agentInstanceId)}`;
  }

  /**
   * Retrieves an agent setting template by agent type.
   * @param agentType The agent type identifier.
   * @param accessToken The access token for authentication.
   * @returns A promise that resolves to the agent setting template.
   */
  public async getAgentSettingTemplate(
    agentType: string,
    accessToken: string
  ): Promise<AgentSettingTemplate> {
    const endpoint = this.getAgentSettingTemplateEndpoint(agentType);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get agent setting template for type '${agentType}': ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * Sets an agent setting template for a specific agent type.
   * @param template The agent setting template to set.
   * @param accessToken The access token for authentication.
   * @returns A promise that resolves to the updated agent setting template.
   */
  public async setAgentSettingTemplate(
    template: AgentSettingTemplate,
    accessToken: string
  ): Promise<AgentSettingTemplate> {
    const endpoint = this.getAgentSettingTemplateEndpoint(template.agentType);
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(template),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to set agent setting template for type '${template.agentType}': ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * Retrieves agent settings for a specific agent instance.
   * @param agentInstanceId The agent instance identifier.
   * @param accessToken The access token for authentication.
   * @returns A promise that resolves to the agent settings.
   */
  public async getAgentSettings(
    agentInstanceId: string,
    accessToken: string
  ): Promise<AgentSettings> {
    const endpoint = this.getAgentSettingsEndpoint(agentInstanceId);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get agent settings for instance '${agentInstanceId}': ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }

  /**
   * Sets agent settings for a specific agent instance.
   * @param settings The agent settings to set.
   * @param accessToken The access token for authentication.
   * @returns A promise that resolves to the updated agent settings.
   */
  public async setAgentSettings(
    settings: AgentSettings,
    accessToken: string
  ): Promise<AgentSettings> {
    const endpoint = this.getAgentSettingsEndpoint(settings.agentInstanceId);
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to set agent settings for instance '${settings.agentInstanceId}': ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  }
}
