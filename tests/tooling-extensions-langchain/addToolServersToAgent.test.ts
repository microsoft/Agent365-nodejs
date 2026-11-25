// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { createAgent, ReactAgent } from 'langchain';
import { McpToolServerConfigurationService, MCPServerConfig } from '../../packages/agents-a365-tooling/src';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService';

jest.mock('@langchain/mcp-adapters', () => {
  // Stands in for MultiServerMCPClient: one tool per server, carrying that server's Authorization header.
  // A server in failingServers fails to connect; like the real client, it throws unless
  // onConnectionError is a function, which then receives the error and the next server is connected.
  class FakeMultiServerMCPClient {
    static instances: FakeMultiServerMCPClient[] = [];
    static failingServers = new Set<string>();
    readonly calls: string[] = [];
    private readonly connected = new Set<string>();
    closed = false;
    constructor(
      readonly config: {
        mcpServers: Record<string, { headers: Record<string, string> }>;
        onConnectionError?: (failure: { serverName: string; error: unknown }) => void;
      }
    ) {
      FakeMultiServerMCPClient.instances.push(this);
    }
    async getTools(): Promise<object[]> {
      const tools: object[] = [];
      for (const [server, connection] of Object.entries(this.config.mcpServers)) {
        if (FakeMultiServerMCPClient.failingServers.has(server)) {
          const error = new Error(`${server} is unavailable`);
          if (!this.config.onConnectionError) {
            throw error;
          }
          this.config.onConnectionError({ serverName: server, error });
          continue;
        }
        this.connected.add(server);
        tools.push({ name: `${server}_tool`, authorization: connection.headers.Authorization });
      }
      return tools;
    }
    async getClient(serverName: string): Promise<object | undefined> {
      if (this.closed) {
        throw new Error('the real client connects again after close()');
      }
      if (!this.connected.has(serverName)) {
        return undefined;
      }
      return {
        transport: {
          terminateSession: async (): Promise<void> => {
            this.calls.push(`terminateSession:${serverName}`);
          },
        },
      };
    }
    async close(): Promise<void> {
      this.calls.push('close');
      this.closed = true;
    }
  }
  return { MultiServerMCPClient: FakeMultiServerMCPClient };
});

interface FakeTool {
  name: string;
  authorization?: string;
}

interface FakeClient {
  calls: string[];
  closed: boolean;
}

function tokenFor(caller: string): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: caller, exp: 4102444800 })}.signature`;
}

function toolsOf(agent: ReactAgent): FakeTool[] {
  return (agent.options.tools ?? []) as unknown as FakeTool[];
}

const fakeClientClass = MultiServerMCPClient as unknown as { instances: FakeClient[]; failingServers: Set<string> };

function clientCalls(): string[][] {
  return fakeClientClass.instances.map((client) => client.calls);
}

// Runs a full garbage collection until the condition holds, without starting Node with --expose-gc.
async function collectGarbageUntil(condition: () => boolean): Promise<void> {
  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  for (let attempt = 0; attempt < 10 && !condition(); attempt++) {
    gc();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
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
    // A real agent, so the tests rely on the options and tools the real ReactAgent keeps.
    baseAgent = createAgent({
      model: new FakeListChatModel({ responses: ['done'] }),
      tools: [callerTool] as unknown as NonNullable<ReactAgent['options']['tools']>,
    }) as unknown as ReactAgent;
    discovered = ['mail'];
    failDiscovery = false;
    fakeClientClass.instances.length = 0;
    fakeClientClass.failingServers.clear();
    stubDiscovery(McpToolServerConfigurationService);
  });

  // Mirrors listToolServers attaching the caller's token to each discovered server.
  function stubDiscovery(configService: typeof McpToolServerConfigurationService): void {
    jest
      .spyOn(
        configService.prototype as unknown as {
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
  }

  // Loads a second copy of the module, as when both the CommonJS and the ES module build of the
  // package are loaded in one process.
  function loadOtherCopy(): typeof McpToolRegistrationService {
    let otherCopy: typeof McpToolRegistrationService | undefined;
    jest.isolateModules(() => {
      stubDiscovery(require('../../packages/agents-a365-tooling/src').McpToolServerConfigurationService);
      otherCopy = require('../../packages/agents-a365-tooling-extensions-langchain/src/McpToolRegistrationService')
        .McpToolRegistrationService;
    });
    return otherCopy as typeof McpToolRegistrationService;
  }

  async function addServers(agent: ReactAgent, authToken: string): Promise<ReactAgent> {
    return service.addToolServersToAgent(agent, {} as Authorization, 'agentic', turnContext, authToken);
  }

  it('drops MCP tools an earlier call added when its agent is passed back in', async () => {
    const agentA = await addServers(baseAgent, tokenA);
    discovered = ['calendar'];
    const agentB = await addServers(agentA, tokenB);

    expect(toolsOf(agentB)).toEqual([callerTool, { name: 'calendar_tool', authorization: `Bearer ${tokenB}` }]);
    expect(clientCalls()).toEqual([['terminateSession:mail', 'close'], []]);
  });

  it('closes the MCP client of an agent from an earlier call when the current call fails', async () => {
    const agentA = await addServers(baseAgent, tokenA);
    failDiscovery = true;

    await expect(addServers(agentA, tokenB)).rejects.toThrow('discovery failed');

    expect(clientCalls()).toEqual([['terminateSession:mail', 'close']]);
  });

  it('ends the sessions and closes the MCP client when a server fails to connect', async () => {
    discovered = ['mail', 'calendar'];
    fakeClientClass.failingServers.add('calendar');

    await expect(addServers(baseAgent, tokenA)).rejects.toThrow('calendar is unavailable');

    expect(clientCalls()).toEqual([['terminateSession:mail', 'close']]);
  });

  it('drops the MCP tools and closes the MCP client that another copy of the module added', async () => {
    const agentA = await addServers(baseAgent, tokenA);
    const OtherCopy = loadOtherCopy();
    discovered = ['calendar'];
    const agentB = await new OtherCopy().addToolServersToAgent(agentA, {} as Authorization, 'agentic', turnContext, tokenB);

    expect(toolsOf(agentB)).toEqual([callerTool, { name: 'calendar_tool', authorization: `Bearer ${tokenB}` }]);
    expect(clientCalls()).toEqual([['terminateSession:mail', 'close'], []]);
  });

  describe('closeToolServers', () => {
    it('ends the session on each MCP server, then closes the MCP client of the agent', async () => {
      discovered = ['mail', 'calendar'];
      const agent = await addServers(baseAgent, tokenA);

      await service.closeToolServers(agent);

      expect(clientCalls()).toEqual([['terminateSession:mail', 'terminateSession:calendar', 'close']]);
    });

    it('closes the MCP client only once', async () => {
      const agent = await addServers(baseAgent, tokenA);

      await service.closeToolServers(agent);
      await service.closeToolServers(agent);
      discovered = ['calendar'];
      await addServers(agent, tokenB);

      expect(clientCalls()).toEqual([['terminateSession:mail', 'close'], []]);
    });

    it('does nothing for an agent that addToolServersToAgent did not return', async () => {
      await addServers(baseAgent, tokenA);

      await service.closeToolServers(baseAgent);

      expect(clientCalls()).toEqual([[]]);
    });

    it('closes the MCP client of a returned agent once the agent is garbage collected', async () => {
      // Registers on a new agent and drops it, so nothing references the returned agent.
      await (async (): Promise<void> => {
        await addServers(baseAgent, tokenA);
      })();

      await collectGarbageUntil(() => fakeClientClass.instances[0]?.closed === true);

      expect(clientCalls()).toEqual([['terminateSession:mail', 'close']]);
    });
  });
});
