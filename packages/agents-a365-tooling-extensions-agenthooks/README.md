# @microsoft/agents-a365-tooling-extensions-agenthooks

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling-extensions-agenthooks?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-agenthooks)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling-extensions-agenthooks?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling-extensions-agenthooks)

Microsoft Agent 365 real-time protection on the [agent-hooks](https://github.com/responsibleai/agent-hooks)
control contract (AGENT-HOOKS-0.1), using the TypeScript package `@responsibleai/agent-hooks`.

`A365DefenderInterceptor` is an agent-hooks interceptor for Microsoft Defender for AI. For each context the host
emits at the four points Defender evaluates, `DefenderRtpClient` from `@microsoft/agents-a365-tooling` sends a copy
to the prevention endpoint (`POST .../v1/protection/evaluate`), fitted to Defender's request validation and size
limits (see [What Defender receives](#what-defender-receives)). The host's context is not modified. Defender's
verdict decides:

| agent-hooks point | When | On `deny` |
|---|---|---|
| `input` | the user's message, before the agent runs | the agent does not run |
| `pre_tool_call` | a tool call, before it runs | the tool does not run |
| `post_tool_call` | a tool result, before the agent uses it | the result is withheld |
| `output` | the reply, before it is sent | the reply is replaced |

Other points (`agent_startup`, model calls, `agent_shutdown`) are allowed without a call. The host acts on the
emission record: `proceeds(record)` is false when the action must not run.

`A365PurviewInterceptor` is an agent-hooks interceptor for Microsoft Purview data loss prevention (DLP): it sends the
text of the user's message and of the reply to Purview through Microsoft Graph, which applies the tenant's DLP
policies and records the interaction for audit (see
[Microsoft Purview data loss prevention](#microsoft-purview-data-loss-prevention)). Both interceptors register on one
emitter, and a deny from either blocks the action.

## Installation

```bash
npm install @microsoft/agents-a365-tooling-extensions-agenthooks @responsibleai/agent-hooks@0.1.0-alpha.5
```

`@responsibleai/agent-hooks` is a peer dependency (`>=0.1.0-alpha.5 <0.2.0`; this version is tested with
`0.1.0-alpha.5`), so install it in your application. The emitter, `AgentContextBuilder` and `proceeds` you import
must come from the same copy this package uses: with two copies, `addA365Defender` does not accept your emitter and
`instanceof InterceptionBlocked` checks fail.

`@responsibleai/agent-hooks` is a prerelease package with a native core for linux-x64 and linux-arm64 (glibc),
darwin-x64, darwin-arm64 and win32-x64, and requires Node.js 20 or later. Only this package needs it:
`DefenderRtpClient` and `PurviewDlpClient` in `@microsoft/agents-a365-tooling` do not.

## Authentication

Calls carry the **agent identity's own app-only token** in the agent's tenant, for the Defender API
(`api://86a21212-634e-4553-b3d6-e477e4c9d9ec`, app role `RealtimeProtection.Evaluate.All`). This is the same
authority as Observability S2S export: `DefenderRtpTokenResolvers.fromAgenticConnection` asks the agent's
connection for the agent identity's assertion (`getAgenticApplicationToken`) and exchanges it with a
`client_credentials` request. No user token is needed, so the same path works for user turns, autonomous runs,
agent-to-agent calls and startup. The client caches the token per agent, tenant and scope until five minutes
before it expires; `DefenderRtpClient.prefetchAccessToken` acquires it ahead of the first evaluation. The
Defender endpoint and the token authority must be `https` URLs, and neither request follows a redirect, so the
context, the token and the agent identity's assertion are never sent anywhere else.

### Prerequisites

Defender accepts only callers whose app-only token carries the application permission
`RealtimeProtection.Evaluate.All` on the Defender API (`86a21212-634e-4553-b3d6-e477e4c9d9ec`).
[microsoft/Agent365-devTools#485](https://github.com/microsoft/Agent365-devTools/pull/485) adds this to
`a365 setup`. Until it ships, a tenant administrator grants it once per agent blueprint, and every agent identity
created from the blueprint inherits it:

1. If the tenant has no service principal for the Defender API yet, create one:
   `az ad sp create --id 86a21212-634e-4553-b3d6-e477e4c9d9ec`.
2. Assign the app role to the blueprint's service principal:
   `POST https://graph.microsoft.com/v1.0/servicePrincipals/{blueprint-sp-object-id}/appRoleAssignments` with
   `principalId` (the blueprint SP), `resourceId` (the Defender API SP) and `appRoleId` (the id of
   `RealtimeProtection.Evaluate.All` in that SP's `appRoles`). Requires Global Administrator or Privileged Role
   Administrator.
3. Make it inheritable:
   `POST https://graph.microsoft.com/beta/applications/microsoft.graph.agentIdentityBlueprint/{blueprint-object-id}/inheritablePermissions`
   with
   `{"resourceAppId":"86a21212-634e-4553-b3d6-e477e4c9d9ec","inheritableScopes":{"@odata.type":"#microsoft.graph.allAllowedScopes","kind":"allAllowed"},"inheritableRoles":{"@odata.type":"#microsoft.graph.allAllowedRoles","kind":"allAllowed"}}`.
   Requires Agent ID Administrator or Global Administrator.

The tenant must also be onboarded to Defender for AI; otherwise Defender returns 403.

Like any other failure, a `403` follows the fail mode.

## What Defender receives

`DefenderRtpClient` builds the copy while reading the context, so a huge context is never serialized whole:

- Identity and protocol fields (`spec`, the agent, session, tenant, actor, sequence, request and tool call ids) are
  kept or filled in, and normalized where Defender requires it: a UTC timestamp, a lowercase framework name,
  `tenant.id` set to the agent's tenant, and `target` equal to the point's field. Only the active point's field is
  sent: an `input`, `output`, `tool_call` or `tool_result` left over from another point is left out. Optional fields
  of another shape (for example a `model` that is a string) are left out rather than failing the evaluation, and a
  `request_id` that isn't a string falls back to the agent's request id, like a missing one.
- Every string and object key is well formed: a lone UTF-16 surrogate becomes U+FFFD, because Defender's JSON
  parser rejects it and the request would fail. When two keys of one object become equal that way, only the first
  is sent; in the content under decision, that makes the copy incomplete (see [Verdicts](#verdicts)).
- Each content string is at most `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS` (default 20000) long, cut with a
  `...[truncated N chars]` marker, and nesting deeper than 32 levels is cut.
- The copy carries at most four times that limit of content in total. Every copied value, key, tool declaration
  and message counts at least one character, so a huge list of empty items or nulls is trimmed like any other
  content, and lists and objects are read only as far as the budget reaches. The content under decision (the message,
  the tool call arguments, the tool result or the reply) comes first; it is sent twice (`target` mirrors it), so it
  can use up to twice the limit. The rest of the context shares what it leaves, in this order, and is trimmed
  first: at a tool call, the called tool's declaration; the tool call arguments at `post_tool_call`; the other tool
  declarations; the newest messages; extensions; then any other fields.
- At a tool call, Defender decides with the called tool's declaration, so it comes first and is always present, its
  name copied whole. It is searched for by name among the first 10000 declarations, and otherwise declared by name,
  with `extensions.a365.tool.description`. When the list is longer and the tool is not among those 10000, or its own
  description or schema had to be cut, the copy counts as incomplete (see [Verdicts](#verdicts)); a tool that is
  simply absent from a list of at most 10000 does not.

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
    // Returning null means there is no agent identity (for example a request that is not agentic):
    // Defender is not called and the fail mode decides.
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

The call resolver runs for each emitted context that Defender evaluates. The evaluation callback runs after the
verdict is returned, off the interceptor's timed path, so a slow logger never delays the action. An emitter can
also be created once per process, with a resolver that looks the turn up by `context.session.id`; its interceptor
timeout is fixed then, so if the Defender timeout can change per request, pass an `interceptorTimeoutMilliseconds`
above the largest value (or keep creating the emitter per turn). `createProtectionEmitter` uses `enforce` mode and
the `parallel/strictest` profile, so an action proceeds only when every registered interceptor allows it, and keeps
the last 1000 interception records in memory (drain them with `takeRecords()` or forward them with
`setRecordSink()`).

> **Use `createProtectionEmitter`, or set the interceptor timeout above the Defender timeout.** An
> `InterceptionEmitter` constructed directly uses the agent-hooks default interceptor timeout of 5 seconds, below the
> Defender client's 10-second default. A slow Defender call would then end as `host_error:interceptor_timeout`, a
> deny, instead of following the fail mode. `createProtectionEmitter` sets the Defender timeout plus two seconds and
> rejects an `interceptorTimeoutMilliseconds` that does not exceed the Defender timeout, or that is not an integer of
> at most 2147483647 (Node's largest timer delay; a longer one fires after 1 ms); with your own emitter, pass a
> timeout above `A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS` as the third constructor argument. When Purview DLP is
> enabled, the same applies to the Purview timeout: the default is the longer of the two plus two seconds.

## Verdicts

- A Defender `allow` keeps Defender's warnings (for example `prevention_annotated`) and threat labels
  (`result_labels`) on the agent-hooks verdict. A warning reason in the `host_error:` namespace, which agent-hooks
  reserves for the host, becomes `defender:warning`.
- A Defender `deny` (or `transform`, which this version cannot apply) becomes a deny with reason
  `defender:block[:<reason>]`, Defender's message, and the correlation id as evidence
  (`urn:a365:defender:<correlation id>`).
- When no verdict is obtained (token, transport, timeout, HTTP or validation failure, an invalid context or
  identity, or a call resolver that resolves no agent identity), the verdict follows
  `A365_DEFENDER_RTP_FAIL_MODE`: fail open (the default) allows with a `defender:unverified` warning that carries
  the error; fail closed denies with reason `runtime_error:defender_unverified`, which is never reported as a
  detection. One deadline (the Defender timeout) covers the token acquisition and the request, and the emitter's
  interceptor timeout must exceed it (by default it is two seconds longer), so the fail mode, not a host error,
  decides a slow call.
- **Content that does not fit** follows the fail mode too: content under decision longer than
  `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS` (default 20000), or more than its share of the copy (for example tool
  call arguments with many long strings). Defender is sent a truncated copy, so it sees only the beginning of the
  content under decision. A block of the copy stands, but an allow does not cover the rest, so it is treated like a
  missing verdict, with the error
  `content exceeded A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS (<limit>); Defender evaluated a truncated copy`.
  Otherwise padding could push a payload past the limit and have it authorized unseen. Agents that handle long
  content (for example base64-encoded files in tool results) should raise the limit; evaluating long content in
  chunks is a planned follow-up. The same applies when two keys of the content under decision become one once made
  well formed, so one value is left out of the copy, with the error
  `content has object keys that are equal once made well formed; Defender evaluated an incomplete copy`, and when
  the called tool's declaration is incomplete (see [What Defender receives](#what-defender-receives)).

Every call sends a unique `x-ms-correlation-id`, returned as `DefenderRtpEvaluationResult.correlationId`;
Defender logs each evaluation under it. A `400` reports the failed validation rules in `error`.

## Configuration

| Variable | Meaning |
|---|---|
| `ENABLE_A365_DEFENDER_RTP` | `true` (or 1, yes, on) to call Defender; `false` (or 0, no, off) or unset leaves it off, and the interceptor allows everything without a call. Any other value fails at startup |
| `A365_DEFENDER_RTP_ENDPOINT` | the prevention endpoint, `https://<host>/v1/protection/evaluate` (required when enabled; `https` only) |
| `A365_DEFENDER_RTP_FAIL_MODE` | `closed` blocks when no verdict is obtained; `open` (the default) allows. Any other value is rejected, so a typo can't silently fail open |
| `A365_DEFENDER_RTP_TIMEOUT_MILLISECONDS` | deadline of each evaluation, token acquisition included: a whole number (default 10000, at most 2147481647); a value such as `10s` fails at startup |
| `A365_DEFENDER_RTP_AUTHENTICATION_SCOPE` | overrides the Defender API scope |
| `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS` | the longest content string sent, a whole number (default 20000, at most 2147483647); the whole copy carries at most four times as much content. Content under decision that does not fit follows the fail mode unless Defender blocks it, so raise it for long-content agents. Identifiers and protocol fields are sent unchanged |

The same settings can be supplied per tenant or per request through a `ToolingConfiguration` with
override functions, passed as `configProvider` to `DefenderRtpClient` and `createProtectionEmitter`.

## Microsoft Purview data loss prevention

`A365PurviewInterceptor` evaluates the text of the user's message and of the reply with `PurviewDlpClient` from
`@microsoft/agents-a365-tooling`, which calls the Microsoft Graph `processContent` API
(`POST .../me/dataSecurityAndGovernance/processContent`). Purview applies the tenant's DLP policies for the agent's
application and records each interaction for audit (DSPM for AI, Activity explorer).

| agent-hooks point | Purview activity | Behavior |
|---|---|---|
| `input` | `uploadText` (the user's message) | awaited; a block denies it, so the agent does not run |
| `output` | `downloadText` (the reply) | `audit` (default): sent without waiting and allowed at once; `enforce`: awaited and decided like the input |

Other points are allowed without a call: Purview DLP evaluates prompts and replies, not tool calls. Content without
text is allowed without a call. A string is sent as it is; structured content (for example content parts) is sent as
its string and number values, in order, one per line. Structured content is read within bounds (at most the limit
plus one character of text, four values per character of `A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS`, and 32 levels of
nesting); content read only in part is sent as truncated, so Purview's block stands and its allow follows the fail
mode.

### Response mode

Purview DLP policies for custom AI apps restrict prompts (`UploadText`); restricting replies is not supported for
them. So by default (`A365_PURVIEW_DLP_RESPONSE_MODE=audit`) the reply is sent to Purview in the background and the
interceptor allows it at once: Purview still records it for audit and the evaluation reaches the evaluation callback,
but the reply is never delayed or blocked, whatever the fail mode. The background evaluation is bounded by the
Purview timeout, never cancelled by the emitter, and nothing it raises escapes (no unhandled rejection). With
`enforce`, the reply is awaited and decided like the input.

### Authentication

- **The agentic user (validated).** `PurviewDlpTokenResolvers.fromAgenticUser(connection)` asks the agent's Agents SDK
  connection for the agentic user's delegated Microsoft Graph token
  (`getAgenticUserToken(tenantId, agentId, agenticUserId, scopes)`, as the Agents SDK's own agentic authorization
  does), so Purview evaluates the content as the agentic user (`/me`). The agent context needs `tenantId`
  (`activity.getAgenticTenantId()`), `agentId` (`activity.getAgenticInstanceId()`) and `agenticUserId`
  (`activity.getAgenticUser()`). The client caches the token per tenant, agent, agentic user and scope until five
  minutes before it expires, and concurrent evaluations share one acquisition.
- **A token from the host.** `PurviewDlpTokenResolvers.fromAccessTokenProvider(getToken, userId?)` uses a Microsoft
  Graph token the host supplies, for example an on-behalf-of token for the signed-in user (`/me`, delegated
  `Content.Process.User`), or an app-only token with `Content.Process.All` and the user to evaluate for
  (`/users/{userId}`); the app-only path has not been validated end to end. The client does not cache these tokens,
  as they may be for a user the agent context does not identify.

One deadline (`A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS`) covers the token acquisition and the request. The Graph base
URL must be an `https` URL, and the request does not follow a redirect, so the content and the token are never sent
anywhere else.

### Prerequisites

The tenant needs:

1. **Licensing and billing.** Microsoft Purview licensing that covers DLP for AI apps (for example Microsoft 365 E5 or
   E5 Compliance), and pay-as-you-go billing for Purview's AI features (an Azure subscription linked in the Purview
   portal, **Settings > Billing**).
2. **DSPM for AI onboarded** in the Purview portal. Without the first two, `processContent` returns no policy actions
   and nothing is ever blocked, with no error.
3. **A DLP policy for the agent.** A dedicated policy on the AI app location ("Managed cloud apps" in the portal, the
   `Applications` workload), scoped to the agent blueprint's application id (what the SDK sends as the
   `applicationLocation`), with a rule whose action restricts `UploadText` with **Block** (for example with Security &
   Compliance PowerShell: `New-DlpCompliancePolicy -EnforcementPlanes Application` with an `Applications` location for
   the app id, and `New-DlpComplianceRule -RestrictAccess @(@{setting='UploadText';value='Block'})` with the sensitive
   information types to detect). The portal rejects a policy that mixes this location with Exchange, SharePoint,
   OneDrive or Teams. A new policy can take up to an hour to apply.
4. **`Content.Process.User` for the agentic users.** Add the delegated Microsoft Graph permission
   `Content.Process.User` to the blueprint's tenant-wide (`AllPrincipals`) delegated Microsoft Graph grant, appending
   it to the scopes the grant already has, never replacing them:
   `GET https://graph.microsoft.com/v1.0/oauth2PermissionGrants?$filter=clientId eq '{blueprint-sp-object-id}' and consentType eq 'AllPrincipals' and resourceId eq '{graph-sp-object-id}'`,
   then `PATCH https://graph.microsoft.com/v1.0/oauth2PermissionGrants/{grant-id}` with
   `{"scope":"<existing scopes> Content.Process.User"}`. The blueprint's inheritable permissions for Microsoft Graph
   are of kind `allAllowed` (which `a365 setup` configures), so every agent identity's agentic user inherits the
   scope.

`protectionScopes/compute` is not used (it needs `ProtectionScopes.Compute.User`): every evaluation calls
`processContent`, and the returned `protectionScopeState` is only reported.

### What Purview receives

One conversation message (`processConversationMetadata`) per evaluation: the text (`textContent`), a name
(`<agent name> <activity>`; Purview rejects an empty one), the conversation's `correlationId` and `sequenceNumber`
(the context's `session.id` and `sequence`), `isTruncated`, UTC timestamps, `contentCategory: ai` and the agent
(`agents[0]`: the agent identity id, the blueprint id, name and version); the activity; and the agent's name and
version as the integrated and protected application, with the blueprint's application id as the
`applicationLocation` DLP policies are scoped to. Every call sends a new GUID as `client-request-id` (also the content
entry's `identifier`), returned as `PurviewDlpEvaluationResult.correlationId`. Text longer than
`A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS` (default 100000) is cut and sent with `isTruncated: true`.

### Verdicts

- A policy action with `restrictionAction: block` (or `action: blockAccess`) becomes a deny with reason `purview:block`, the message "The request
  was blocked by a Microsoft Purview data loss prevention policy." (for a reply in `enforce` mode, "The response was
  blocked ..."), and the `client-request-id` as evidence (`urn:a365:purview:<client-request-id>`). Other actions (for
  example `warn` or `audit`) allow the content and are counted in `decision.actionCount`.
- When no verdict is obtained (token, transport, timeout or HTTP failure, processing errors, which Graph reports with
  HTTP 200, a response of another shape, or a call resolver that throws or resolves no agent identity), the verdict
  follows `A365_PURVIEW_DLP_FAIL_MODE`: fail open (the default) allows with a `purview:unverified` warning that carries
  the error; fail closed denies with reason `runtime_error:purview_unverified`, which is never reported as a detection.
  The error names the failure or the exception type only (for example `http 403` or `token unavailable: TypeError`),
  never a response body or token.
- **Text that does not fit** follows the fail mode too: Purview's block of the truncated text stands, but its allow
  does not cover the rest, so it is treated like a missing verdict.

`createProtectionEmitter` uses the `parallel/strictest` profile, so with both interceptors registered an action
proceeds only when Defender and Purview both allow it. agent-hooks runs them one after the other, each on its own
copy of the context, so at `input` their latencies add up.

### Usage

```typescript
import {
  DefenderRtpClient,
  DefenderRtpTokenResolvers,
  PurviewDlpClient,
  PurviewDlpTokenResolvers,
} from '@microsoft/agents-a365-tooling';
import {
  A365DefenderInterceptor,
  A365PurviewInterceptor,
  addA365Defender,
  addA365Purview,
  createProtectionEmitter,
} from '@microsoft/agents-a365-tooling-extensions-agenthooks';
import { AgentContextBuilder, proceeds } from '@responsibleai/agent-hooks';

// Once per process: reads ENABLE_A365_DEFENDER_RTP, A365_DEFENDER_RTP_*, ENABLE_A365_PURVIEW_DLP and A365_PURVIEW_DLP_*.
const connection = adapter.connectionManager.getDefaultConnection();
const defender = new DefenderRtpClient();
const defenderTokens = DefenderRtpTokenResolvers.fromAgenticConnection(connection);
const purview = new PurviewDlpClient();
const purviewTokens = PurviewDlpTokenResolvers.fromAgenticUser(connection);

// In the turn handler:
const activity = context.activity;
const agentId = activity.getAgenticInstanceId(); // the agent identity
const tenantId = activity.getAgenticTenantId(); // the agent's tenant
const agenticUserId = activity.getAgenticUser(); // the agent's agentic user
const emitter = createProtectionEmitter();
addA365Defender(emitter, new A365DefenderInterceptor(
  defender,
  () => agentId && tenantId ? { agent: { agentId, tenantId, requestId: activity.id }, tokenResolver: defenderTokens } : null,
));
addA365Purview(emitter, new A365PurviewInterceptor(
  purview,
  // Returning null means there is no agentic user (for example a request that is not agentic):
  // Purview is not called and the fail mode decides.
  () => agentId && tenantId && agenticUserId
    ? {
      agent: {
        agentId,
        tenantId,
        agenticUserId,
        blueprintId: activity.recipient?.agenticAppBlueprintId,
        agentName: 'SampleAgent',
      },
      tokenResolver: purviewTokens,
    }
    : null,
  (result) => console.log(
    `Purview ${result.activity} allowed=${result.allowed} evaluated=${result.evaluated} `
    + `client-request-id=${result.correlationId}${result.error ? ` error=${result.error}` : ''}`),
));

const builder = new AgentContextBuilder({
  agentId: agentId ?? 'my-agent',
  framework: 'my-framework',
  sessionId: activity.conversation?.id ?? 'my-session', // Purview groups the conversation's messages under it
});
const record = await emitter.emitUnchecked(builder.input(activity.text ?? ''));
if (!proceeds(record)) {
  // Blocked: reply with record.verdict.message and stop the turn.
}
```

The interceptor sets the content entry's `correlationId` and `sequenceNumber` from the context's `session.id` and
`sequence`, so Purview's conversation lines up with the host's interception records.

### Configuration

| Variable | Meaning |
|---|---|
| `ENABLE_A365_PURVIEW_DLP` | `true` (or 1, yes, on) to call Purview; `false` (or 0, no, off) or unset leaves it off, and the interceptor allows everything without a call. Any other value fails at startup |
| `A365_PURVIEW_DLP_RESPONSE_MODE` | `audit` (the default) sends replies without waiting and never blocks them; `enforce` blocks them like prompts. Any other value is rejected |
| `A365_PURVIEW_DLP_FAIL_MODE` | `closed` blocks when no verdict is obtained; `open` (the default) allows. Any other value is rejected |
| `A365_PURVIEW_DLP_TIMEOUT_MILLISECONDS` | deadline of each evaluation, token acquisition included (default 10000, at most 2147481647). A value that is not a whole number (for example `10s`) is rejected |
| `A365_PURVIEW_DLP_MAX_CONTENT_CHARACTERS` | the longest text sent (default 100000); longer text is sent truncated and, unless Purview blocks it, follows the fail mode. A value that is not a whole number is rejected |
| `A365_PURVIEW_DLP_GRAPH_BASE_URL` | the Microsoft Graph base URL (default `https://graph.microsoft.com/v1.0`; `https` only) |
| `A365_PURVIEW_DLP_AUTHENTICATION_SCOPE` | overrides the Microsoft Graph token scope (default `https://graph.microsoft.com/.default`) |

As for Defender, the same settings can be supplied through a `ToolingConfiguration` with override functions, passed as
`configProvider` to `PurviewDlpClient` and `createProtectionEmitter` (or as `purviewConfigProvider` when the Purview
client uses its own configuration).

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
