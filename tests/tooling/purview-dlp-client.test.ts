// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  PurviewDlpAgentContext,
  PurviewDlpAgenticUserConnection,
  PurviewDlpClient,
  PurviewDlpTokenResolver,
  PurviewDlpTokenResolvers,
  ToolingConfigurationOptions,
} from '../../packages/agents-a365-tooling/src';
import {
  AGENTIC_USER_ID,
  AGENT_ID,
  BLOCK_ACTION,
  BLUEPRINT_ID,
  GRAPH_BASE_URL,
  GRAPH_SCOPE,
  PROCESS_CONTENT_URL,
  PURVIEW_ENVIRONMENT_VARIABLES,
  TENANT_ID,
  createGraphToken,
  fakeGraph,
  json,
  processed,
  purviewConfiguration,
  sentText,
  waitForAbort,
} from './fixtures/purview';

/* eslint-disable @typescript-eslint/no-explicit-any */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CARD_TEXT = 'Please charge my card 4111 1111 1111 1111 for the hotel.';

const AGENT: PurviewDlpAgentContext = {
  agentId: AGENT_ID,
  tenantId: TENANT_ID,
  agenticUserId: AGENTIC_USER_ID,
  blueprintId: BLUEPRINT_ID,
  agentName: 'SampleAgent',
  sessionId: 'conversation-1',
  sequence: 3,
};

/** A host token resolver (never cached by the client) that records each request. */
function hostTokens(token = createGraphToken(), userId?: string): {
  resolve: PurviewDlpTokenResolver;
  requests: Array<{ agent: PurviewDlpAgentContext; scopes: string[] }>;
} {
  const requests: Array<{ agent: PurviewDlpAgentContext; scopes: string[] }> = [];
  return {
    requests,
    resolve: async (agent, scopes) => {
      requests.push({ agent, scopes });
      return { accessToken: token, ...(userId ? { userId } : {}) };
    },
  };
}

/** A fake Agents SDK connection that records each agentic user token request. */
function agenticConnection(issue: () => string | Promise<string> = () => createGraphToken()): {
  connection: PurviewDlpAgenticUserConnection;
  requests: string[];
} {
  const requests: string[] = [];
  return {
    requests,
    connection: {
      getAgenticUserToken: async (tenantId, agentId, agenticUserId, scopes) => {
        requests.push(`${tenantId}|${agentId}|${agenticUserId}|${scopes.join(' ')}`);
        return await issue();
      },
    },
  };
}

function create(
  respond: (body: Record<string, any>, init: RequestInit, url: string) => Response | Promise<Response>,
  overrides: ToolingConfigurationOptions = {},
): { client: PurviewDlpClient; calls: ReturnType<typeof fakeGraph>['calls']; tokens: ReturnType<typeof hostTokens> } {
  const graph = fakeGraph(respond);
  const client = new PurviewDlpClient({ configProvider: purviewConfiguration(overrides), fetchImplementation: graph.fetch });
  return { client, calls: graph.calls, tokens: hostTokens() };
}

const allow = (): Response => processed();
const block = (): Response => processed([BLOCK_ACTION]);

describe('PurviewDlpClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of PURVIEW_ENVIRONMENT_VARIABLES) delete process.env[name];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('requests', () => {
    it('returns null without calls when disabled', async () => {
      const { client, calls, tokens } = create(block, { isPurviewDlpEnabled: () => false });

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result).toBeNull();
      expect(calls).toHaveLength(0);
      expect(tokens.requests).toHaveLength(0);
    });

    it.each(['', '   ', '\n\t'])('returns null without calls for text without content (%j)', async (text) => {
      const { client, calls, tokens } = create(block);

      expect(await client.evaluate('uploadText', text, AGENT, tokens.resolve)).toBeNull();
      expect(calls).toHaveLength(0);
      expect(tokens.requests).toHaveLength(0);
    });

    it('sends the prompt to processContent as the agent\'s conversation message', async () => {
      const { client, calls, tokens } = create(allow);
      const token = createGraphToken();
      const resolve: PurviewDlpTokenResolver = async () => ({ accessToken: token });

      const result = await client.evaluate('uploadText', 'Find flights to Paris', AGENT, resolve);

      expect(tokens.requests).toHaveLength(0);
      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call.url).toBe(PROCESS_CONTENT_URL);
      expect(call.method).toBe('POST');
      expect(call.authorization).toBe(`Bearer ${token}`);
      expect(call.contentType).toBe('application/json');
      expect(call.redirect).toBe('error');
      expect(call.clientRequestId).toMatch(UUID);
      expect(result?.correlationId).toBe(call.clientRequestId);
      const request = call.body.contentToProcess;
      const entry = request.contentEntries[0];
      expect(request.contentEntries).toHaveLength(1);
      expect(entry).toEqual({
        '@odata.type': 'microsoft.graph.processConversationMetadata',
        identifier: call.clientRequestId,
        content: { '@odata.type': 'microsoft.graph.textContent', data: 'Find flights to Paris' },
        name: 'SampleAgent uploadText',
        correlationId: 'conversation-1',
        sequenceNumber: 3,
        isTruncated: false,
        createdDateTime: expect.stringMatching(/Z$/),
        modifiedDateTime: entry.createdDateTime,
        contentCategory: 'ai',
        agents: [{
          '@odata.type': 'microsoft.graph.aiAgentInfo',
          identifier: AGENT_ID,
          blueprintId: BLUEPRINT_ID,
          name: 'SampleAgent',
          version: '1.0',
        }],
      });
      expect(Number.isNaN(Date.parse(entry.createdDateTime))).toBe(false);
      expect(request.activityMetadata).toEqual({ activity: 'uploadText' });
      expect(request.integratedAppMetadata).toEqual({ name: 'SampleAgent', version: '1.0' });
      expect(request.protectedAppMetadata).toEqual({
        name: 'SampleAgent',
        version: '1.0',
        applicationLocation: { '@odata.type': 'microsoft.graph.policyLocationApplication', value: BLUEPRINT_ID },
      });
    });

    it('sends a new client-request-id with every call', async () => {
      const { client, calls, tokens } = create(allow);

      const first = await client.evaluate('uploadText', 'one', AGENT, tokens.resolve);
      const second = await client.evaluate('uploadText', 'two', AGENT, tokens.resolve);

      expect(calls[0].clientRequestId).not.toBe(calls[1].clientRequestId);
      expect([first?.correlationId, second?.correlationId]).toEqual(calls.map((call) => call.clientRequestId));
    });

    it('sends the reply as downloadText', async () => {
      const { client, calls, tokens } = create(allow);

      const result = await client.evaluate('downloadText', 'Here are three flights.', { ...AGENT, sequence: 9 }, tokens.resolve);

      expect(result?.activity).toBe('downloadText');
      expect(calls[0].body.contentToProcess.activityMetadata).toEqual({ activity: 'downloadText' });
      expect(calls[0].body.contentToProcess.contentEntries[0].name).toBe('SampleAgent downloadText');
      expect(calls[0].body.contentToProcess.contentEntries[0].sequenceNumber).toBe(9);
    });

    it('scopes the application location to the blueprint, then the agent, unless an application id is given', async () => {
      const { client, calls, tokens } = create(allow);
      const location = (index: number): string => calls[index].body.contentToProcess.protectedAppMetadata.applicationLocation.value;

      await client.evaluate('uploadText', 'one', AGENT, tokens.resolve);
      await client.evaluate('uploadText', 'two', { agentId: AGENT_ID, sessionId: 's-1' }, tokens.resolve);
      await client.evaluate('uploadText', 'three', { ...AGENT, applicationId: 'application-id' }, tokens.resolve);

      expect([location(0), location(1), location(2)]).toEqual([BLUEPRINT_ID, AGENT_ID, 'application-id']);
    });

    it('names an unnamed agent by its id, leaves out an unknown blueprint and defaults the version', async () => {
      const { client, calls, tokens } = create(allow);

      await client.evaluate('uploadText', 'hello', { agentId: ` ${AGENT_ID} `, sessionId: 's-1', agentName: ' ' }, tokens.resolve);

      const request = calls[0].body.contentToProcess;
      expect(request.contentEntries[0].name).toBe(`${AGENT_ID} uploadText`);
      expect(request.contentEntries[0].agents).toEqual([
        { '@odata.type': 'microsoft.graph.aiAgentInfo', identifier: AGENT_ID, name: AGENT_ID, version: '1.0' },
      ]);
      expect(request.integratedAppMetadata).toEqual({ name: AGENT_ID, version: '1.0' });
    });

    it('sends the agent version when given', async () => {
      const { client, calls, tokens } = create(allow);

      await client.evaluate('uploadText', 'hello', { ...AGENT, agentVersion: '2.3.1' }, tokens.resolve);

      const request = calls[0].body.contentToProcess;
      expect(request.contentEntries[0].agents[0].version).toBe('2.3.1');
      expect(request.protectedAppMetadata.version).toBe('2.3.1');
    });

    it('numbers each session\'s messages when the agent context has no sequence', async () => {
      const { client, calls, tokens } = create(allow);
      const { sequence: _sequence, ...unnumbered } = AGENT;

      await client.evaluate('uploadText', 'one', unnumbered, tokens.resolve);
      await client.evaluate('downloadText', 'two', unnumbered, tokens.resolve);
      await client.evaluate('uploadText', 'three', { ...unnumbered, sessionId: 'conversation-2' }, tokens.resolve);
      await client.evaluate('uploadText', 'four', { ...unnumbered, sequence: -1 }, tokens.resolve);

      expect(calls.map((call) => call.body.contentToProcess.contentEntries[0].sequenceNumber)).toEqual([0, 1, 0, 2]);
    });

    it('keeps numbering a session upward after it is no longer tracked', async () => {
      const { client, calls, tokens } = create(allow);
      const { sequence: _sequence, ...unnumbered } = AGENT;

      await client.evaluate('uploadText', 'first', unnumbered, tokens.resolve);
      for (let index = 0; index < 1000; index += 1) {
        await client.evaluate('uploadText', 'other', { ...unnumbered, sessionId: `other-${index}` }, tokens.resolve);
      }
      await client.evaluate('uploadText', 'again', unnumbered, tokens.resolve);

      const sequences = calls.map((call) => call.body.contentToProcess.contentEntries[0].sequenceNumber);
      expect(sequences[0]).toBe(0);
      expect(sequences[sequences.length - 1]).toBeGreaterThan(0);
    });

    it('replaces lone surrogates in the text and names, so the request is well formed JSON', async () => {
      const { client, calls, tokens } = create(allow);

      await client.evaluate('uploadText', 'card \uD800 4111 \uD83D\uDE00', { ...AGENT, agentName: 'Sample\uDC00Agent' }, tokens.resolve);

      expect(sentText(calls[0])).toBe('card \uFFFD 4111 \uD83D\uDE00');
      expect(calls[0].body.contentToProcess.integratedAppMetadata.name).toBe('Sample\uFFFDAgent');
      expect(calls[0].raw).not.toMatch(/\\ud[89a-f]/i);
    });

    it('evaluates for the user the token resolver names', async () => {
      const { client, calls } = create(allow);
      const tokens = hostTokens(createGraphToken(), 'user@example.test');

      await client.evaluate('uploadText', 'hello', AGENT, tokens.resolve);

      expect(calls[0].url).toBe(`${GRAPH_BASE_URL}/users/user%40example.test/dataSecurityAndGovernance/processContent`);
    });

    it('calls the configured Graph base URL', async () => {
      const { client, calls, tokens } = create(allow, { purviewDlpGraphBaseUrl: () => 'https://graph.example.test/beta/' });

      await client.evaluate('uploadText', 'hello', AGENT, tokens.resolve);

      expect(calls[0].url).toBe('https://graph.example.test/beta/me/dataSecurityAndGovernance/processContent');
    });

    it.each([
      ['an unknown activity', ['uploadFile', 'hello', AGENT], "activity must be 'uploadText' or 'downloadText'."],
      ['text that is not a string', ['uploadText', 42, AGENT], 'text must be a string.'],
      ['no agent', ['uploadText', 'hello', undefined], 'agent is required.'],
      ['no agent id', ['uploadText', 'hello', { sessionId: 's-1' }], 'agent.agentId is required.'],
      ['no session id', ['uploadText', 'hello', { agentId: AGENT_ID, sessionId: ' ' }], 'agent.sessionId is required.'],
    ])('rejects %s', async (_case, [activity, text, agent], message) => {
      const { client, calls, tokens } = create(allow);

      await expect(client.evaluate(activity as never, text as never, agent as never, tokens.resolve)).rejects.toThrow(message);
      expect(calls).toHaveLength(0);
    });

    it('rejects a missing token resolver', async () => {
      const { client } = create(allow);

      await expect(client.evaluate('uploadText', 'hello', AGENT, undefined as never)).rejects.toThrow('tokenResolver is required.');
    });
  });

  describe('verdicts', () => {
    it('allows content Purview does not restrict', async () => {
      const { client, tokens } = create(() => processed([], { protectionScopeState: 'modified' }));

      const result = await client.evaluate('uploadText', 'Find flights to Paris', AGENT, tokens.resolve);

      expect(result).toEqual({
        allowed: true,
        evaluated: true,
        truncated: false,
        activity: 'uploadText',
        correlationId: expect.stringMatching(UUID),
        decision: { blockAction: false, actionCount: 0 },
        protectionScopeState: 'modified',
        httpStatus: 200,
        latencyMilliseconds: expect.any(Number),
      });
    });

    it.each([
      ['uploadText', 'The request was blocked by a Microsoft Purview data loss prevention policy.'],
      ['downloadText', 'The response was blocked by a Microsoft Purview data loss prevention policy.'],
    ] as const)('blocks %s that a policy action restricts with block', async (activity, reason) => {
      const { client, tokens } = create(block, { purviewDlpFailClosed: () => false });

      const result = await client.evaluate(activity, CARD_TEXT, AGENT, tokens.resolve);

      expect(result).toMatchObject({
        allowed: false,
        evaluated: true,
        truncated: false,
        decision: { blockAction: true, restrictionAction: 'block', actionCount: 1 },
        blockReason: reason,
      });
      expect(result?.error).toBeUndefined();
    });

    it('reads the restriction action in any case', async () => {
      const { client, tokens } = create(() => processed([{ ...BLOCK_ACTION, restrictionAction: 'Block' }]));

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result?.allowed).toBe(false);
      expect(result?.decision).toEqual({ blockAction: true, restrictionAction: 'Block', actionCount: 1 });
    });

    it('allows content with other restriction actions, counting them', async () => {
      const { client, tokens } = create(() => processed([
        { '@odata.type': '#microsoft.graph.notifyUserAction', action: 'notifyUser' },
        { ...BLOCK_ACTION, restrictionAction: 'warn' },
        { ...BLOCK_ACTION, restrictionAction: 'audit' },
      ]));

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result?.allowed).toBe(true);
      expect(result?.decision).toEqual({ blockAction: false, restrictionAction: 'warn', actionCount: 3 });
    });

    it('blocks when any one action blocks', async () => {
      const { client, tokens } = create(() => processed([{ ...BLOCK_ACTION, restrictionAction: 'warn' }, BLOCK_ACTION]));

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result?.decision).toEqual({ blockAction: true, restrictionAction: 'block', actionCount: 2 });
    });

    it.each([
      [{ '@odata.type': '#microsoft.graph.blockAccessAction', action: 'blockAccess' }],
      [{ action: 'BlockAccess', restrictionAction: 'warn' }],
      [{ action: 'blockAccess', restrictionAction: 7 }],
    ])('blocks an action that blocks access (%j), as Microsoft\'s Purview integrations do', async (action) => {
      const { client, tokens } = create(() => processed([action]), { purviewDlpFailClosed: () => false });

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: false, evaluated: true, decision: { blockAction: true, actionCount: 1 } });
    });

    it('follows the fail mode for an action whose type has another shape', async () => {
      const { client, tokens } = create(() => processed([{ action: ['blockAccess'] }]), { purviewDlpFailClosed: () => true });

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: false, evaluated: false, error: 'response had a policy action of another shape' });
    });

    it.each([202, 204])('allows content accepted without an inline decision (%d)', async (status) => {
      const { client, tokens } = create(() => new Response(null, { status }));

      const result = await client.evaluate('uploadText', 'hello', AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: true, evaluated: true, httpStatus: status, decision: { blockAction: false, actionCount: 0 } });
    });

    it.each([false, true])('follows the fail mode on processing errors, which Graph reports with HTTP 200 (fail closed: %s)', async (failClosed) => {
      const { client, tokens } = create(() => json({
        protectionScopeState: 'notModified',
        policyActions: [],
        processingErrors: [{ code: 'BadRequest', message: 'Invalid request field. The provided data for Name is invalid.', errorType: 'permanent' }],
      }), { purviewDlpFailClosed: () => failClosed });

      const result = await client.evaluate('uploadText', 'hello', AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: !failClosed, evaluated: false, httpStatus: 200, error: 'processing errors: 1' });
      expect(result?.blockReason).toBe(failClosed
        ? 'Data loss prevention validation is unavailable and this agent is configured to fail closed.'
        : undefined);
    });

    it('keeps a block beside processing errors or actions of another shape', async () => {
      const { client, tokens } = create(() => json({ policyActions: ['unexpected', BLOCK_ACTION], processingErrors: [{ code: 'Transient' }] }));

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: false, evaluated: true, decision: { blockAction: true, actionCount: 2 } });
    });

    it.each([
      ['[]', 'response was not a JSON object'],
      ['null', 'response was not a JSON object'],
      ['"allowed"', 'response was not a JSON object'],
      ['{}', 'response had no list of policy actions'],
      ['{"policyActions":{"restrictionAction":"block"}}', 'response had no list of policy actions'],
      ['{"policyActions":[null]}', 'response had a policy action of another shape'],
      ['{"policyActions":[{"restrictionAction":1}]}', 'response had a policy action of another shape'],
      ['{"policyActions":[],"processingErrors":"none"}', 'response had processingErrors that are not a list'],
      ['not json', 'non-JSON response'],
      ['', 'non-JSON response'],
    ])('follows the fail mode for a response of another shape (%s)', async (body, error) => {
      const { client, tokens } = create(() => new Response(body, { status: 200 }), { purviewDlpFailClosed: () => true });

      const result = await client.evaluate('uploadText', 'hello', AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: false, evaluated: false, httpStatus: 200, error });
    });

    it('treats a null processingErrors as none', async () => {
      const { client, tokens } = create(() => json({ policyActions: [], processingErrors: null }));

      expect((await client.evaluate('uploadText', 'hello', AGENT, tokens.resolve))?.evaluated).toBe(true);
    });
  });

  describe('text longer than the limit', () => {
    const LIMIT = 50;
    const blockMarker = (body: Record<string, any>): Response => sentText({ body } as never).includes('BLOCK_ME') ? block() : allow();

    it.each([false, true])('is cut and sent as truncated, and an allow of it follows the fail mode (fail closed: %s)', async (failClosed) => {
      const { client, calls, tokens } = create(blockMarker, {
        purviewDlpMaxContentCharacters: () => LIMIT,
        purviewDlpFailClosed: () => failClosed,
      });

      const result = await client.evaluate('uploadText', `${'a'.repeat(LIMIT)}BLOCK_ME`, AGENT, tokens.resolve);

      expect(sentText(calls[0])).toBe('a'.repeat(LIMIT));
      expect(calls[0].body.contentToProcess.contentEntries[0].isTruncated).toBe(true);
      expect(result).toMatchObject({
        allowed: !failClosed,
        evaluated: true,
        truncated: true,
        decision: { blockAction: false },
        error: `content exceeded A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS (${LIMIT}); Purview evaluated a truncated copy`,
      });
      expect(result?.blockReason).toBe(failClosed
        ? 'The content is too long to be fully validated by Microsoft Purview, and this agent is configured to fail closed.'
        : undefined);
    });

    it('keeps Purview\'s block of truncated text', async () => {
      const { client, tokens } = create(blockMarker, { purviewDlpMaxContentCharacters: () => LIMIT });

      const result = await client.evaluate('uploadText', `BLOCK_ME${'a'.repeat(LIMIT)}`, AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: false, evaluated: true, truncated: true, decision: { blockAction: true } });
      expect(result?.error).toBeUndefined();
    });

    it('evaluates text at the limit normally', async () => {
      const { client, calls, tokens } = create(allow, { purviewDlpMaxContentCharacters: () => LIMIT, purviewDlpFailClosed: () => true });

      const result = await client.evaluate('uploadText', 'a'.repeat(LIMIT), AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: true, evaluated: true, truncated: false });
      expect(calls[0].body.contentToProcess.contentEntries[0].isTruncated).toBe(false);
    });

    it('does not split a surrogate pair when cutting', async () => {
      const { client, calls, tokens } = create(allow, { purviewDlpMaxContentCharacters: () => 5 });

      await client.evaluate('uploadText', 'abcd\uD83D\uDE00efgh', AGENT, tokens.resolve);

      expect(sentText(calls[0])).toBe('abcd');
    });

    it('marks a failure for truncated text as truncated, without changing it', async () => {
      const { client, tokens } = create(() => json({}, 503), { purviewDlpMaxContentCharacters: () => LIMIT });

      const result = await client.evaluate('uploadText', 'a'.repeat(LIMIT + 1), AGENT, tokens.resolve);

      expect(result).toMatchObject({ evaluated: false, truncated: true, error: 'http 503' });
    });
  });

  describe('failures', () => {
    it.each([false, true])('follows the fail mode on an HTTP error, reporting only its status (fail closed: %s)', async (failClosed) => {
      const { client, tokens } = create(
        () => json({ error: { code: 'Forbidden', message: `Access denied for ${CARD_TEXT}` } }, 403),
        { purviewDlpFailClosed: () => failClosed },
      );

      const result = await client.evaluate('uploadText', CARD_TEXT, AGENT, tokens.resolve);

      expect(result).toMatchObject({ allowed: !failClosed, evaluated: false, httpStatus: 403, error: 'http 403' });
      expect(JSON.stringify(result)).not.toContain('4111');
    });

    it('reports a timeout', async () => {
      const { client } = create((_body, init) => waitForAbort(init), { purviewDlpTimeoutMilliseconds: () => 100 });

      const result = await client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve);

      expect(result).toMatchObject({ evaluated: false, error: 'request timeout' });
    });

    it('reports the network error code of a failed request', async () => {
      const failing = (): never => {
        throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
      };
      const { client } = create(failing);

      const result = await client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve);

      expect(result).toMatchObject({ evaluated: false, error: 'request failed: ECONNREFUSED' });
    });

    it('reports only the type of another send error', async () => {
      const { client } = create(() => {
        throw new RangeError('sensitive detail');
      });

      const result = await client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve);

      expect(result?.error).toBe('request failed: RangeError');
    });

    it.each([false, true])('follows the fail mode when the response body cannot be read (fail closed: %s)', async (failClosed) => {
      const unreadable = { ok: true, status: 200, text: async () => Promise.reject(new Error('reset')) } as unknown as Response;
      const { client } = create(() => unreadable, { purviewDlpFailClosed: () => failClosed });

      const result = await client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve);

      expect(result).toMatchObject({ allowed: !failClosed, evaluated: false, httpStatus: 200, error: 'response body could not be read' });
    });

    it('follows the fail mode on an error raised while reading the response', async () => {
      const broken = { get status(): number { throw new Error('broken response'); } } as unknown as Response;
      const { client } = create(() => broken, { purviewDlpFailClosed: () => true });

      const result = await client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve);

      expect(result).toMatchObject({ allowed: false, evaluated: false, error: 'request failed: Error' });
    });

    it('rejects with the caller\'s reason when the caller cancels', async () => {
      const { client } = create((_body, init) => waitForAbort(init));
      const controller = new AbortController();

      const pending = client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve, controller.signal);
      setTimeout(() => controller.abort(new Error('turn cancelled')), 20);

      await expect(pending).rejects.toThrow('turn cancelled');
    });

    it('creates a not-evaluated result that follows the fail mode', () => {
      const open = create(allow).client;
      const closed = create(allow, { purviewDlpFailClosed: () => true }).client;

      expect(open.unavailable('uploadText', 'no agent identity was resolved')).toEqual({
        allowed: true,
        evaluated: false,
        truncated: false,
        activity: 'uploadText',
        correlationId: expect.stringMatching(UUID),
        decision: { blockAction: false, actionCount: 0 },
        latencyMilliseconds: 0,
        error: 'no agent identity was resolved',
      });
      expect(closed.unavailable('downloadText', 'x', 5)).toMatchObject({
        allowed: false,
        latencyMilliseconds: 5,
        blockReason: 'Data loss prevention validation is unavailable and this agent is configured to fail closed.',
      });
    });
  });

  describe('authentication', () => {
    it('asks a host token resolver for every evaluation, with the configured scope', async () => {
      const { client, calls, tokens } = create(allow, { purviewDlpAuthenticationScope: () => 'https://graph.example.test/.default' });

      await client.evaluate('uploadText', 'one', AGENT, tokens.resolve);
      await client.evaluate('uploadText', 'two', AGENT, tokens.resolve);

      expect(tokens.requests.map((request) => request.scopes)).toEqual([['https://graph.example.test/.default'], ['https://graph.example.test/.default']]);
      expect(tokens.requests[0].agent).toMatchObject({ agentId: AGENT_ID, sessionId: 'conversation-1' });
      expect(calls).toHaveLength(2);
    });

    it('gets the agentic user token from the connection and caches it per tenant, agent, user and scope', async () => {
      const { client, calls } = create(allow);
      const { connection, requests } = agenticConnection();
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

      await client.evaluate('uploadText', 'one', AGENT, tokens);
      await client.evaluate('downloadText', 'two', { ...AGENT, tenantId: TENANT_ID.toUpperCase() }, tokens);
      await client.evaluate('uploadText', 'three', { ...AGENT, agenticUserId: 'another-agentic-user' }, tokens);

      expect(requests).toEqual([
        `${TENANT_ID}|${AGENT_ID}|${AGENTIC_USER_ID}|${GRAPH_SCOPE}`,
        `${TENANT_ID}|${AGENT_ID}|another-agentic-user|${GRAPH_SCOPE}`,
      ]);
      expect(calls).toHaveLength(3);
      expect(calls.every((call) => call.url === PROCESS_CONTENT_URL)).toBe(true);
    });

    it('shares one token acquisition between concurrent evaluations', async () => {
      const { client, calls } = create(allow);
      const { connection, requests } = agenticConnection();
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

      await Promise.all([1, 2, 3].map((n) => client.evaluate('uploadText', `message ${n}`, AGENT, tokens)));

      expect(requests).toHaveLength(1);
      expect(calls).toHaveLength(3);
    });

    it('refreshes a token that is about to expire', async () => {
      const { client } = create(allow);
      const { connection, requests } = agenticConnection(() => createGraphToken(60));
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

      await client.evaluate('uploadText', 'one', AGENT, tokens);
      await client.evaluate('uploadText', 'two', AGENT, tokens);

      expect(requests).toHaveLength(2);
    });

    it('uses the cached token during an early refresh and keeps it when the refresh fails', async () => {
      const { client, calls } = create(allow);
      const token = createGraphToken(60);
      let attempts = 0;
      const { connection } = agenticConnection(() => {
        attempts += 1;
        if (attempts > 1) throw new Error('refresh failed');
        return token;
      });
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

      const results = [];
      for (const text of ['one', 'two', 'three']) {
        results.push(await client.evaluate('uploadText', text, AGENT, tokens));
      }

      expect(results.every((result) => result?.evaluated && result.allowed)).toBe(true);
      expect(calls.map((call) => call.authorization)).toEqual(Array(3).fill(`Bearer ${token}`));
      expect(attempts).toBeGreaterThanOrEqual(2);
    });

    it('does not wait for a slow early refresh', async () => {
      const { client, calls } = create(allow, { purviewDlpTimeoutMilliseconds: () => 200 });
      let attempts = 0;
      const { connection } = agenticConnection(() => {
        attempts += 1;
        return attempts === 1 ? createGraphToken(60) : new Promise<string>(() => undefined);
      });
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);
      await client.evaluate('uploadText', 'one', AGENT, tokens);
      const started = Date.now();

      const result = await client.evaluate('uploadText', 'two', AGENT, tokens);

      expect(result?.evaluated).toBe(true);
      expect(Date.now() - started).toBeLessThan(150);
      expect(calls).toHaveLength(2);
    });

    it.each(['[]', 'null', '"claims"', '{"exp":"soon"}', 'not json'])(
      'uses a token whose payload is not an object with a numeric exp (%s), without caching it',
      async (payload) => {
        const { client, calls } = create(allow);
        const { connection, requests } = agenticConnection(() => `e30.${Buffer.from(payload).toString('base64url')}.signature`);
        const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

        const results = [
          await client.evaluate('uploadText', 'one', AGENT, tokens),
          await client.evaluate('uploadText', 'two', AGENT, tokens),
        ];

        expect(results.map((result) => result?.evaluated)).toEqual([true, true]);
        expect(calls).toHaveLength(2);
        expect(requests).toHaveLength(2);
      },
    );

    it.each([false, true])('follows the fail mode when no token can be acquired, reporting only the error type (fail closed: %s)', async (failClosed) => {
      const { client, calls } = create(allow, { purviewDlpFailClosed: () => failClosed });
      const failing: PurviewDlpTokenResolver = () => {
        throw new Error('AADSTS50000: secret-looking detail eyJhbGciOi');
      };

      const result = await client.evaluate('uploadText', 'hello', AGENT, failing);

      expect(result).toMatchObject({ evaluated: false, allowed: !failClosed, error: 'token unavailable: Error' });
      expect(calls).toHaveLength(0);
    });

    it('reports why the agentic user token cannot be requested', async () => {
      const { client, calls } = create(allow);
      const { connection, requests } = agenticConnection();
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

      const result = await client.evaluate('uploadText', 'hello', { ...AGENT, agenticUserId: undefined }, tokens);

      expect(result?.error).toBe('token unavailable: TypeError: agent.agenticUserId is required for the agentic user token.');
      expect(requests).toHaveLength(0);
      expect(calls).toHaveLength(0);
    });

    it.each([
      [async () => null, 'token unavailable: Error: The Purview token resolver returned no token.'],
      [async () => ({ accessToken: ' ' }), 'token unavailable: Error: The Purview token resolver returned no token.'],
      [async () => 'bare-token' as never, 'token unavailable: Error: The Purview token resolver returned no token.'],
      [async () => ({ accessToken: createGraphToken(), userId: ' ' }),
        'token unavailable: Error: The Purview token resolver returned a userId that is not a non-empty string.'],
      [async () => ({ accessToken: createGraphToken(-60) }), 'token unavailable: Error: The Purview token resolver returned an expired token.'],
    ] as Array<[PurviewDlpTokenResolver, string]>)('rejects what a token resolver returns that cannot be used (%#)', async (resolver, error) => {
      const { client, calls } = create(allow);

      const result = await client.evaluate('uploadText', 'hello', AGENT, resolver);

      expect(result?.error).toBe(error);
      expect(calls).toHaveLength(0);
    });

    it('stops waiting for a token resolver that does not return within the timeout', async () => {
      const { client, calls } = create(allow, { purviewDlpTimeoutMilliseconds: () => 100 });
      const started = Date.now();

      const result = await client.evaluate('uploadText', 'hello', AGENT, () => new Promise(() => undefined));

      expect(result).toMatchObject({ evaluated: false, error: 'token unavailable: timeout' });
      expect(Date.now() - started).toBeLessThan(2000);
      expect(calls).toHaveLength(0);
    });

    it('applies one deadline to the token acquisition and the request', async () => {
      const { client } = create((_body, init) => waitForAbort(init), { purviewDlpTimeoutMilliseconds: () => 1000 });
      const slowToken: PurviewDlpTokenResolver = () => new Promise((resolve) => setTimeout(() => resolve({ accessToken: createGraphToken() }), 700));
      const started = Date.now();

      const result = await client.evaluate('uploadText', 'hello', AGENT, slowToken);

      // Separate timeouts would take about 1700 ms.
      expect(result?.error).toBe('request timeout');
      expect(Date.now() - started).toBeLessThan(1500);
    });

    it('does not cache a failed token acquisition', async () => {
      const { client, calls } = create(allow);
      let attempts = 0;
      const { connection } = agenticConnection(() => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return createGraphToken();
      });
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

      const first = await client.evaluate('uploadText', 'one', AGENT, tokens);
      const second = await client.evaluate('uploadText', 'two', AGENT, tokens);

      expect(first?.error).toBe('token unavailable: Error');
      expect(second?.evaluated).toBe(true);
      expect(attempts).toBe(2);
      expect(calls).toHaveLength(1);
    });

    it('keeps the shared token acquisition when a waiting caller cancels', async () => {
      const { client, calls } = create(allow);
      let attempts = 0;
      let release: (token: string) => void = () => undefined;
      const { connection } = agenticConnection(() => {
        attempts += 1;
        return new Promise<string>((resolve) => {
          release = resolve;
        });
      });
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);
      const controller = new AbortController();

      const cancelled = client.evaluate('uploadText', 'one', AGENT, tokens, controller.signal);
      const waiting = client.evaluate('uploadText', 'two', AGENT, tokens);
      await new Promise((resolve) => setImmediate(resolve));
      controller.abort(new Error('turn cancelled'));
      await expect(cancelled).rejects.toThrow('turn cancelled');
      release(createGraphToken());
      const result = await waiting;

      expect(result?.evaluated).toBe(true);
      expect(attempts).toBe(1);
      expect(calls).toHaveLength(1);
    });

    it('drops the oldest cached token beyond 100 agentic users', async () => {
      const { client } = create(allow);
      const { connection, requests } = agenticConnection();
      const tokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

      for (let index = 0; index <= 100; index += 1) {
        await client.evaluate('uploadText', 'hello', { ...AGENT, agenticUserId: `user-${index}` }, tokens);
      }
      await client.evaluate('uploadText', 'hello', { ...AGENT, agenticUserId: 'user-100' }, tokens);
      expect(requests).toHaveLength(101);

      await client.evaluate('uploadText', 'hello', { ...AGENT, agenticUserId: 'user-0' }, tokens);
      expect(requests).toHaveLength(102);
    });
  });

  describe('configuration', () => {
    it.each([
      'http://graph.example.test/v1.0',
      'graph.example.test/v1.0',
      'https://user:secret@graph.example.test/v1.0',
      'https://graph.example.test/v1.0?api-version=1',
      'https://graph.example.test/v1.0#fragment',
    ])('requires an absolute https Graph base URL without credentials, query or fragment (%s)', (baseUrl) => {
      expect(() => new PurviewDlpClient({ configProvider: purviewConfiguration({ purviewDlpGraphBaseUrl: () => baseUrl }) }))
        .toThrow('A365_PURVIEW_DLP_GRAPH_BASE_URL must be an absolute https URL without credentials, query or fragment.');
    });

    it('can be created without valid settings while disabled', () => {
      process.env.A365_PURVIEW_DLP_FAIL_MODE = 'typo';

      expect(() => new PurviewDlpClient({
        configProvider: purviewConfiguration({ isPurviewDlpEnabled: () => false, purviewDlpGraphBaseUrl: () => 'http://plain' }),
      })).not.toThrow();
    });

    it.each([
      ['A365_PURVIEW_DLP_FAIL_MODE', 'typo', "A365_PURVIEW_DLP_FAIL_MODE must be 'open' or 'closed'."],
      ['A365_PURVIEW_DLP_RESPONSE_MODE', 'block', "A365_PURVIEW_DLP_RESPONSE_MODE must be 'audit' or 'enforce'."],
      ['ENABLE_A365_PURVIEW_DLP', 'maybe', 'ENABLE_A365_PURVIEW_DLP must be true or false (or 1/0, yes/no, on/off).'],
    ])('rejects %s=%s at construction', (name, value, message) => {
      process.env.ENABLE_A365_PURVIEW_DLP = 'true';
      process.env[name] = value;

      expect(() => new PurviewDlpClient()).toThrow(message);
    });

    it('checks the Graph base URL again when the configuration changes', async () => {
      let baseUrl = GRAPH_BASE_URL;
      const graph = fakeGraph(allow);
      const client = new PurviewDlpClient({
        configProvider: purviewConfiguration({ purviewDlpGraphBaseUrl: () => baseUrl }),
        fetchImplementation: graph.fetch,
      });
      baseUrl = 'http://graph.example.test/v1.0';

      await expect(client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve))
        .rejects.toThrow('A365_PURVIEW_DLP_GRAPH_BASE_URL must be an absolute https URL');
      expect(graph.calls).toHaveLength(0);
    });

    it('reads its settings from the environment by default', async () => {
      process.env.ENABLE_A365_PURVIEW_DLP = 'true';
      process.env.A365_PURVIEW_DLP_GRAPH_BASE_URL = 'https://graph.example.test/beta';
      const graph = fakeGraph(allow);
      const client = new PurviewDlpClient({ fetchImplementation: graph.fetch });

      await client.evaluate('uploadText', 'hello', AGENT, hostTokens().resolve);

      expect(graph.calls[0].url).toBe('https://graph.example.test/beta/me/dataSecurityAndGovernance/processContent');
    });
  });
});

describe('PurviewDlpTokenResolvers', () => {
  const signal = new AbortController().signal;

  it('returns the agentic user token for /me', async () => {
    const { connection, requests } = agenticConnection(() => 'agentic-user-token');
    const resolve = PurviewDlpTokenResolvers.fromAgenticUser(connection);

    const token = await resolve(AGENT, [GRAPH_SCOPE], signal);

    expect(token).toEqual({ accessToken: 'agentic-user-token' });
    expect(requests).toEqual([`${TENANT_ID}|${AGENT_ID}|${AGENTIC_USER_ID}|${GRAPH_SCOPE}`]);
  });

  it('fails when the connection returns no token, or the identity is incomplete', async () => {
    const resolve = PurviewDlpTokenResolvers.fromAgenticUser(agenticConnection(() => '').connection);

    await expect(resolve(AGENT, [GRAPH_SCOPE], signal)).rejects.toThrow('The agent connection returned no agentic user token.');
    await expect(resolve({ ...AGENT, tenantId: ' ' }, [GRAPH_SCOPE], signal)).rejects.toThrow('agent.tenantId is required');
    await expect(resolve({ ...AGENT, agentId: '' }, [GRAPH_SCOPE], signal)).rejects.toThrow('agent.agentId is required');
  });

  it('stops when cancelled', async () => {
    const { connection, requests } = agenticConnection();
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(PurviewDlpTokenResolvers.fromAgenticUser(connection)(AGENT, [GRAPH_SCOPE], controller.signal)).rejects.toThrow('cancelled');
    expect(requests).toHaveLength(0);
  });

  it('requires a connection with getAgenticUserToken', () => {
    expect(() => PurviewDlpTokenResolvers.fromAgenticUser(undefined as never)).toThrow('connection must provide getAgenticUserToken.');
    expect(() => PurviewDlpTokenResolvers.fromAgenticUser({} as never)).toThrow('connection must provide getAgenticUserToken.');
  });

  it('returns the host\'s token, for /me or for the named user', async () => {
    const requests: unknown[][] = [];
    const getToken = async (...args: unknown[]): Promise<string> => {
      requests.push(args);
      return 'host-token';
    };

    expect(await PurviewDlpTokenResolvers.fromAccessTokenProvider(getToken)(AGENT, [GRAPH_SCOPE], signal))
      .toEqual({ accessToken: 'host-token' });
    expect(await PurviewDlpTokenResolvers.fromAccessTokenProvider(getToken, ' user-object-id ')(AGENT, [GRAPH_SCOPE], signal))
      .toEqual({ accessToken: 'host-token', userId: 'user-object-id' });
    expect(requests[0]).toEqual([[GRAPH_SCOPE], signal, AGENT]);
  });

  it('returns nothing when the host has no token', async () => {
    expect(await PurviewDlpTokenResolvers.fromAccessTokenProvider(() => '')(AGENT, [GRAPH_SCOPE], signal)).toBeNull();
    expect(await PurviewDlpTokenResolvers.fromAccessTokenProvider(() => undefined)(AGENT, [GRAPH_SCOPE], signal)).toBeNull();
  });

  it('requires a token provider and a non-empty user id when one is given', () => {
    expect(() => PurviewDlpTokenResolvers.fromAccessTokenProvider(undefined as never)).toThrow('getToken is required.');
    expect(() => PurviewDlpTokenResolvers.fromAccessTokenProvider(() => 'token', ' ')).toThrow('userId must be a non-empty string when set.');
  });
});
