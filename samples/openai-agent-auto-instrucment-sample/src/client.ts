import { Agent, run } from '@openai/agents';
import { TurnContext } from '@microsoft/agents-hosting';

import { McpToolRegistrationService } from '@microsoft/agents-a365-tooling-extensions-openai';

export interface Client {
  invokeAgent(prompt: string): Promise<string>;
}

const toolService = new McpToolRegistrationService();

export async function getClient(authorization: any, turnContext: TurnContext): Promise<Client> {
  const agent = new Agent({
    // You can customize the agent configuration here if needed
    name: 'OpenAI Agent',
  });

  try {
    await toolService.addMcpToolServers(
      agent,
      process.env.AGENTIC_USER_ID || '',
      process.env.MCP_ENVIRONMENT_ID || "",
      authorization,
      turnContext as any,
      process.env.MCP_AUTH_TOKEN || "",
    );
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
      return result.finalOutput || "Sorry, I couldn't get a response from OpenAI :(";
    } catch (error) {
      console.error('OpenAI agent error:', error);
      const err = error as any;
      return `Error: ${err.message || err}`;
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
