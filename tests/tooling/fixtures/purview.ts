// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefaultConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { ToolingConfiguration, ToolingConfigurationOptions } from '../../../packages/agents-a365-tooling/src';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const GRAPH_BASE_URL = 'https://graph.example.test/v1.0';
export const AGENT_ID = '11111111-1111-1111-1111-111111111111';
export const TENANT_ID = '22222222-2222-2222-2222-222222222222';
export const BLUEPRINT_ID = '33333333-3333-3333-3333-333333333333';
export const AGENTIC_USER_ID = '44444444-4444-4444-4444-444444444444';
export const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';
export const PROCESS_CONTENT_URL = `${GRAPH_BASE_URL}/me/dataSecurityAndGovernance/processContent`;

export const PURVIEW_ENVIRONMENT_VARIABLES = [
  'ENABLE_A365_PURVIEW_DLP',
  'A365_PURVIEW_DLP_GRAPH_BASE_URL',
  'A365_PURVIEW_DLP_AUTHENTICATION_SCOPE',
  'A365_PURVIEW_DLP_FAIL_MODE',
  'A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS',
  'A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS',
  'A365_PURVIEW_DLP_RESPONSE_MODE',
];

/** A provider for an enabled Purview configuration pointing at {@link GRAPH_BASE_URL}. */
export function purviewConfiguration(
  overrides: ToolingConfigurationOptions = {},
): DefaultConfigurationProvider<ToolingConfiguration> {
  return new DefaultConfigurationProvider(() => new ToolingConfiguration({
    isPurviewDlpEnabled: () => true,
    purviewDlpGraphBaseUrl: () => GRAPH_BASE_URL,
    ...overrides,
  }));
}

/** An unsigned JWT that expires after `lifetimeSeconds`. */
export function createGraphToken(lifetimeSeconds = 3600, claims: Record<string, unknown> = {}): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + lifetimeSeconds;
  return `${encode({ alg: 'none' })}.${encode({ exp, scp: 'Content.Process.User', ...claims })}.signature`;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A `processContent` response with the given policy actions. */
export function processed(policyActions: unknown[] = [], extra: Record<string, unknown> = {}): Response {
  return json({ protectionScopeState: 'notModified', policyActions, processingErrors: [], ...extra });
}

/** The policy action Purview returns for a DLP rule that blocks the content. */
export const BLOCK_ACTION = {
  '@odata.type': '#microsoft.graph.restrictAccessAction',
  action: 'restrictAccess',
  restrictionAction: 'block',
};

export interface RecordedGraphCall {
  url: string;
  method: string;
  authorization: string | null;
  clientRequestId: string | null;
  contentType: string | null;
  redirect: RequestRedirect | undefined;
  raw: string;
  body: Record<string, any>;
}

/** A fake Microsoft Graph `processContent` endpoint that records each request. */
export function fakeGraph(
  respond: (body: Record<string, any>, init: RequestInit, url: string) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: RecordedGraphCall[] } {
  const calls: RecordedGraphCall[] = [];
  const fetchImplementation = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    const raw = String(init.body ?? '{}');
    const body = JSON.parse(raw);
    const url = String(input);
    calls.push({
      url,
      method: init.method ?? 'GET',
      authorization: headers.get('authorization'),
      clientRequestId: headers.get('client-request-id'),
      contentType: headers.get('content-type'),
      redirect: init.redirect,
      raw,
      body,
    });
    return await respond(body, init, url);
  };
  return { fetch: fetchImplementation as typeof fetch, calls };
}

/** The text of the request's only content entry. */
export function sentText(call: RecordedGraphCall): string {
  return call.body.contentToProcess.contentEntries[0].content.data;
}

/** A response that never arrives: it fails only when the request is aborted. */
export function waitForAbort(init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
}
