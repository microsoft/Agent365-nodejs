// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { Agent, run } from '@openai/agents';
import { TurnContext } from '@microsoft/agents-hosting';
import { Authorization as HostingAuthorization } from '@microsoft/agents-hosting/dist/src/app/auth/authorization';
import { Authorization as RuntimeAuthorization } from '@microsoft/agents-a365-runtime';

import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';
import { LocalMcpToolRegistrationService } from './LocalMcpToolRegistrationService';

export interface Client {
  invokeAgent(prompt: string): Promise<string>;
}

const toolService = new McpToolRegistrationService();
const localMcpService = new LocalMcpToolRegistrationService();

// Adapter to convert HostingAuthorization to RuntimeAuthorization
class AuthorizationAdapter implements RuntimeAuthorization {
  constructor(private hostingAuth: HostingAuthorization) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async exchangeToken(turnContext: any, authHandlerId: string, scopes: string[]): Promise<{ token: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await this.hostingAuth.exchangeToken(turnContext as any, scopes, authHandlerId);
    return { token: response.token || '' };
  }
}

export async function getClient(authorization: HostingAuthorization | undefined, turnContext: TurnContext): Promise<Client> {
  const agent = new Agent({
    // You can customize the agent configuration here if needed
    name: 'OpenAI Agent',
  });

  try {
    const toolsMode = process.env.TOOLS_MODE || 'MockMCPServer';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'Development';

    if (toolsMode === 'MockMCPServer' || (isDevelopment && toolsMode !== 'ProductionMCPServer')) {
      // Use local mock MCP servers
      await localMcpService.addMcpToolServers(
        agent,
        process.env.AGENTIC_USER_ID || 'dev-user-id',
        process.env.MCP_ENVIRONMENT_ID || 'dev-environment',
        turnContext,
        process.env.MCP_AUTH_TOKEN || 'dev-token',
      );
    } else if (authorization) {
      // Use production MCP service (auth required)
      const authAdapter = new AuthorizationAdapter(authorization);
      await toolService.addMcpToolServers(
        agent,
        process.env.AGENTIC_USER_ID || '',
        process.env.MCP_ENVIRONMENT_ID || '',
        authAdapter,
        turnContext as any,
        process.env.MCP_AUTH_TOKEN || '',
      );
    }
  } catch (error) {
    console.warn('Failed to register MCP tool servers:', error);
  }
  return new OpenAIClient(agent);
}

/**
 * OpenAIClient provides an interface to interact with the OpenAI SDK.
 * It maintains agentOptions as an instance field and exposes an invokeAgent method.
 */
class OpenAIClient implements Client {
  agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * Sends a user message to the OpenAI SDK and returns the AI's response.
   * Handles streaming results and error reporting.
   *
   * @param {string} userMessage - The message or prompt to send to OpenAI.
   * @returns {Promise<string>} The response from OpenAI, or an error message if the query fails.
   */
  async invokeAgent(prompt: string): Promise<string> {
    try {
      await this.connectToServers();

      const result = await run(this.agent, prompt);
      return result.finalOutput || 'Sorry, I couldn\'t get a response from OpenAI :(';
    } catch (error) {
      console.error('OpenAI agent error:', error);
      const err = error as Error;
      return `Error: ${err.message || String(err)}`;
    } finally {
      await this.closeServers();
    }
  }

  private async connectToServers(): Promise<void> {
    if (this.agent.mcpServers && this.agent.mcpServers.length > 0) {
      for (const server of this.agent.mcpServers) {
        await server.connect();
      }
    }
  }

  private async closeServers(): Promise<void> {
    if (this.agent.mcpServers && this.agent.mcpServers.length > 0) {
      for (const server of this.agent.mcpServers) {
        await server.close();
      }
    }
  }
}
