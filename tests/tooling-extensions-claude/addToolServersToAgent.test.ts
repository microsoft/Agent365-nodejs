// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TurnContext, Authorization } from '@microsoft/agents-hosting';
import type { McpServerConfig, Options } from '@anthropic-ai/claude-agent-sdk';
import { McpToolServerConfigurationService, MCPServerConfig, McpClientTool } from '../../packages/agents-a365-tooling/src';
import { McpToolRegistrationService } from '../../packages/agents-a365-tooling-extensions-claude/src/McpToolRegistrationService';

function tokenFor(caller: string): string {
  const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: caller, exp: 4102444800 })}.signature`;
}

function authorizationByServer(options: Options): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(options.mcpServers ?? {}).map(([name, config]) => [
      name,
      (config as { headers?: Record<string, string> }).headers?.Authorization,
    ])
  );
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

  function stubDiscovery(configService: typeof McpToolServerConfigurationService): void {
    // Mirrors listToolServers attaching the caller's token to each discovered server.
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
    jest
      .spyOn(configService.prototype, 'getMcpClientTools')
      .mockImplementation(async (serverName: string): Promise<McpClientTool[]> => [
        { name: `${serverName}_tool`, inputSchema: { type: 'object' } },
      ]);
  }

  // Loads a second copy of the module, as when both the CommonJS and the ES module build of the
  // package are loaded in one process.
  function loadOtherCopy(): typeof McpToolRegistrationService {
    let otherCopy: typeof McpToolRegistrationService | undefined;
    jest.isolateModules(() => {
      stubDiscovery(require('../../packages/agents-a365-tooling/src').McpToolServerConfigurationService);
      otherCopy = require('../../packages/agents-a365-tooling-extensions-claude/src/McpToolRegistrationService')
        .McpToolRegistrationService;
    });
    return otherCopy as typeof McpToolRegistrationService;
  }

  // Holds discovery for calls with this token until the returned function is called.
  function holdDiscovery(authToken: string): () => void {
    let release: () => void = () => undefined;
    heldDiscovery[authToken] = new Promise<void>((resolve) => {
      release = resolve;
    });
    return release;
  }

  beforeEach(() => {
    service = new McpToolRegistrationService();
    discovered = ['mail'];
    failDiscovery = false;
    serversByToken = {};
    heldDiscovery = {};
    stubDiscovery(McpToolServerConfigurationService);
  });

  async function addServers(options: Options, authToken: string): Promise<void> {
    await service.addToolServersToAgent(options, {} as Authorization, 'agentic', turnContext, authToken);
  }

  it('replaces the servers and allowed tools an earlier call added to reused options', async () => {
    const options: Options = { allowedTools: ['Read'] };

    await addServers(options, tokenA);
    discovered = ['calendar'];
    await addServers(options, tokenB);

    expect(authorizationByServer(options)).toEqual({ calendar: `Bearer ${tokenB}` });
    expect(options.allowedTools).toEqual(['Read', 'mcp__calendar__calendar_tool']);
  });

  it('removes the servers and allowed tools an earlier call added when the current call fails', async () => {
    const options: Options = { allowedTools: ['Read'] };

    await addServers(options, tokenA);
    failDiscovery = true;
    await expect(addServers(options, tokenB)).rejects.toThrow('discovery failed');

    expect(options.mcpServers).toEqual({});
    expect(options.allowedTools).toEqual(['Read']);
  });

  it('does not change the options a copy was made from', async () => {
    const customServer = { type: 'http', url: 'https://custom.example.com/mcp' } as McpServerConfig;
    const baseOptions: Options = { allowedTools: ['Read'], mcpServers: { custom: customServer } };

    await addServers({ ...baseOptions }, tokenA);
    discovered = ['calendar'];
    const optionsB: Options = { ...baseOptions };
    await addServers(optionsB, tokenB);

    expect(baseOptions).toEqual({ allowedTools: ['Read'], mcpServers: { custom: customServer } });
    expect(authorizationByServer(optionsB)).toEqual({ custom: undefined, calendar: `Bearer ${tokenB}` });
    expect(optionsB.allowedTools).toEqual(['Read', 'mcp__calendar__calendar_tool']);
  });

  it('keeps allowedTools entries for caller servers whose names start with a discovered server name', async () => {
    const archiveServer = { type: 'http', url: 'https://archive.example.com/mcp' } as McpServerConfig;
    const options: Options = {
      allowedTools: ['mcp__mail__archive__search'],
      mcpServers: { mail__archive: archiveServer },
    };

    await addServers(options, tokenA);
    discovered = ['calendar'];
    await addServers(options, tokenB);

    expect(options.allowedTools).toEqual(['mcp__mail__archive__search', 'mcp__calendar__calendar_tool']);
    expect(Object.keys(options.mcpServers ?? {})).toEqual(['mail__archive', 'calendar']);
  });

  it('keeps allowedTools entries the caller added for a discovered server', async () => {
    const options: Options = { allowedTools: ['mcp__mail__mail_tool'] };

    await addServers(options, tokenA);
    discovered = ['calendar'];
    await addServers(options, tokenB);

    expect(options.allowedTools).toEqual(['mcp__mail__mail_tool', 'mcp__calendar__calendar_tool']);
  });

  it('removes the allowedTools entries an earlier call appended after the caller replaced the array', async () => {
    const options: Options = { allowedTools: ['Read'] };

    await addServers(options, tokenA);
    options.allowedTools = [...(options.allowedTools ?? []), 'Write'];
    discovered = ['calendar'];
    await addServers(options, tokenB);

    expect(options.allowedTools).toEqual(['Read', 'Write', 'mcp__calendar__calendar_tool']);
  });

  it('keeps an allowedTools entry the caller added for a discovered tool after the caller deduplicates the array', async () => {
    const options: Options = { allowedTools: ['mcp__mail__mail_tool'] };

    await addServers(options, tokenA);
    options.allowedTools = [...new Set(options.allowedTools)];
    failDiscovery = true;
    await expect(addServers(options, tokenB)).rejects.toThrow('discovery failed');

    expect(options.allowedTools).toEqual(['mcp__mail__mail_tool']);
  });

  it('replaces the servers and allowed tools that another copy of the module added', async () => {
    const options: Options = { allowedTools: ['Read'] };

    await addServers(options, tokenA);
    const OtherCopy = loadOtherCopy();
    discovered = ['calendar'];
    await new OtherCopy().addToolServersToAgent(options, {} as Authorization, 'agentic', turnContext, tokenB);

    expect(authorizationByServer(options)).toEqual({ calendar: `Bearer ${tokenB}` });
    expect(options.allowedTools).toEqual(['Read', 'mcp__calendar__calendar_tool']);
  });

  it('keeps only the servers and allowed tools of the call that finishes last when two calls overlap', async () => {
    const options: Options = { allowedTools: ['Read'] };
    serversByToken = { [tokenA]: ['mail'], [tokenB]: ['calendar'] };
    const releaseA = holdDiscovery(tokenA);

    const callA = addServers(options, tokenA);
    await addServers(options, tokenB);
    releaseA();
    await callA;

    expect(authorizationByServer(options)).toEqual({ mail: `Bearer ${tokenA}` });
    expect(options.allowedTools).toEqual(['Read', 'mcp__mail__mail_tool']);

    serversByToken = {};
    discovered = ['calendar'];
    await addServers(options, tokenB);

    expect(authorizationByServer(options)).toEqual({ calendar: `Bearer ${tokenB}` });
    expect(options.allowedTools).toEqual(['Read', 'mcp__calendar__calendar_tool']);
  });
});
