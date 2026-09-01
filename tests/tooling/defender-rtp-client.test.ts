// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, jest } from '@jest/globals';
import {
  DefenderRtpBlockedError,
  DefenderRtpClient,
  DefenderRtpToolEvaluationRequest,
  ToolingConfiguration,
} from '../../packages/agents-a365-tooling/src';

const TEST_ENDPOINT = 'https://defender.example.test/v1/analyze';
const DEFENDER_SCOPE = 'api://customer-app/.default';
const FIXED_NOW = Date.parse('2026-08-31T10:00:00.000Z');

const allowResponse = {
  blockAction: false,
  reasonCode: 200,
  reason: 'Allowed.',
  diagnostics: '',
};
const blockResponse = {
  blockAction: true,
  reasonCode: 403,
  reason: 'Known malicious content detected.',
  diagnostics: 'MaliciousContentPropagation',
};

function createToken(extraClaims: Record<string, unknown> = {}): string {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 3600,
    roles: ['AIAgentsRTP.ToolInvocation'],
    ...extraClaims,
  })).toString('base64url');
  return `e30.${payload}.signature`;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createClient(
  fetchImplementation: jest.MockedFunction<typeof fetch>,
  overrides: ConstructorParameters<typeof ToolingConfiguration>[0] = {},
): DefenderRtpClient {
  const configuration = new ToolingConfiguration({
    isDefenderRtpEnabled: () => true,
    defenderRtpEndpoint: () => TEST_ENDPOINT,
    ...overrides,
  });
  let id = 0;
  return new DefenderRtpClient({
    configProvider: { getConfiguration: () => configuration },
    fetchImplementation,
    idFactory: () => `00000000-0000-0000-0000-${String(++id).padStart(12, '0')}`,
    now: () => FIXED_NOW,
  });
}

const toolRequest: DefenderRtpToolEvaluationRequest = {
  agentId: 'agent-id',
  tenantId: 'tenant-id',
  blueprintId: 'blueprint-id',
  agentName: 'Test Agent',
  sessionId: 'session-id',
  userId: 'user-id',
  requestId: 'tool-call-id',
  toolCallId: 'tool-call-id',
  tool: {
    name: 'send_email',
    toolId: 'mail.send',
    toolType: 'mcp',
    description: 'Sends an email.',
  },
  arguments: {
    to: 'finance-recipient',
    body: 'Quarterly report.',
  },
};

describe('DefenderRtpClient 3P prevention webhook', () => {
  it('does not acquire a token or call Defender when disabled', async () => {
    const fetchImplementation = jest.fn<typeof fetch>();
    const configuration = new ToolingConfiguration({
      isDefenderRtpEnabled: () => false,
    });
    const tokenProvider = jest.fn(async () => createToken());
    const client = new DefenderRtpClient({
      configProvider: { getConfiguration: () => configuration },
      fetchImplementation,
    });
    const execute = jest.fn(async () => 'executed');

    await expect(client.executeTool(
      toolRequest,
      { getAccessToken: tokenProvider, tokenScope: DEFENDER_SCOPE },
      execute,
    )).resolves.toBe('executed');
    expect(tokenProvider).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('does not validate requests when disabled', async () => {
    const configuration = new ToolingConfiguration({
      isDefenderRtpEnabled: () => false,
    });
    const client = new DefenderRtpClient({
      configProvider: { getConfiguration: () => configuration },
    });

    await expect(client.evaluateAgentRequest(
      { messages: [] },
      { accessToken: '' },
    )).resolves.toBeNull();
    await expect(client.enforceToolRequest(
      {} as DefenderRtpToolEvaluationRequest,
      { accessToken: '' },
    )).resolves.toBeNull();
  });

  it('posts Security4AI toolRequest and toolResponse sessions to the configured endpoint', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response(allowResponse),
    );
    const client = createClient(fetchImplementation);
    const execute = jest.fn(async () => ({ sent: true }));

    await expect(client.executeTool(
      toolRequest,
      { accessToken: createToken() },
      execute,
    )).resolves.toEqual({ sent: true });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const [beforeUrl, beforeInit] = fetchImplementation.mock.calls[0];
    expect(beforeUrl).toBe(TEST_ENDPOINT);
    expect(beforeInit?.headers).toEqual({
      Authorization: expect.stringMatching(/^Bearer /),
      'Content-Type': 'application/json',
      'x-ms-correlation-id': 'session-id',
    });
    const before = JSON.parse(beforeInit?.body as string);
    expect(before).toEqual({
      environment: {
        agent: {
          id: {
            a365: {
              id: 'agent-id',
              name: 'Test Agent',
              tenantId: 'tenant-id',
              blueprintId: 'blueprint-id',
            },
            platform: {
              type: 'CUSTOM_BUILT_AGENTS_USING_SDK',
              id: 'agent-id',
              name: 'Test Agent',
            },
          },
          identity: {
            tenantId: 'tenant-id',
            appId: 'agent-id',
          },
          tools: [{
            id: 'mail.send',
            name: 'send_email',
            type: 'mcp',
            description: 'Sends an email.',
          }],
        },
      },
      callerIdentity: {
        tenantId: 'tenant-id',
        appId: 'agent-id',
        userAgent: 'agent365-sdk-agent/custom_built_agents_using_sdk',
        appName: 'user-id',
      },
      sessionContext: { a365: { id: 'session-id' } },
      activities: [{
        toolRequest: {
          context: { a365: {} },
          timestamp: '2026-08-31T10:00:00.000Z',
          toolName: 'send_email',
          toolCallId: 'tool-call-id',
          toolType: 'mcp',
          structuredArguments: {
            to: 'finance-recipient',
            body: 'Quarterly report.',
          },
          toolDescription: 'Sends an email.',
          requestId: 'tool-call-id',
        },
      }],
      evaluationPolicy: {
        type: 'EVALUATION_POLICY_TYPE_BLOCKING',
        threatScenarios: [{ type: 'THREAT_SCENARIO_TYPE_ALL' }],
      },
      timestamp: '2026-08-31T10:00:00.000Z',
    });

    const after = JSON.parse(fetchImplementation.mock.calls[1][1]?.body as string);
    expect(after.activities).toEqual([{
      toolResponse: {
        context: { a365: {} },
        timestamp: '2026-08-31T10:00:00.000Z',
        toolName: 'send_email',
        toolCallId: 'tool-call-id',
        toolType: 'mcp',
        requestId: 'tool-call-id',
        structuredData: { sent: true },
      },
    }]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('builds agentRequest and agentResponse activities', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response(allowResponse),
    );
    const client = createClient(fetchImplementation);
    const authentication = { accessToken: createToken() };
    const base = {
      agentId: 'agent-id',
      tenantId: 'tenant-id',
      sessionId: 'session-id',
      requestId: 'request-id',
      agentName: 'Test Agent',
    };

    await client.evaluateAgentRequest(
      { ...base, messages: ['Hello'] },
      authentication,
    );
    await client.evaluateAgentResponse(
      { ...base, messages: ['Hi there'] },
      authentication,
    );

    const requestSession = JSON.parse(fetchImplementation.mock.calls[0][1]?.body as string);
    expect(requestSession.activities[0]).toEqual({
      agentRequest: {
        context: { a365: {} },
        timestamp: '2026-08-31T10:00:00.000Z',
        messages: [{
          role: 'MESSAGE_ROLE_USER',
          content: [{ text: 'Hello' }],
        }],
        requestId: 'request-id',
      },
    });

    const responseSession = JSON.parse(fetchImplementation.mock.calls[1][1]?.body as string);
    expect(responseSession.activities[0]).toEqual({
      agentResponse: {
        context: { a365: {} },
        timestamp: '2026-08-31T10:00:00.000Z',
        messages: [{
          role: 'MESSAGE_ROLE_ASSISTANT',
          content: [{ text: 'Hi there' }],
        }],
        requestId: 'request-id',
      },
    });
  });

  it('uses an explicit toolCallId across separate before/after evaluations', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response(allowResponse),
    );
    const client = createClient(fetchImplementation);
    const request = {
      ...toolRequest,
      requestId: 'request-id',
      toolCallId: 'shared-tool-call-id',
    };

    await client.evaluateToolRequest(request, { accessToken: createToken() });
    await client.evaluateToolResponse(
      { ...request, result: 'result' },
      { accessToken: createToken() },
    );

    const before = JSON.parse(fetchImplementation.mock.calls[0][1]?.body as string);
    const after = JSON.parse(fetchImplementation.mock.calls[1][1]?.body as string);
    expect(before.activities[0].toolRequest.toolCallId).toBe('shared-tool-call-id');
    expect(before.activities[0].toolRequest.requestId).toBe('request-id');
    expect(after.activities[0].toolResponse.toolCallId).toBe('shared-tool-call-id');
    expect(after.activities[0].toolResponse.requestId).toBe('request-id');
  });

  it('blocks before the tool side effect on a Defender verdict', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response(blockResponse),
    );
    const client = createClient(fetchImplementation);
    const execute = jest.fn(async () => 'must-not-run');

    await expect(client.executeTool(
      toolRequest,
      { accessToken: createToken() },
      execute,
    )).rejects.toMatchObject({
      name: DefenderRtpBlockedError.name,
      evaluation: {
        evaluated: true,
        inspectionPoint: 'before_tool',
        allowed: false,
      },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks a tool response before returning it', async () => {
    const fetchImplementation = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(response(allowResponse))
      .mockResolvedValueOnce(response(blockResponse));
    const client = createClient(fetchImplementation);
    const execute = jest.fn(async () => 'malicious response');

    await expect(client.executeTool(
      toolRequest,
      { accessToken: createToken() },
      execute,
    )).rejects.toMatchObject({
      name: DefenderRtpBlockedError.name,
      evaluation: {
        evaluated: true,
        inspectionPoint: 'after_tool',
        allowed: false,
      },
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('allows on HTTP failure in the default fail-open mode', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response({ error: 'Unavailable' }, 503),
    );
    const client = createClient(fetchImplementation);
    const result = await client.evaluateToolRequest(
      toolRequest,
      { accessToken: createToken() },
    );

    expect(result).toMatchObject({
      allowed: true,
      evaluated: false,
      httpStatus: 503,
      error: 'http 503',
    });
  });

  it('blocks on HTTP failure when fail-closed mode is enabled', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response({ error: 'Unavailable' }, 503),
    );
    const client = createClient(fetchImplementation, {
      defenderRtpFailClosed: () => true,
    });

    await expect(client.enforceToolRequest(
      toolRequest,
      { accessToken: createToken() },
    )).rejects.toMatchObject({
      name: DefenderRtpBlockedError.name,
      evaluation: {
        allowed: false,
        evaluated: false,
        error: 'http 503',
      },
    });
  });

  it('treats a 200 response without blockAction as no verdict', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response({ reason: 'No verdict.' }),
    );
    const client = createClient(fetchImplementation);

    await expect(client.evaluateToolRequest(
      toolRequest,
      { accessToken: createToken() },
    )).resolves.toMatchObject({
      allowed: true,
      evaluated: false,
      error: 'response contained no verdict',
    });
  });

  it('truncates messages and recursively clamps structured tool responses', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response(allowResponse),
    );
    const client = createClient(fetchImplementation, {
      defenderRtpMaxContentCharacters: () => 4,
    });

    await client.evaluateAgentRequest(
      {
        agentId: 'agent-id',
        tenantId: 'tenant-id',
        sessionId: 'session-id',
        messages: ['abcdefgh'],
      },
      { accessToken: createToken() },
    );
    await client.evaluateToolResponse(
      {
        ...toolRequest,
        result: { nested: ['abcdefgh'] },
      },
      { accessToken: createToken() },
    );

    const agentSession = JSON.parse(fetchImplementation.mock.calls[0][1]?.body as string);
    expect(agentSession.activities[0].agentRequest.messages[0].content[0].text)
      .toBe('abcd...[truncated 4 chars]');
    const toolSession = JSON.parse(fetchImplementation.mock.calls[1][1]?.body as string);
    expect(toolSession.activities[0].toolResponse.structuredData)
      .toEqual({ nested: ['abcd...[truncated 4 chars]'] });
  });

  it('performs the FMI three-hop token flow and caches the Defender token', async () => {
    const defenderToken = createToken();
    const fetchImplementation = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: 'fmi-assertion' }))
      .mockResolvedValueOnce(response({ access_token: defenderToken }))
      .mockResolvedValue(response(allowResponse));
    const client = createClient(fetchImplementation);
    const authentication = {
      tenantId: 'tenant-id',
      agentId: 'agent-id',
      blueprintClientId: 'blueprint-id',
      blueprintClientSecret: 'secret',
      tokenScope: DEFENDER_SCOPE,
    };

    await client.evaluateToolRequest(toolRequest, authentication);
    await client.evaluateToolRequest(toolRequest, authentication);

    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    const firstTokenBody = fetchImplementation.mock.calls[0][1]?.body as URLSearchParams;
    expect(firstTokenBody.get('scope')).toBe('api://AzureADTokenExchange/.default');
    expect(firstTokenBody.get('fmi_path')).toBe('agent-id');
    const secondTokenBody = fetchImplementation.mock.calls[1][1]?.body as URLSearchParams;
    expect(secondTokenBody.get('client_id')).toBe('agent-id');
    expect(secondTokenBody.get('client_assertion')).toBe('fmi-assertion');
    expect(secondTokenBody.get('scope')).toBe(DEFENDER_SCOPE);
    expect(fetchImplementation.mock.calls[2][0]).toBe(TEST_ENDPOINT);
    expect(fetchImplementation.mock.calls[3][0]).toBe(TEST_ENDPOINT);
  });

  it('derives the self-audience for an allowlisted client-credentials app', async () => {
    const accessToken = createToken();
    const fetchImplementation = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: accessToken }))
      .mockResolvedValue(response(allowResponse));
    const client = createClient(fetchImplementation);

    await client.evaluateToolRequest(
      toolRequest,
      {
        tenantId: 'tenant-id',
        clientId: 'customer-app',
        clientSecret: 'secret',
      },
    );
    await client.evaluateToolRequest(
      toolRequest,
      {
        tenantId: 'tenant-id',
        clientId: 'customer-app',
        clientSecret: 'secret',
      },
    );

    const tokenBody = fetchImplementation.mock.calls[0][1]?.body as URLSearchParams;
    expect(tokenBody.get('scope')).toBe('api://customer-app/.default');
    expect(fetchImplementation.mock.calls[1][0]).toBe(TEST_ENDPOINT);
    expect(fetchImplementation.mock.calls[2][0]).toBe(TEST_ENDPOINT);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('caches tokens independently for multiple customer apps', async () => {
    const tokenA = createToken({ azp: 'customer-a' });
    const tokenB = createToken({ azp: 'customer-b' });
    const fetchImplementation = jest.fn<typeof fetch>(
      async (url, init) => {
        if (String(url).includes('login.microsoftonline.com')) {
          const body = init?.body as URLSearchParams;
          return response({
            access_token: body.get('client_id') === 'customer-a' ? tokenA : tokenB,
          });
        }
        return response(allowResponse);
      },
    );
    const client = createClient(fetchImplementation);
    const customerA = {
      tenantId: 'tenant-id',
      clientId: 'customer-a',
      clientSecret: 'secret-a',
    };
    const customerB = {
      tenantId: 'tenant-id',
      clientId: 'customer-b',
      clientSecret: 'secret-b',
    };

    await client.evaluateToolRequest(toolRequest, customerA);
    await client.evaluateToolRequest(toolRequest, customerB);
    await client.evaluateToolRequest(toolRequest, customerA);

    const tokenCalls = fetchImplementation.mock.calls
      .filter(([url]) => String(url).includes('login.microsoftonline.com'));
    expect(tokenCalls).toHaveLength(2);
  });

  it('rejects a host token provider without an explicit audience', async () => {
    const client = createClient(jest.fn<typeof fetch>());

    await expect(client.evaluateToolRequest(
      toolRequest,
      {
        getAccessToken: async () => createToken(),
      } as never,
    )).rejects.toThrow('authenticationContext.tokenScope is required.');
  });
});
