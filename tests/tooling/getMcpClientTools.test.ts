// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpToolServerConfigurationService, MCPServerConfig } from '../../packages/agents-a365-tooling/src';

jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => {
  // Records the calls made on it, including the ones the client makes through it.
  class FakeStreamableHTTPClientTransport {
    static instances: FakeStreamableHTTPClientTransport[] = [];
    static terminateError: Error | undefined;
    readonly calls: string[] = [];
    constructor() {
      FakeStreamableHTTPClientTransport.instances.push(this);
    }
    async terminateSession(): Promise<void> {
      this.calls.push('terminateSession');
      if (FakeStreamableHTTPClientTransport.terminateError) {
        throw FakeStreamableHTTPClientTransport.terminateError;
      }
    }
  }
  return { StreamableHTTPClientTransport: FakeStreamableHTTPClientTransport };
});

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  class FakeClient {
    static listToolsError: Error | undefined;
    private transport?: { calls: string[] };
    async connect(transport: { calls: string[] }): Promise<void> {
      this.transport = transport;
      transport.calls.push('connect');
    }
    async listTools(): Promise<{ tools: object[] }> {
      this.transport?.calls.push('listTools');
      if (FakeClient.listToolsError) {
        throw FakeClient.listToolsError;
      }
      return { tools: [{ name: 'send_mail', inputSchema: { type: 'object' } }] };
    }
    async close(): Promise<void> {
      this.transport?.calls.push('close');
    }
  }
  return { Client: FakeClient };
});

interface FakeTransportClass {
  instances: { calls: string[] }[];
  terminateError: Error | undefined;
}

describe('McpToolServerConfigurationService - getMcpClientTools', () => {
  const transports = StreamableHTTPClientTransport as unknown as FakeTransportClass;
  const clients = Client as unknown as { listToolsError: Error | undefined };
  const serverConfig: MCPServerConfig = {
    mcpServerName: 'mail',
    url: 'https://mcp.example.com/mail',
    headers: { Authorization: 'Bearer token' },
  };
  let service: McpToolServerConfigurationService;

  beforeEach(() => {
    service = new McpToolServerConfigurationService();
    transports.instances.length = 0;
    transports.terminateError = undefined;
    clients.listToolsError = undefined;
  });

  function transportCalls(): string[][] {
    return transports.instances.map((transport) => transport.calls);
  }

  it('ends the server session before closing the client', async () => {
    const tools = await service.getMcpClientTools('mail', serverConfig);

    expect(tools).toEqual([{ name: 'send_mail', inputSchema: { type: 'object' } }]);
    expect(transportCalls()).toEqual([['connect', 'listTools', 'terminateSession', 'close']]);
  });

  it('closes the client and returns the tools when ending the session fails', async () => {
    transports.terminateError = new Error('session not found');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const tools = await service.getMcpClientTools('mail', serverConfig);

    expect(tools).toHaveLength(1);
    expect(transportCalls()).toEqual([['connect', 'listTools', 'terminateSession', 'close']]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('session not found'));
  });

  it('ends the server session and closes the client when listing tools fails', async () => {
    clients.listToolsError = new Error('list failed');

    await expect(service.getMcpClientTools('mail', serverConfig)).rejects.toThrow('list failed');

    expect(transportCalls()).toEqual([['connect', 'listTools', 'terminateSession', 'close']]);
  });
});
