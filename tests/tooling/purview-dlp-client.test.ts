// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it, jest } from '@jest/globals';
import {
  PurviewDlpAuthenticationContext,
  PurviewDlpBlockedError,
  PurviewDlpClient,
  PurviewDlpEvaluationRequest,
  ToolingConfiguration,
} from '../../packages/agents-a365-tooling/src';

const TEST_GRAPH_BASE = 'https://graph.example.test/beta';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
const FIXED_NOW = Date.parse('2026-08-31T10:00:00.000Z');
const ME_ENDPOINT = `${TEST_GRAPH_BASE}/me/dataSecurityAndGovernance/processContent`;
const SPONSOR_ENDPOINT =
  `${TEST_GRAPH_BASE}/users/sponsor-user-id/dataSecurityAndGovernance/processContent`;

const allowResponse = {
  policyActions: [],
  processingErrors: [],
  protectionScopeState: 'notModified',
};
const blockResponse = {
  policyActions: [
    {
      '@odata.type': 'microsoft.graph.restrictAccessAction',
      restrictionAction: 'Block',
    },
  ],
  processingErrors: [],
  protectionScopeState: 'modified',
};

function createToken(extraClaims: Record<string, unknown> = {}): string {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 3600,
    roles: ['Content.Process.All'],
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
): PurviewDlpClient {
  const configuration = new ToolingConfiguration({
    isPurviewDlpEnabled: () => true,
    purviewDlpGraphBaseUrl: () => TEST_GRAPH_BASE,
    ...overrides,
  });
  let id = 0;
  return new PurviewDlpClient({
    configProvider: { getConfiguration: () => configuration },
    fetchImplementation,
    idFactory: () => `00000000-0000-0000-0000-${String(++id).padStart(12, '0')}`,
    now: () => FIXED_NOW,
  });
}

const promptRequest: PurviewDlpEvaluationRequest = {
  agentId: 'agent-id',
  tenantId: 'tenant-id',
  blueprintId: 'blueprint-id',
  applicationId: 'app-id',
  agentName: 'Test Agent',
  sessionId: 'session-id',
  messages: ['My credit card is 4111 1111 1111 1111'],
};

describe('PurviewDlpClient processContent gate', () => {
  it('does not acquire a token or call Graph when disabled', async () => {
    const fetchImplementation = jest.fn<typeof fetch>();
    const configuration = new ToolingConfiguration({ isPurviewDlpEnabled: () => false });
    const client = new PurviewDlpClient({
      configProvider: { getConfiguration: () => configuration },
      fetchImplementation,
    });
    const generate = jest.fn(async () => 'answer');

    await expect(client.evaluatePrompt(promptRequest, { accessToken: '' })).resolves.toBeNull();
    await expect(client.guardTurn(promptRequest, { accessToken: '' }, generate))
      .resolves.toBe('answer');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('validates messages when enabled', async () => {
    const client = createClient(jest.fn<typeof fetch>());

    await expect(client.evaluatePrompt(
      { ...promptRequest, messages: [] },
      { accessToken: createToken() },
    )).rejects.toThrow('messages must contain at least one non-empty string.');
  });

  it('posts an uploadText processContent request as /me for a delegated token', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(allowResponse));
    const client = createClient(fetchImplementation);

    const result = await client.evaluatePrompt(promptRequest, { accessToken: createToken() });

    expect(result).toMatchObject({
      allowed: true,
      evaluated: true,
      activity: 'uploadText',
      httpStatus: 200,
      protectionScopeState: 'notModified',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0];
    expect(url).toBe(ME_ENDPOINT);
    expect(init?.headers).toEqual({
      Authorization: expect.stringMatching(/^Bearer /),
      'Content-Type': 'application/json',
      'Client-Request-Id': 'session-id',
    });
    const body = JSON.parse(init?.body as string);
    expect(body.contentToProcess.activityMetadata).toEqual({ activity: 'uploadText' });
    expect(body.contentToProcess.protectedAppMetadata.applicationLocation).toEqual({
      '@odata.type': 'microsoft.graph.policyLocationApplication',
      value: 'app-id',
    });
    const entry = body.contentToProcess.contentEntries[0];
    expect(entry.content).toEqual({
      '@odata.type': 'microsoft.graph.textContent',
      data: 'My credit card is 4111 1111 1111 1111',
    });
    expect(entry.name).toBe('Test Agent uploadText');
    expect(entry.sequenceNumber).toBe(0);
    expect(entry.isTruncated).toBe(false);
    expect(entry.correlationId).toBe('session-id');
    expect(entry.agents[0]).toEqual({
      '@odata.type': 'microsoft.graph.aiAgentInfo',
      blueprintId: 'blueprint-id',
      identifier: 'agent-id',
      name: 'Test Agent',
      version: '1.0',
    });
  });

  it('posts a downloadText processContent request for the response gate', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(allowResponse));
    const client = createClient(fetchImplementation);

    await client.evaluateResponse(
      { ...promptRequest, messages: ['the model answer'] },
      { accessToken: createToken() },
    );

    const body = JSON.parse(fetchImplementation.mock.calls[0][1]?.body as string);
    expect(body.contentToProcess.activityMetadata).toEqual({ activity: 'downloadText' });
    const entry = body.contentToProcess.contentEntries[0];
    expect(entry.sequenceNumber).toBe(1);
    expect(entry.name).toBe('Test Agent downloadText');
    expect(entry.content.data).toBe('the model answer');
  });

  it('blocks on a restrictAccess block policy action (case-insensitive)', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(blockResponse));
    const client = createClient(fetchImplementation);

    await expect(client.evaluatePrompt(promptRequest, { accessToken: createToken() }))
      .resolves.toMatchObject({
        allowed: false,
        evaluated: true,
        decision: { blockAction: true, restrictionAction: 'Block', actionCount: 1 },
      });

    await expect(client.enforcePrompt(promptRequest, { accessToken: createToken() }))
      .rejects.toMatchObject({
        name: PurviewDlpBlockedError.name,
        evaluation: { allowed: false, activity: 'uploadText' },
      });
  });

  it('guardTurn evaluates both gates and returns the response', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(allowResponse));
    const client = createClient(fetchImplementation);
    const generate = jest.fn(async () => 'the model answer');

    await expect(client.guardTurn(promptRequest, { accessToken: createToken() }, generate))
      .resolves.toBe('the model answer');

    expect(generate).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImplementation.mock.calls[0][1]?.body as string)
      .contentToProcess.activityMetadata).toEqual({ activity: 'uploadText' });
    expect(JSON.parse(fetchImplementation.mock.calls[1][1]?.body as string)
      .contentToProcess.activityMetadata).toEqual({ activity: 'downloadText' });
  });

  it('guardTurn blocks before generating when the prompt is blocked', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(blockResponse));
    const client = createClient(fetchImplementation);
    const generate = jest.fn(async () => 'must-not-run');

    await expect(client.guardTurn(promptRequest, { accessToken: createToken() }, generate))
      .rejects.toMatchObject({ name: PurviewDlpBlockedError.name });
    expect(generate).not.toHaveBeenCalled();
  });

  it('allows on HTTP failure in the default fail-open mode', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response({ error: 'Unavailable' }, 503),
    );
    const client = createClient(fetchImplementation);

    await expect(client.evaluatePrompt(promptRequest, { accessToken: createToken() }))
      .resolves.toMatchObject({
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
      purviewDlpFailClosed: () => true,
    });

    await expect(client.enforcePrompt(promptRequest, { accessToken: createToken() }))
      .rejects.toMatchObject({
        name: PurviewDlpBlockedError.name,
        evaluation: { allowed: false, evaluated: false, error: 'http 503' },
      });
  });

  it('treats processingErrors as an unevaluated failure', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => response({ policyActions: [], processingErrors: [{ code: 'BadRequest' }] }),
    );
    const client = createClient(fetchImplementation);

    await expect(client.evaluatePrompt(promptRequest, { accessToken: createToken() }))
      .resolves.toMatchObject({
        allowed: true,
        evaluated: false,
        error: 'processing errors: 1',
      });
  });

  it('treats a 202 response as allowed with no verdict', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(
      async () => new Response(null, { status: 202 }),
    );
    const client = createClient(fetchImplementation);

    await expect(client.evaluatePrompt(promptRequest, { accessToken: createToken() }))
      .resolves.toMatchObject({
        allowed: true,
        evaluated: true,
        httpStatus: 202,
      });
  });

  it('truncates content and sets isTruncated', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(allowResponse));
    const client = createClient(fetchImplementation, {
      purviewDlpMaxContentCharacters: () => 4,
    });

    await client.evaluatePrompt(
      { ...promptRequest, messages: ['abcdefgh'] },
      { accessToken: createToken() },
    );

    const entry = JSON.parse(fetchImplementation.mock.calls[0][1]?.body as string)
      .contentToProcess.contentEntries[0];
    expect(entry.content.data).toBe('abcd');
    expect(entry.isTruncated).toBe(true);
  });

  it('performs the FMI three-hop flow, targets /users/{sponsor}, and caches the Graph token',
    async () => {
      const graphToken = createToken();
      const fetchImplementation = jest.fn<typeof fetch>()
        .mockResolvedValueOnce(response({ access_token: 'fmi-assertion' }))
        .mockResolvedValueOnce(response({ access_token: graphToken }))
        .mockResolvedValue(response(allowResponse));
      const client = createClient(fetchImplementation);
      const authentication: PurviewDlpAuthenticationContext = {
        tenantId: 'tenant-id',
        agentId: 'agent-id',
        blueprintClientId: 'blueprint-id',
        blueprintClientSecret: 'secret',
        sponsorUserId: 'sponsor-user-id',
      };

      await client.evaluatePrompt(promptRequest, authentication);
      await client.evaluatePrompt(promptRequest, authentication);

      expect(fetchImplementation).toHaveBeenCalledTimes(4);
      const hop1 = fetchImplementation.mock.calls[0][1]?.body as URLSearchParams;
      expect(hop1.get('scope')).toBe('api://AzureADTokenExchange/.default');
      expect(hop1.get('fmi_path')).toBe('agent-id');
      const hop2 = fetchImplementation.mock.calls[1][1]?.body as URLSearchParams;
      expect(hop2.get('client_id')).toBe('agent-id');
      expect(hop2.get('client_assertion')).toBe('fmi-assertion');
      expect(hop2.get('scope')).toBe(GRAPH_SCOPE);
      expect(fetchImplementation.mock.calls[2][0]).toBe(SPONSOR_ENDPOINT);
      expect(fetchImplementation.mock.calls[3][0]).toBe(SPONSOR_ENDPOINT);
    });

  it('uses client credentials against /users/{sponsor} with the Graph scope', async () => {
    const graphToken = createToken();
    const fetchImplementation = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: graphToken }))
      .mockResolvedValue(response(allowResponse));
    const client = createClient(fetchImplementation);

    await client.evaluatePrompt(promptRequest, {
      tenantId: 'tenant-id',
      clientId: 'customer-app',
      clientSecret: 'secret',
      sponsorUserId: 'sponsor-user-id',
    });

    const tokenBody = fetchImplementation.mock.calls[0][1]?.body as URLSearchParams;
    expect(tokenBody.get('grant_type')).toBe('client_credentials');
    expect(tokenBody.get('scope')).toBe(GRAPH_SCOPE);
    expect(fetchImplementation.mock.calls[1][0]).toBe(SPONSOR_ENDPOINT);
  });

  it('requires a sponsorUserId for app-only client credentials', async () => {
    const client = createClient(jest.fn<typeof fetch>());

    await expect(client.evaluatePrompt(
      promptRequest,
      {
        tenantId: 'tenant-id',
        clientId: 'customer-app',
        clientSecret: 'secret',
      } as never,
    )).rejects.toThrow('authenticationContext.sponsorUserId is required.');
  });

  it('uses /users/{sponsor} when an access token carries a sponsorUserId', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(allowResponse));
    const client = createClient(fetchImplementation);

    await client.evaluatePrompt(promptRequest, {
      accessToken: createToken(),
      sponsorUserId: 'sponsor-user-id',
    });

    expect(fetchImplementation.mock.calls[0][0]).toBe(SPONSOR_ENDPOINT);
  });

  it('exchanges the agentic user token and targets /me for a delegated context', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(allowResponse));
    const client = createClient(fetchImplementation);
    const exchangeToken =
      jest.fn<(context: unknown, handler: string, options: unknown) => Promise<{ token: string }>>(
        async () => ({ token: createToken() }),
      );
    const authentication = {
      authorization: { exchangeToken },
      authHandlerName: 'agentic',
      turnContext: { activity: {} },
    } as unknown as PurviewDlpAuthenticationContext;

    await client.evaluatePrompt(promptRequest, authentication);

    expect(exchangeToken).toHaveBeenCalledTimes(1);
    expect(exchangeToken).toHaveBeenCalledWith(
      { activity: {} },
      'agentic',
      { scopes: [GRAPH_SCOPE] },
    );
    expect(fetchImplementation.mock.calls[0][0]).toBe(ME_ENDPOINT);
  });

  it('defaults a host token provider to the Graph scope and targets /me', async () => {
    const fetchImplementation = jest.fn<typeof fetch>(async () => response(allowResponse));
    const client = createClient(fetchImplementation);
    const getAccessToken = jest.fn<(scope: string) => Promise<string>>(async () => createToken());

    await client.evaluatePrompt(promptRequest, { getAccessToken } as never);

    expect(getAccessToken).toHaveBeenCalledWith(GRAPH_SCOPE);
    expect(fetchImplementation.mock.calls[0][0]).toBe(ME_ENDPOINT);
  });
});
