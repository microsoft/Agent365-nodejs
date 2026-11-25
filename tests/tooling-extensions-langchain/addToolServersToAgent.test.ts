// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import type { ReactAgent } from 'langchain';
import { McpToolServerConfigurationService, MCPServerConfig } from '../../packages/agents-a365-tooling/src';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';

jest.mock('@langchain/mcp-adapters', () => {
  // Stands in for MultiServerMCPClient: one tool per server, carrying that server's Authorization header.
  class FakeMultiServerMCPClient {
    static instances: FakeMultiServerMCPClient[] = [];
    closed = false;
    constructor(readonly config: { mcpServers: Record<string, { headers: Record<string, string> }> }) {
      FakeMultiServerMCPClient.instances.push(this);
    }
    async getTools(): Promise<object[]> {
      return Object.entries(this.config.mcpServers).map(([server, connection]) => ({
        name: `${server}_tool`,
        authorization: connection.headers.Authorization,
      }));
    }
    async close(): Promise<void> {
      this.closed = true;
    }
  }
  return { MultiServerMCPClient: FakeMultiServerMCPClient };
});

jest.mock('langchain', () => ({
  createAgent: (options: unknown) => ({ options }),
}));

interface FakeTool {
  name: string;
  authorization?: string;
}

function tokenFor(caller: string): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: caller, exp: 4102444800 })}.signature`;
}

function toolsOf(agent: ReactAgent): FakeTool[] {
  return (agent.options.tools ?? []) as unknown as FakeTool[];
}

function clients(): { closed: boolean }[] {
  return (MultiServerMCPClient as unknown as { instances: { closed: boolean }[] }).instances;
}

describe('McpToolRegistrationService - addToolServersToAgent', () => {
  const tokenA = tokenFor('user-a');
  const tokenB = tokenFor('user-b');
  const turnContext = { activity: { channelId: 'msteams' } } as unknown as TurnContext;
  const callerTool = { name: 'caller_tool' };
  let service: McpToolRegistrationService;
  let baseAgent: ReactAgent;
  let discovered: string[];
  let failDiscovery: boolean;

  beforeEach(() => {
    service = new McpToolRegistrationService();
    baseAgent = { options: { tools: [callerTool] } } as unknown as ReactAgent;
    discovered = ['mail'];
    failDiscovery = false;
    clients().length = 0;
    // Mirrors listToolServers attaching the caller's token to each discovered server.
    jest
      .spyOn(
        McpToolServerConfigurationService.prototype as unknown as {
          listToolServers: (...args: unknown[]) => Promise<MCPServerConfig[]>;
        },
        'listToolServers'
      )
      .mockImplementation(async (...args: unknown[]) => {
        if (failDiscovery) {
          throw new Error('discovery failed');
        }
        const authToken = args[3] as string;
        return discovered.map((name) => ({
          mcpServerName: name,
          url: `https://mcp.example.com/${name}`,
          headers: { Authorization: `Bearer ${authToken}` },
        }));
      });
  });

  async function addServers(agent: ReactAgent, authToken: string): Promise<ReactAgent> {
    return service.addToolServersToAgent(agent, {} as Authorization, 'agentic', turnContext, authToken);
  }

  it('drops MCP tools an earlier call added when its agent is passed back in', async () => {
    const agentA = await addServers(baseAgent, tokenA);
    discovered = ['calendar'];
    const agentB = await addServers(agentA, tokenB);

    expect(toolsOf(agentB)).toEqual([callerTool, { name: 'calendar_tool', authorization: `Bearer ${tokenB}` }]);
    expect(clients().map((client) => client.closed)).toEqual([true, false]);
  });

  it('closes the MCP client of an agent from an earlier call when the current call fails', async () => {
    const agentA = await addServers(baseAgent, tokenA);
    failDiscovery = true;

    await expect(addServers(agentA, tokenB)).rejects.toThrow('discovery failed');

    expect(clients().map((client) => client.closed)).toEqual([true]);
  });
});
