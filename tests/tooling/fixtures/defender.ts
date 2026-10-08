// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { isDeepStrictEqual } from 'node:util';
import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration, ToolingConfigurationOptions } from '../../../packages/agents-a365-tooling/src';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const ENDPOINT = 'https://prevention.example.test/v1/protection/evaluate';
export const AGENT_ID = '11111111-1111-1111-1111-111111111111';
export const TENANT_ID = '22222222-2222-2222-2222-222222222222';
export const DEFENDER_SCOPE = 'api://86a21212-634e-4553-b3d6-e477e4c9d9ec/.default';

export const DEFENDER_ENVIRONMENT_VARIABLES = [
  'ENABLE_A365_DEFENDER_RTP',
  'A365_DEFENDER_RTP_ENDPOINT',
  'A365_DEFENDER_RTP_FAIL_MODE',
  'A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS',
  'A365_DEFENDER_RTP_AUTHENTICATION_SCOPE',
  'A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS',
];

/** A provider for an enabled Defender configuration pointing at {@link ENDPOINT}. */
export function defenderConfiguration(
  overrides: ToolingConfigurationOptions = {},
): DefaultConfigurationProvider<ToolingConfiguration> {
  return new DefaultConfigurationProvider(() => new ToolingConfiguration({
    isDefenderRtpEnabled: () => true,
    defenderRtpEndpoint: () => ENDPOINT,
    ...overrides,
  }));
}

/** An unsigned JWT that expires after `lifetimeSeconds`. */
export function createToken(lifetimeSeconds = 3600, claims: Record<string, unknown> = {}): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  return `${encode({ alg: 'none' })}.${encode({ exp, roles: ['RealtimeProtection.Evaluate.All'], ...claims })}.signature`;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export interface RecordedCall {
  url: string;
  method: string;
  authorization: string | null;
  correlationId: string | null;
  body: Record<string, any>;
}

/** A fake prevention endpoint that records each request. */
export function fakeEndpoint(
  respond: (body: Record<string, any>, init: RequestInit) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImplementation = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    const body = JSON.parse(String(init.body ?? '{}'));
    calls.push({
      url: String(input),
      method: init.method ?? 'GET',
      authorization: headers.get('authorization'),
      correlationId: headers.get('x-ms-correlation-id'),
      body,
    });
    return await respond(body, init);
  };
  return { fetch: fetchImplementation as typeof fetch, calls };
}

/** A response that never arrives: it fails only when the request is aborted. */
export function waitForAbort(init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
}

/** A token resolver that returns {@link createToken} and records each request. */
export function tokenSource(token = createToken()): {
  resolve: (agentId: string, tenantId: string, scopes: string[]) => Promise<string>;
  requests: string[];
} {
  const requests: string[] = [];
  return {
    requests,
    resolve: async (agentId, tenantId, scopes) => {
      requests.push(`${agentId}|${tenantId}|${scopes.join(' ')}`);
      return token;
    },
  };
}

export function inputContext(text: string): Record<string, any> {
  return {
    spec: 'agent-hooks/0.1',
    interception_point: 'input',
    timestamp: '2026-10-07T10:00:00.000Z',
    sequence: 3,
    agent: { id: AGENT_ID, framework: 'agent365', name: 'SampleAgent' },
    session: { id: 'conversation:activity' },
    target: { content: text, role: 'user' },
    input: { content: text, role: 'user' },
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Mirrors the request validation of the Defender prevention endpoint (the rules it reports in a 400),
 * so every body the client sends is checked against what the service would reject. Ported from the
 * .NET SDK tests.
 */
export function contractErrors(context: Record<string, any>): string[] {
  const errors: string[] = [];
  const timestamp = text(context.timestamp);
  if (context.spec !== 'agent-hooks/0.1') errors.push('spec');
  if (!timestamp || !timestamp.endsWith('Z') || Number.isNaN(Date.parse(timestamp))) errors.push('timestamp');
  if (!Number.isSafeInteger(context.sequence) || context.sequence < 0) errors.push('sequence');
  if (!text(context.agent?.id)) errors.push('agent.id');
  if (!/^[a-z0-9_-]+$/.test(text(context.agent?.framework) ?? '')) errors.push('agent.framework');
  if (!text(context.session?.id)) errors.push('session.id');
  if (!('target' in context)) errors.push('target');
  if (isObject(context.extensions) && Object.keys(context.extensions).some((key) => !/^[a-z][a-z0-9_]*$/.test(key))) {
    errors.push('extensions');
  }
  if ('model' in context && !text(context.model?.id)) errors.push('model.id');
  if ('tools' in context && (!Array.isArray(context.tools) || context.tools.some((tool: any) =>
    !text(tool?.name) || (tool.schema != null && !isObject(tool.schema))))) {
    errors.push('tools');
  }
  if (context.actor?.kind != null && !['human', 'service', 'agent'].includes(context.actor.kind)) errors.push('actor.kind');
  if (isObject(context.tool_call)
    && Object.keys(context.tool_call).some((key) => !['id', 'name', 'args', 'content_hash'].includes(key))) {
    errors.push('tool_call members');
  }
  if (isObject(context.tool_result)
    && Object.keys(context.tool_result).some((key) => !['value', 'is_error', 'duration_ms'].includes(key))) {
    errors.push('tool_result members');
  }

  switch (context.interception_point) {
  case 'input':
    if (!['user', 'system', 'external'].includes(context.input?.role)) errors.push('input.role');
    if (!isDeepStrictEqual(context.target, context.input)) errors.push('target != input');
    break;
  case 'output':
    if (!isDeepStrictEqual(context.target, context.output)) errors.push('target != output');
    break;
  case 'pre_tool_call':
  case 'post_tool_call':
    if (!text(context.tool_call?.id) || !text(context.tool_call?.name)) errors.push('tool_call');
    if (!isObject(context.tool_call?.args)) errors.push('tool_call.args');
    if (context.interception_point === 'pre_tool_call') {
      if (!isDeepStrictEqual(context.target, context.tool_call?.args)) errors.push('target != tool_call.args');
    } else {
      if (typeof context.tool_result?.is_error !== 'boolean') errors.push('tool_result.is_error');
      if (!isObject(context.tool_result) || !('value' in context.tool_result)) errors.push('tool_result.value');
      else if (!isDeepStrictEqual(context.target, context.tool_result.value)) errors.push('target != tool_result.value');
    }
    break;
  default:
    errors.push('not an evaluated point');
  }

  return errors;
}
