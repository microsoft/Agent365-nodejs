// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DefenderRtpAgenticConnection, DefenderRtpTokenResolver } from './contracts';

const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const DEFAULT_AUTHORITY = 'https://login.microsoftonline.com';

/** Options for {@link DefenderRtpTokenResolvers.fromAgenticConnection}. */
export interface DefenderRtpAgenticConnectionOptions {
  /** The Entra authority; defaults to `https://login.microsoftonline.com`. */
  authority?: string;
  /** The fetch implementation for the token endpoint; defaults to the global `fetch`. */
  fetchImplementation?: typeof fetch;
}

/** Token resolvers for `DefenderRtpClient`. */
export class DefenderRtpTokenResolvers {
  /**
   * The agent identity's own app-only token, in the agent's tenant, issued through the agent's
   * Agents SDK connection: the connection's blueprint credential (secret, certificate, federated or
   * managed identity) issues the agent identity's assertion, which is exchanged for the Defender
   * API token. This is the same authority Observability S2S export uses.
   *
   * @param connection The agent's connection, for example
   * `adapter.connectionManager.getDefaultConnection()` (MSAL connections implement
   * `getAgenticApplicationToken`).
   * @param options The authority and fetch implementation.
   * @returns A resolver for `DefenderRtpClient.evaluateHookContext`.
   * @throws When the connection has no `getAgenticApplicationToken`, or the authority is not an
   * absolute https URL.
   */
  public static fromAgenticConnection(
    connection: DefenderRtpAgenticConnection,
    options: DefenderRtpAgenticConnectionOptions = {},
  ): DefenderRtpTokenResolver {
    if (typeof connection?.getAgenticApplicationToken !== 'function') {
      throw new TypeError('connection must provide getAgenticApplicationToken.');
    }

    const authorityUrl = parseHttpsUrl(options.authority ?? DEFAULT_AUTHORITY);
    if (!authorityUrl) {
      throw new TypeError('authority must be an absolute https URL.');
    }

    // The parsed origin and path, so the token endpoint is built from what was validated.
    const authority = trimTrailingSlashes(`${authorityUrl.origin}${authorityUrl.pathname}`);

    const fetchImplementation = options.fetchImplementation;
    return async (agentId, tenantId, scopes, signal) => {
      signal?.throwIfAborted();
      const assertion = await connection.getAgenticApplicationToken(tenantId, agentId);
      if (typeof assertion !== 'string' || !assertion) {
        throw new Error('The agent connection returned no agent identity assertion.');
      }

      const url = `${authority}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
      const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: agentId,
          client_assertion_type: CLIENT_ASSERTION_TYPE,
          client_assertion: assertion,
          scope: scopes.join(' '),
        }),
        // A redirect would resend the client assertion to another URL, so it fails the request instead.
        redirect: 'error',
        signal,
      };
      const response = fetchImplementation ? await fetchImplementation(url, init) : await fetch(url, init);
      const payload = await readJson(response);
      if (!response.ok) {
        // Only Entra's error code and AADSTS codes: the rest of the body can echo the request.
        throw new Error(`The Defender token request failed with HTTP ${response.status}${entraErrorCodes(payload)}.`);
      }

      if (payload === undefined) {
        throw new Error('The Defender token response was not JSON.');
      }

      const token = isObject(payload) ? payload['access_token'] : undefined;
      if (typeof token !== 'string' || !token) {
        throw new Error('The Defender token response had no access_token.');
      }

      return token;
    };
  }
}

/** `value` parsed as an absolute https URL with a host (`https:host` reads as `https://host`), or undefined. */
function parseHttpsUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname ? url : undefined;
  } catch (_error) {
    return undefined;
  }
}

/** Removes trailing slashes in linear time (a `/+$` pattern is polynomial). */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }

  return value.slice(0, end);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (_error) {
    return undefined;
  }
}

/** ` (invalid_client, AADSTS7000215)` from an Entra error body, or an empty string. */
function entraErrorCodes(payload: unknown): string {
  if (!isObject(payload)) {
    return '';
  }

  const error = typeof payload['error'] === 'string' && /^[a-z_]+$/.test(payload['error']) ? payload['error'] : undefined;
  const codes = Array.isArray(payload['error_codes'])
    ? payload['error_codes'].filter((code): code is number => Number.isInteger(code)).map((code) => `AADSTS${code}`)
    : [];
  const parts = [...(error ? [error] : []), ...codes];
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
