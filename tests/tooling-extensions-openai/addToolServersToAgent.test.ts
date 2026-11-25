// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { Agent, MCPServer } from '@openai/agents';
import { McpToolServerConfigurationService, MCPServerConfig } from '../../packages/agents-a365-tooling/src';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService';

jest.mock('@openai/agents', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@openai/agents');
  // Stands in for MCPServerStreamableHttp and keeps the options it was created with.
  class FakeMCPServerStreamableHttp {
    closed = false;
    constructor(readonly options: { name: string; url: string; requestInit: { headers: Record<string, string> } }) {}
    get name(): string {
      return this.options.name;
    }
    async connect(): Promise<void> {}
    async close(): Promise<void> {
      this.closed = true;
    }
  }
  return { ...actual, MCPServerStreamableHttp: FakeMCPServerStreamableHttp };
});

interface FakeServer {
  name: string;
  closed: boolean;
  options: { requestInit: { headers: Record<string, string> } };
}

function tokenFor(caller: string): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: caller, exp: 4102444800 })}.signature`;
}

function authorizationByServer(agent: Agent): Record<string, string> {
  return Object.fromEntries(
    agent.mcpServers.map((server) => {
      const fake = server as unknown as FakeServer;
      return [fake.name, fake.options.requestInit.headers.Authorization];
    })
  );
}

function closedStates(servers: MCPServer[]): boolean[] {
  return servers.map((server) => (server as unknown as FakeServer).closed);
}

describe('McpToolRegistrationService - addToolServersToAgent', () => {
  const tokenA = tokenFor('user-a');
  const tokenB = tokenFor('user-b');
  const turnContext = { activity: { channelId: 'msteams' } } as unknown as TurnContext;
  let service: McpToolRegistrationService;
  let discovered: string[];
  let failDiscovery: boolean;

  beforeEach(() => {
    service = new McpToolRegistrationService();
    discovered = ['mail'];
    failDiscovery = false;
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

  async function addServers(agent: Agent, authToken: string): Promise<Agent> {
    return service.addToolServersToAgent(agent, {} as Authorization, 'agentic', turnContext, authToken);
  }

  it('replaces the servers an earlier call added to a reused agent', async () => {
    const agent = new Agent({ name: 'test-agent', instructions: 'Test.' });

    await addServers(agent, tokenA);
    const firstServers = [...agent.mcpServers];
    discovered = ['calendar'];
    await addServers(agent, tokenB);

    expect(authorizationByServer(agent)).toEqual({ calendar: `Bearer ${tokenB}` });
    expect(closedStates(firstServers)).toEqual([true]);
  });

  it('removes the servers an earlier call added when the current call fails', async () => {
    const agent = new Agent({ name: 'test-agent', instructions: 'Test.' });

    await addServers(agent, tokenA);
    const firstServers = [...agent.mcpServers];
    failDiscovery = true;
    await expect(addServers(agent, tokenB)).rejects.toThrow('discovery failed');

    expect(agent.mcpServers).toEqual([]);
    expect(closedStates(firstServers)).toEqual([true]);
  });

  it('keeps servers the caller added to the agent', async () => {
    const callerServer = { name: 'caller', close: async (): Promise<void> => undefined } as unknown as MCPServer;
    const agent = new Agent({ name: 'test-agent', instructions: 'Test.', mcpServers: [callerServer] });

    await addServers(agent, tokenA);
    await addServers(agent, tokenB);

    expect(agent.mcpServers).toHaveLength(2);
    expect(agent.mcpServers[0]).toBe(callerServer);
    expect(authorizationByServer(agent.clone({ mcpServers: agent.mcpServers.slice(1) }))).toEqual({
      mail: `Bearer ${tokenB}`,
    });
  });

  it('does not change the server list of the agent a clone was made from', async () => {
    const baseAgent = new Agent({ name: 'test-agent', instructions: 'Test.' });

    await addServers(baseAgent.clone({}), tokenA);
    discovered = ['calendar'];
    const agentB = await addServers(baseAgent.clone({}), tokenB);

    expect(baseAgent.mcpServers).toEqual([]);
    expect(authorizationByServer(agentB)).toEqual({ calendar: `Bearer ${tokenB}` });
  });
});
