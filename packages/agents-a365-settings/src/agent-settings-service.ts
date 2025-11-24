// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import axios from 'axios';
import { IAgentSettingsService } from './agent-settings-service.interface';
import { AgentSettingsTemplate, AgentSettings } from './models';

// Default MCP Platform base URL for production
const MCP_PLATFORM_PROD_BASE_URL = 'https://agent365.svc.cloud.microsoft';

// Default timeout for HTTP requests (30 seconds)
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Service for managing agent settings templates and instance settings.
 */
export class AgentSettingsService implements IAgentSettingsService {
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  /**
   * Creates a new instance of the AgentSettingsService.
   * Uses MCP_PLATFORM_ENDPOINT environment variable if set, otherwise defaults to production URL.
   *
   * @throws Error if MCP_PLATFORM_ENDPOINT is set but is not a valid URI.
   */
  constructor() {
    this.baseUrl = this.getMcpPlatformBaseUrl();
    this.requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Gets the settings template for a specific agent type.
   *
   * @param agentType - The agent type identifier.
   * @param authToken - The authentication token for API requests.
   * @returns A promise that resolves to the settings template.
   * @throws Error if the request fails.
   */
  async getSettingsTemplateByAgentType(
    agentType: string,
    authToken: string
  ): Promise<AgentSettingsTemplate> {
    this.validateAuthToken(authToken);
    this.validateAgentType(agentType);

    const url = `${this.baseUrl}/agents/types/${encodeURIComponent(agentType)}/settings/template`;

    try {
      const response = await axios.get<AgentSettingsTemplate>(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        timeout: this.requestTimeoutMs,
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to get settings template for agent type '${agentType}'`);
    }
  }

  /**
   * Sets the settings template for a specific agent type.
   *
   * @param agentType - The agent type identifier.
   * @param template - The settings template to set.
   * @param authToken - The authentication token for API requests.
   * @throws Error if the request fails.
   */
  async setSettingsTemplateByAgentType(
    agentType: string,
    template: AgentSettingsTemplate,
    authToken: string
  ): Promise<void> {
    this.validateAuthToken(authToken);
    this.validateAgentType(agentType);
    this.validateTemplate(template);

    const url = `${this.baseUrl}/agents/types/${encodeURIComponent(agentType)}/settings/template`;

    try {
      await axios.put(url, template, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        timeout: this.requestTimeoutMs,
      });
    } catch (error) {
      throw this.handleError(error, `Failed to set settings template for agent type '${agentType}'`);
    }
  }

  /**
   * Gets the settings for a specific agent instance.
   *
   * @param agentInstanceId - The agent instance identifier.
   * @param authToken - The authentication token for API requests.
   * @returns A promise that resolves to the agent settings.
   * @throws Error if the request fails.
   */
  async getSettingsByAgentInstance(
    agentInstanceId: string,
    authToken: string
  ): Promise<AgentSettings> {
    this.validateAuthToken(authToken);
    this.validateAgentInstanceId(agentInstanceId);

    const url = `${this.baseUrl}/agents/${encodeURIComponent(agentInstanceId)}/settings`;

    try {
      const response = await axios.get<AgentSettings>(url, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        timeout: this.requestTimeoutMs,
      });

      return response.data;
    } catch (error) {
      throw this.handleError(error, `Failed to get settings for agent instance '${agentInstanceId}'`);
    }
  }

  /**
   * Sets the settings for a specific agent instance.
   *
   * @param agentInstanceId - The agent instance identifier.
   * @param settings - The settings to set.
   * @param authToken - The authentication token for API requests.
   * @throws Error if the request fails.
   */
  async setSettingsByAgentInstance(
    agentInstanceId: string,
    settings: AgentSettings,
    authToken: string
  ): Promise<void> {
    this.validateAuthToken(authToken);
    this.validateAgentInstanceId(agentInstanceId);
    this.validateSettings(settings);

    const url = `${this.baseUrl}/agents/${encodeURIComponent(agentInstanceId)}/settings`;

    try {
      await axios.put(url, settings, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        timeout: this.requestTimeoutMs,
      });
    } catch (error) {
      throw this.handleError(error, `Failed to set settings for agent instance '${agentInstanceId}'`);
    }
  }

  /**
   * Gets the base URL for MCP platform, validates and returns it.
   *
   * @returns The base URL for MCP platform.
   * @throws Error if MCP_PLATFORM_ENDPOINT is set but is not a valid URI.
   */
  private getMcpPlatformBaseUrl(): string {
    const endpoint = process.env.MCP_PLATFORM_ENDPOINT;

    if (endpoint) {
      // Validate that the endpoint is a proper URI format
      this.validateUri(endpoint);
      return endpoint.replace(/\/$/, ''); // Remove trailing slash if present
    }

    return MCP_PLATFORM_PROD_BASE_URL;
  }

  /**
   * Validates that a string is a proper URI format.
   *
   * @param uri - The URI string to validate.
   * @throws Error if the URI is not valid.
   */
  private validateUri(uri: string): void {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw new Error(`Invalid MCP_PLATFORM_ENDPOINT: '${uri}' is not a valid URI.`);
    }
    
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error(`Invalid URI scheme: ${url.protocol}. Only http: and https: are supported.`);
    }
  }

  /**
   * Validates the authentication token.
   *
   * @param authToken - The authentication token to validate.
   * @throws Error if the token is invalid or expired.
   */
  private validateAuthToken(authToken: string): void {
    if (!authToken || authToken.trim() === '') {
      throw new Error('Authentication token is required');
    }

    // Parse JWT token (format: header.payload.signature)
    const parts = authToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }

    let payload: { exp?: number };

    try {
      const payloadBase64 = parts[1];
      // Handle URL-safe base64
      const paddedBase64 = payloadBase64.padEnd(
        payloadBase64.length + ((4 - (payloadBase64.length % 4)) % 4),
        '='
      );
      const payloadJson = Buffer.from(
        paddedBase64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch {
      throw new Error('Failed to decode JWT token payload');
    }

    // Check expiration
    if (payload.exp) {
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (payload.exp < currentTimestamp) {
        throw new Error('Authentication token has expired');
      }
    } else {
      throw new Error('Authentication token does not contain expiration claim');
    }
  }

  /**
   * Validates the agent type parameter.
   *
   * @param agentType - The agent type to validate.
   * @throws Error if the agent type is invalid.
   */
  private validateAgentType(agentType: string): void {
    if (!agentType || agentType.trim() === '') {
      throw new Error('Agent type is required');
    }
  }

  /**
   * Validates the agent instance ID parameter.
   *
   * @param agentInstanceId - The agent instance ID to validate.
   * @throws Error if the agent instance ID is invalid.
   */
  private validateAgentInstanceId(agentInstanceId: string): void {
    if (!agentInstanceId || agentInstanceId.trim() === '') {
      throw new Error('Agent instance ID is required');
    }
  }

  /**
   * Validates the settings template.
   *
   * @param template - The template to validate.
   * @throws Error if the template is invalid.
   */
  private validateTemplate(template: AgentSettingsTemplate): void {
    if (!template) {
      throw new Error('Settings template is required');
    }
    if (!template.agentType || template.agentType.trim() === '') {
      throw new Error('Template agent type is required');
    }
    if (!Array.isArray(template.properties)) {
      throw new Error('Template properties must be an array');
    }
  }

  /**
   * Validates the agent settings.
   *
   * @param settings - The settings to validate.
   * @throws Error if the settings are invalid.
   */
  private validateSettings(settings: AgentSettings): void {
    if (!settings) {
      throw new Error('Agent settings is required');
    }
    if (!settings.agentInstanceId || settings.agentInstanceId.trim() === '') {
      throw new Error('Settings agent instance ID is required');
    }
    if (!Array.isArray(settings.properties)) {
      throw new Error('Settings properties must be an array');
    }
  }

  /**
   * Handles errors from HTTP requests.
   *
   * @param error - The error to handle.
   * @param context - Additional context for the error message.
   * @returns A formatted Error object.
   */
  private handleError(error: unknown, context: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const message = error.response?.data?.message || error.message;

      if (status === 401) {
        return new Error(`${context}: Unauthorized - Invalid or expired authentication token`);
      }
      if (status === 403) {
        return new Error(`${context}: Forbidden - Insufficient permissions`);
      }
      if (status === 404) {
        return new Error(`${context}: Not found`);
      }

      return new Error(`${context}: ${status ? `${status} ${statusText}` : message}`);
    }

    if (error instanceof Error) {
      return new Error(`${context}: ${error.message}`);
    }

    return new Error(`${context}: Unknown error`);
  }
}
