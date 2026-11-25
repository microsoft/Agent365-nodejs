// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { setFlagsFromString } from 'v8';
import { runInNewContext } from 'vm';
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
    closeCalls = 0;
    constructor(readonly options: { name: string; url: string; requestInit: { headers: Record<string, string> } }) {}
    get name(): string {
      return this.options.name;
    }
    async connect(): Promise<void> {}
    async close(): Promise<void> {
      this.closed = true;
      this.closeCalls++;
    }
  }
  return { ...actual, MCPServerStreamableHttp: FakeMCPServerStreamableHttp };
});

interface FakeServer {
  name: string;
  closed: boolean;
  closeCalls: number;
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

// A server the caller adds to the agent itself.
function callerServer(): MCPServer & { closed: boolean } {
  return {
    name: 'caller',
    closed: false,
    async close(): Promise<void> {
      this.closed = true;
    },
  } as unknown as MCPServer & { closed: boolean };
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

// Gives the other finalizers of the same garbage collection time to run.
async function settleFinalizers(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

describe('McpToolRegistrationService - addToolServersToAgent', () => {
  const tokenA = tokenFor('user-a');
  const tokenB = tokenFor('user-b');
  const turnContext = { activity: { channelId: 'msteams' } } as unknown as TurnContext;
  let service: McpToolRegistrationService;
  let discovered: string[];
  let failDiscovery: boolean;
  // Servers discovered for a given token, and discovery calls held until released.
  let serversByToken: Record<string, string[]>;
  let heldDiscovery: Record<string, Promise<void>>;

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
        await heldDiscovery[authToken];
        return (serversByToken[authToken] ?? discovered).map((name) => ({
          mcpServerName: name,
          url: `https://mcp.example.com/${name}`,
          headers: { Authorization: `Bearer ${authToken}` },
        }));
      });
  }

  // Holds discovery for calls with this token until the returned function is called.
  function holdDiscovery(authToken: string): () => void {
    let release: () => void = () => undefined;
    heldDiscovery[authToken] = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  // Loads a second copy of the module, as when both the CommonJS and the ES module build of the
  // package are loaded in one process.
  function loadOtherCopy(): typeof McpToolRegistrationService {
    let otherCopy: typeof McpToolRegistrationService | undefined;
    jest.isolateModules(() => {
      stubDiscovery(require('../../packages/agents-a365-tooling/src').McpToolServerConfigurationService);
      otherCopy = require('../../packages/agents-a365-tooling-extensions-openai/src/McpToolRegistrationService')
        .McpToolRegistrationService;
    });
    return otherCopy as typeof McpToolRegistrationService;
  }

  beforeEach(() => {
    service = new McpToolRegistrationService();
    discovered = ['mail'];
    failDiscovery = false;
    serversByToken = {};
    heldDiscovery = {};
    stubDiscovery(McpToolServerConfigurationService);
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

  it('does not close servers that the agent a clone was made from still uses', async () => {
    const baseAgent = new Agent({ name: 'test-agent', instructions: 'Test.' });

    await addServers(baseAgent, tokenA);
    const baseServers = [...baseAgent.mcpServers];
    discovered = ['calendar'];
    const agentB = await addServers(baseAgent.clone({}), tokenB);

    expect(authorizationByServer(agentB)).toEqual({ calendar: `Bearer ${tokenB}` });
    expect(baseAgent.mcpServers).toEqual(baseServers);
    expect(closedStates(baseServers)).toEqual([false]);
  });

  it('replaces the servers that another copy of the module added', async () => {
    const agent = new Agent({ name: 'test-agent', instructions: 'Test.' });

    await addServers(agent, tokenA);
    const firstServers = [...agent.mcpServers];
    const OtherCopy = loadOtherCopy();
    discovered = ['calendar'];
    await new OtherCopy().addToolServersToAgent(agent, {} as Authorization, 'agentic', turnContext, tokenB);

    expect(authorizationByServer(agent)).toEqual({ calendar: `Bearer ${tokenB}` });
    expect(closedStates(firstServers)).toEqual([true]);
  });

  it('keeps only the servers of the call that finishes last when two calls on one agent overlap', async () => {
    const agent = new Agent({ name: 'test-agent', instructions: 'Test.' });
    serversByToken = { [tokenA]: ['mail'], [tokenB]: ['calendar'] };
    const releaseA = holdDiscovery(tokenA);

    const callA = addServers(agent, tokenA);
    await addServers(agent, tokenB);
    const serversB = [...agent.mcpServers];
    releaseA();
    await callA;

    expect(authorizationByServer(agent)).toEqual({ mail: `Bearer ${tokenA}` });
    expect(closedStates(serversB)).toEqual([true]);
  });

  describe('closeToolServers', () => {
    it('closes the servers created for the agent and removes them from it', async () => {
      const ownServer = callerServer();
      const agent = new Agent({ name: 'test-agent', instructions: 'Test.', mcpServers: [ownServer] });
      discovered = ['mail', 'calendar'];
      await addServers(agent, tokenA);
      const addedServers = agent.mcpServers.slice(1);

      await service.closeToolServers(agent);
      await service.closeToolServers(agent);

      expect(agent.mcpServers).toEqual([ownServer]);
      expect(addedServers.map((server) => (server as unknown as FakeServer).closeCalls)).toEqual([1, 1]);
      expect(ownServer.closed).toBe(false);
    });

    it('only removes the servers a clone shares with the agent it was made from', async () => {
      const baseAgent = new Agent({ name: 'test-agent', instructions: 'Test.' });
      await addServers(baseAgent, tokenA);
      const baseServers = [...baseAgent.mcpServers];
      const clone = baseAgent.clone({});

      await service.closeToolServers(clone);

      expect(clone.mcpServers).toEqual([]);
      expect(baseAgent.mcpServers).toEqual(baseServers);
      expect(closedStates(baseServers)).toEqual([false]);
    });

    it('does nothing for an agent that addToolServersToAgent was not called with', async () => {
      const ownServer = callerServer();
      const agent = new Agent({ name: 'test-agent', instructions: 'Test.', mcpServers: [ownServer] });
      const servers = agent.mcpServers;

      await service.closeToolServers(agent);

      expect(agent.mcpServers).toBe(servers);
      expect(ownServer.closed).toBe(false);
    });

    it('closes the servers created for an agent once the agent is garbage collected', async () => {
      // Registers on a new agent and drops it, keeping only its servers.
      const servers = await (async (): Promise<MCPServer[]> => {
        const agent = new Agent({ name: 'test-agent', instructions: 'Test.' });
        await addServers(agent, tokenA);
        return [...agent.mcpServers];
      })();

      await collectGarbageUntil(() => closedStates(servers).every(Boolean));

      expect(closedStates(servers)).toEqual([true]);
    });

    it('keeps the servers open while a clone of the agent is reachable, and closes them once it is not', async () => {
      let agentCollected = false;
      const agentObserver = new FinalizationRegistry<string>(() => {
        agentCollected = true;
      });
      const holder: { clone?: Agent } = {};
      // Registers on a new agent and drops it, keeping only a clone of it and the servers.
      const servers = await (async (): Promise<MCPServer[]> => {
        const agent = new Agent({ name: 'test-agent', instructions: 'Test.' });
        await addServers(agent, tokenA);
        agentObserver.register(agent, 'agent');
        holder.clone = agent.clone({});
        return [...agent.mcpServers];
      })();

      await collectGarbageUntil(() => agentCollected);
      await settleFinalizers();

      expect(agentCollected).toBe(true);
      expect(closedStates(servers)).toEqual([false]);

      holder.clone = undefined;
      await collectGarbageUntil(() => closedStates(servers).every(Boolean));

      expect(closedStates(servers)).toEqual([true]);
    });

    it('does not close the servers of a later call once the server array of an earlier call is collected', async () => {
      let firstArrayCollected = false;
      const arrayObserver = new FinalizationRegistry<string>(() => {
        firstArrayCollected = true;
      });
      const agent = new Agent({ name: 'test-agent', instructions: 'Test.' });
      await addServers(agent, tokenA);
      arrayObserver.register(agent.mcpServers, 'first array');
      discovered = ['calendar'];
      await addServers(agent, tokenB);
      const secondServers = [...agent.mcpServers];

      await collectGarbageUntil(() => firstArrayCollected);
      await settleFinalizers();

      expect(firstArrayCollected).toBe(true);
      expect(closedStates(secondServers)).toEqual([false]);
    });
  });
});
