# @microsoft/agents-a365-tooling-extensions-agenthooks

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling-extensions-agenthooks?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-agenthooks)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling-extensions-agenthooks?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-agenthooks)

Microsoft Agent 365 real-time protection on the [agent-hooks](https://github.com/responsibleai/agent-hooks)
control contract (AGENT-HOOKS-0.1), using the TypeScript package `@responsibleai/agent-hooks`.

`A365DefenderInterceptor` is an agent-hooks interceptor for Microsoft Defender for AI. For each context the host
emits at the four points Defender evaluates, `DefenderRtpClient` from `@microsoft/agents-a365-tooling` sends a copy
to the prevention endpoint (`POST .../v1/protection/evaluate`), fitted to Defender's request validation: normalized,
with every content string clamped, and keeping the context's session, sequence and tool call ids. The host's
context is not modified. Defender's verdict decides:

| agent-hooks point | When | On `deny` |
|---|---|---|
| `input` | the user's message, before the agent runs | the agent does not run |
| `pre_tool_call` | a tool call, before it runs | the tool does not run |
| `post_tool_call` | a tool result, before the agent uses it | the result is withheld |
| `output` | the reply, before it is sent | the reply is replaced |

Other points (`agent_startup`, model calls, `agent_shutdown`) are allowed without a call. The host acts on the
emission record: `proceeds(record)` is false when the action must not run.

## Installation

```bash
npm install @microsoft/agents-a365-tooling-extensions-agenthooks
```

`@responsibleai/agent-hooks` is a prerelease package with a native core for linux-x64 and linux-arm64 (glibc),
darwin-x64, darwin-arm64 and win32-x64, and requires Node.js 20 or later. It is a dependency of this package
only: `DefenderRtpClient` in `@microsoft/agents-a365-tooling` does not need it.

## Authentication

Calls carry the **agent identity's own app-only token** in the agent's tenant, for the Defender API
(`api://86a21212-634e-4553-b3d6-e477e4c9d9ec`, app role `RealtimeProtection.Evaluate.All`). This is the same
authority as Observability S2S export: `DefenderRtpTokenResolvers.fromAgenticConnection` asks the agent's
connection for the agent identity's assertion (`getAgenticApplicationToken`) and exchanges it with a
`client_credentials` request. No user token is needed, so the same path works for user turns, autonomous runs,
agent-to-agent calls and startup. The client caches the token per agent, tenant and scope until five minutes
before it expires; `DefenderRtpClient.prefetchAccessToken` acquires it ahead of the first evaluation. The
Defender endpoint and the token authority must be `https` URLs.

### Prerequisites

- **The agent identity has the `RealtimeProtection.Evaluate.All` application role on the Defender API**
  (`86a21212-634e-4553-b3d6-e477e4c9d9ec`). Once
  [microsoft/Agent365-devTools#485](https://github.com/microsoft/Agent365-devTools/pull/485) ships, `a365 setup all`
  grants it to the agent blueprint as an inheritable permission, so every agent identity under the blueprint
  inherits it. Until then, an administrator grants it manually, for example by assigning the role to the agent
  identity with Microsoft Graph:

  ```http
  POST https://graph.microsoft.com/v1.0/servicePrincipals/{agent-identity-id}/appRoleAssignments
  Content-Type: application/json

  {
    "principalId": "{agent-identity-id}",
    "resourceId": "{id of the Defender API service principal in the tenant}",
    "appRoleId": "{id of the RealtimeProtection.Evaluate.All app role}"
  }
  ```

  `GET https://graph.microsoft.com/v1.0/servicePrincipals(appId='86a21212-634e-4553-b3d6-e477e4c9d9ec')?$select=id,appRoles`
  returns the Defender API service principal's `id` and its app roles.
- **The agent's tenant is onboarded to Microsoft Defender for AI.**

Without either, Defender answers `403`, which follows the fail mode.

## Usage

```typescript
import { DefenderRtpClient, DefenderRtpTokenResolvers } from '@microsoft/agents-a365-tooling';
import {
  A365DefenderInterceptor,
  addA365Defender,
  createProtectionEmitter,
} from '@microsoft/agents-a365-tooling-extensions-agenthooks';
import { AgentContextBuilder, proceeds } from '@responsibleai/agent-hooks';

// Once per process: reads ENABLE_A365_DEFENDER_RTP and A365_DEFENDER_RTP_*.
const defender = new DefenderRtpClient();
const tokens = DefenderRtpTokenResolvers.fromAgenticConnection(adapter.connectionManager.getDefaultConnection());

// In the turn handler:
const agentId = context.activity.getAgenticInstanceId(); // the agent identity
const tenantId = context.activity.getAgenticTenantId(); // the agent's tenant
const emitter = addA365Defender(
  createProtectionEmitter(),
  new A365DefenderInterceptor(
    defender,
    // Returning null allows without a call, for example for a request without an agent identity.
    () => agentId && tenantId
      ? {
        agent: { agentId, tenantId, requestId: context.activity.id, userId: context.activity.from?.aadObjectId },
        tokenResolver: tokens,
      }
      : null,
    (result) => console.log(
      `Defender ${result.interceptionPoint} allowed=${result.allowed} evaluated=${result.evaluated} `
      + `x-ms-correlation-id=${result.correlationId}${result.error ? ` error=${result.error}` : ''}`),
  ));

const builder = new AgentContextBuilder({
  agentId: agentId ?? 'my-agent',
  framework: 'my-framework',
  sessionId: `${context.activity.conversation?.id}:${context.activity.id}`,
});
const record = await emitter.emitUnchecked(builder.input(context.activity.text ?? ''));
if (!proceeds(record)) {
  // Blocked: reply with record.verdict.message and stop the turn.
}
```

The call resolver runs for each emitted context that Defender evaluates. An emitter can also be created once per
process, with a resolver that looks the turn up by `context.session.id`. `createProtectionEmitter` uses `enforce`
mode and the `parallel/strictest` profile, so an action proceeds only when every registered interceptor allows it,
and keeps the last 1000 interception records in memory (drain them with `takeRecords()` or forward them with
`setRecordSink()`).

> **Use `createProtectionEmitter`, or set the interceptor timeout above the Defender timeout.** An
> `InterceptionEmitter` constructed directly uses the agent-hooks default interceptor timeout of 5 seconds, below the
> Defender client's 10-second default. A slow Defender call would then end as `host_error:interceptor_timeout`, a
> deny, instead of following the fail mode. `createProtectionEmitter` sets the Defender timeout plus two seconds and
> rejects an `interceptorTimeoutMilliseconds` that does not exceed the Defender timeout; with your own emitter, pass
> a timeout above `A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS` as the third constructor argument.

## Verdicts

- A Defender `allow` keeps Defender's warnings (for example `prevention_annotated`) and threat labels
  (`result_labels`) on the agent-hooks verdict.
- A Defender `deny` (or `transform`, which this version cannot apply) becomes a deny with reason
  `defender:block[:<reason>]`, Defender's message, and the correlation id as evidence
  (`urn:a365:defender:<correlation id>`).
- When no verdict is obtained (token, transport, timeout, HTTP or validation failure, or an invalid context or
  identity), the verdict follows `A365_DEFENDER_RTP_FAIL_MODE`: fail open (the default) allows with a
  `defender:unverified` warning that carries the error; fail closed denies with reason
  `runtime_error:defender_unverified`, which is never reported as a detection. One deadline (the Defender timeout)
  covers the token acquisition and the request, and the emitter's interceptor timeout must exceed it (by default
  it is two seconds longer), so the fail mode, not a host error, decides a slow call.

Every call sends a unique `x-ms-correlation-id`, returned as `DefenderRtpEvaluationResult.correlationId`;
Defender logs each evaluation under it. A `400` reports the failed validation rules in `error`.

## Configuration

| Variable | Meaning |
|---|---|
| `ENABLE_A365_DEFENDER_RTP` | `true` to call Defender; otherwise the interceptor allows everything without a call |
| `A365_DEFENDER_RTP_ENDPOINT` | the prevention endpoint, `https://<host>/v1/protection/evaluate` (required when enabled; `https` only) |
| `A365_DEFENDER_RTP_FAIL_MODE` | `closed` blocks when no verdict is obtained; default is open |
| `A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS` | deadline of each evaluation, token acquisition included (default 10000) |
| `A365_DEFENDER_RTP_AUTHENTICATION_SCOPE` | overrides the Defender API scope |
| `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS` | clamps every content string sent; identifiers and protocol fields are sent unchanged (default 20000) |

The same settings can be supplied per tenant or per request through a `ToolingConfiguration` with
override functions, passed as `configProvider` to `DefenderRtpClient` and `createProtectionEmitter`.

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
