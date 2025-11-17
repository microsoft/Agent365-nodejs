// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Agent, run } from '@openai/agents';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

/**
 * OpenAIClient provides integration with OpenAI's API.
 * This client manages OpenAI agent configuration and execution.
 */
export interface OpenAIClient {
  /**
   * Invokes the OpenAI agent with a user prompt.
   * @param prompt - The user's message or query
   * @returns The agent's response
   */
  invokeAgent(prompt: string): Promise<string>;
}

/**
 * Gets or creates an OpenAI client instance.
 * @param authorization - Optional authorization context
 * @param authHandlerName - Name of the authentication handler
 * @param turnContext - The current turn context
 * @returns An OpenAI client instance
 */
export async function getOpenAIClient(
  authorization: Authorization | undefined,
  authHandlerName: string,
  turnContext: TurnContext
): Promise<OpenAIClient> {
  const agent = new Agent({
    name: 'OpenAI Sample Agent',
    instructions: `You are a helpful assistant that helps users with their tasks.
    You can answer questions, provide information, and help with various tasks.
    Be friendly, professional, and helpful in your responses.`,
  });

  // Register MCP tool servers if configured
  try {
    const toolsMode = process.env.TOOLS_MODE || 'MockMCPServer';
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'Development';

    if (toolsMode === 'MockMCPServer' || (isDevelopment && toolsMode !== 'ProductionMCPServer')) {
      console.log('Using mock MCP servers for development');
      // Mock mode - tools can be added here if needed
    } else if (authorization) {
      console.log('Registering production MCP tool servers');
      const toolService = new McpToolRegistrationService();
      await toolService.addToolServersToAgent(
        agent,
        authorization,
        authHandlerName,
        turnContext,
        process.env.MCP_AUTH_TOKEN || ''
      );
    }
  } catch (error) {
    console.warn('Failed to register MCP tool servers:', error);
  }

  return new OpenAIClientImpl(agent);
}

/**
 * Implementation of OpenAIClient that wraps the OpenAI Agent SDK.
 */
class OpenAIClientImpl implements OpenAIClient {
  private agent: Agent;

  constructor(agent: Agent) {
    this.agent = agent;
  }

  /**
   * Invokes the OpenAI agent with a user prompt and returns the response.
   * @param prompt - The user's message or query
   * @returns The agent's response text
   */
  async invokeAgent(prompt: string): Promise<string> {
    try {
      // Connect to MCP servers if available
      await this.connectToServers();

      // Run the agent with the user's prompt
      const result = await run(this.agent, prompt);

      // Return the final output or a default message
      return result.finalOutput || 'I apologize, but I was unable to generate a response.';
    } catch (error) {
      console.error('Error invoking OpenAI agent:', error);
      const err = error as Error;
      throw new Error(`OpenAI agent error: ${err.message || String(err)}`);
    } finally {
      // Always close server connections
      await this.closeServers();
    }
  }

  /**
   * Connects to MCP servers if configured.
   */
  private async connectToServers(): Promise<void> {
    if (this.agent.mcpServers && this.agent.mcpServers.length > 0) {
      console.log(`Connecting to ${this.agent.mcpServers.length} MCP server(s)`);
      for (const server of this.agent.mcpServers) {
        try {
          await server.connect();
        } catch (error) {
          console.warn('Failed to connect to MCP server:', error);
        }
      }
    }
  }

  /**
   * Closes connections to MCP servers.
   */
  private async closeServers(): Promise<void> {
    if (this.agent.mcpServers && this.agent.mcpServers.length > 0) {
      console.log(`Closing ${this.agent.mcpServers.length} MCP server connection(s)`);
      for (const server of this.agent.mcpServers) {
        try {
          await server.close();
        } catch (error) {
          console.warn('Failed to close MCP server connection:', error);
        }
      }
    }
  }
}
