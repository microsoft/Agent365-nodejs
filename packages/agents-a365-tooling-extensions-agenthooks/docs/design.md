# Tooling Extensions - agent-hooks - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling-extensions-agenthooks`
package.

## Overview

The package connects Microsoft Agent 365 real-time protection to the
[agent-hooks](https://github.com/responsibleai/agent-hooks) control contract (AGENT-HOOKS-0.1). An agent-hooks
host (an agent framework adapter, or the application itself) emits an `AgentContext` at each interception point
of the agent loop; registered interceptors return verdicts, which the host composes and enforces.
`A365DefenderInterceptor` forwards the contexts Microsoft Defender for AI evaluates to its prevention endpoint
and maps Defender's verdict back to an agent-hooks verdict. `A365PurviewInterceptor` sends the text of the user's
message and of the reply to Microsoft Purview data loss prevention (DLP) through Microsoft Graph and maps Purview's
policy actions back to an agent-hooks verdict. Both compose on one emitter.

It is the only Agent 365 package that uses `@responsibleai/agent-hooks`, a prerelease package with a native core for
a subset of platforms (no musl) and Node.js 20+, and declares it as a peer dependency (`>=0.1.0-alpha.5 <0.2.0`).
The Defender and Purview clients themselves (`DefenderRtpClient`, `PurviewDlpClient`) are in
`@microsoft/agents-a365-tooling` and have no agent-hooks dependency, so core tooling users do not take one on.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      agent-hooks host                                │
│   AgentContextBuilder ─► InterceptionEmitter.emitUnchecked(context)  │
│        (enforce, parallel/strictest, from createProtectionEmitter)   │
└──────────────────────────────────────────────────────────────────────┘
                                 │ intercept(context)
                                 ▼
┌───────────────────────────────────┐ ┌────────────────────────────────────┐
│      A365DefenderInterceptor      │ │       A365PurviewInterceptor       │
│ 1. Allow other points, and all    │ │ 1. Allow other points, all while   │
│    while Defender RTP is off      │ │    Purview DLP is off, and no text │
│ 2. resolveCall ─► identity+tokens │ │ 2. resolveCall ─► identity+tokens  │
│ 3. evaluateHookContext(...)       │ │ 3. evaluate('uploadText' at input, │
│ 4. toVerdict ─► Verdict           │ │    'downloadText' at output; audit │
│ 5. onEvaluated afterwards         │ │    mode: in the background)        │
│                                   │ │ 4. toVerdict ─► Verdict            │
│                                   │ │ 5. onEvaluated afterwards          │
└───────────────────────────────────┘ └────────────────────────────────────┘
                 │                                      │
                 ▼                                      ▼
┌───────────────────────────────────┐ ┌────────────────────────────────────┐
│ DefenderRtpClient (tooling)       │ │ PurviewDlpClient (tooling)         │
│ fitted context, agent identity    │ │ text, agentic user token,          │
│ token, x-ms-correlation-id,       │ │ client-request-id, POST Graph      │
│ POST .../v1/protection/evaluate,  │ │ .../me/dataSecurityAndGovernance/  │
│ fail mode                         │ │ processContent, fail mode          │
└───────────────────────────────────┘ └────────────────────────────────────┘
```

The emitter composes the two verdicts (`parallel/strictest`: a deny from either wins). agent-hooks dispatches
parallel profiles one interceptor after the other over isolated copies of the context, so at `input` the two
latencies add up.

## Key Components

### A365DefenderInterceptor ([A365DefenderInterceptor.ts](../src/A365DefenderInterceptor.ts))

An agent-hooks `Interceptor` registered under the name `defender`.

```typescript
new A365DefenderInterceptor(
  client: DefenderRtpClient,
  resolveCall: (context: AgentContext) => A365DefenderCall | null | undefined | Promise<...>,
  onEvaluated?: (result: DefenderRtpEvaluationResult) => void,
)
```

- Defender evaluates `input`, `pre_tool_call`, `post_tool_call` and `output`. Other points, and every point while
  `ENABLE_A365_DEFENDER_RTP` is off, are allowed without calling `resolveCall` or Defender.
- `resolveCall` returns the agent identity and token resolver for a context (`A365DefenderCall`), for example
  from the current turn. `null` or `undefined` means no agent identity is available: Defender is not called and
  the context follows the fail mode, so a missing identity can never bypass a fail-closed configuration.
- An exception from `resolveCall` or `evaluateHookContext` (an invalid context or identity) is never a verdict:
  it becomes `DefenderRtpClient.unavailable(...)`, which follows the fail mode.
- `onEvaluated` receives every evaluation, including the ones without a verdict (correlation id, latency, error),
  for logging. It runs after the verdict is returned, on a later turn of the event loop, off the interceptor's
  timed path, so a slow listener cannot delay the action or push it past the emitter's timeout. Its errors and
  rejections (of any thenable it returns, including a promise from another realm) are ignored so logging cannot
  change a verdict.

### toVerdict

| Defender result | agent-hooks verdict |
|---|---|
| evaluated, `allow` | `allow` with Defender's warnings and `result_labels`; a warning reason in the `host_error:` namespace, which agent-hooks reserves for the host, becomes `defender:warning` |
| evaluated, `deny` or `transform` | `deny`, reason `defender:block[:<reason>]`, Defender's message, evidence `urn:a365:defender:<correlation id>`, labels |
| not evaluated, fail open | `allow` with warning `defender:unverified` carrying the error |
| not evaluated, fail closed | `deny`, reason `runtime_error:defender_unverified`, same warning |
| `allow` of a truncated copy (`truncated`) | as not evaluated: the fail mode decides; when allowing, Defender's warnings and labels follow the unverified warning |
| `deny` or `transform` of a truncated copy | the block stands, as for an evaluated `deny` |

Content under decision that does not fit (longer than `A365_DEFENDER_RTP_MAX_CONTENT_CHARACTERS`, or beyond its
share of the copy's total), or whose keys collide once made well formed, reaches Defender only as an incomplete
copy, so an allow of it does not cover the rest; treating it as authoritative would let padding carry a payload
past the limit unseen. The same holds at a tool call for the called tool's declaration, when its description or
schema was cut or it was not among the first 10000 declarations searched. A `transform` maps to a deny, so on a
truncated copy it blocks like a `deny`.

`transform` blocks because this version cannot apply the rewrite, and releasing the original content would defeat
it. The `runtime_error:` prefix is the agent-hooks convention for decision-runtime failures, so a fail-closed
block is never reported as a detection.

### A365PurviewInterceptor ([A365PurviewInterceptor.ts](../src/A365PurviewInterceptor.ts))

An agent-hooks `Interceptor` registered under the name `purview`.

```typescript
new A365PurviewInterceptor(
  client: PurviewDlpClient,
  resolveCall: (context: AgentContext) => A365PurviewCall | null | undefined | Promise<...>,
  onEvaluated?: (result: PurviewDlpEvaluationResult) => void,
)
```

```
input  ──► text of input.content  ──► PurviewDlpClient.evaluate('uploadText')   ──► toVerdict, awaited
output ──► text of output.content ──► audit:   evaluate('downloadText') in the background ──► allow at once
                                      enforce: evaluate('downloadText')                   ──► toVerdict, awaited
other points, Purview DLP disabled, or content without text ──► allow, no call
```

- `input` is evaluated as `uploadText` and `output` as `downloadText`; other points, every point while
  `ENABLE_A365_PURVIEW_DLP` is off, and content without text are allowed without calling `resolveCall` or Purview.
  The text of a string is the string; of structured content, its string and number values in order, one per line,
  each object read once. Structured content is read lazily and within bounds: at most the limit plus one
  character of text is kept, at most four values per character of the limit are read (empty values count), and
  nesting deeper than 32 levels is left unread. Content read only in part is passed to the client as
  `truncated`, so Purview's block of what was read stands and its allow follows the fail mode (as does content
  that is still blank where reading stopped).
- `resolveCall` returns the agent identity and token resolver (`A365PurviewCall`). The interceptor sets the agent
  context's `sessionId` and `sequence` from the context (`session.id`, `sequence`), so Purview's conversation lines up
  with the interception records, and `agentName` from `agent.name` when the call sets none. `null` or `undefined`
  means no agent identity: Purview is not called and the context follows the fail mode
  (`no agent identity was resolved`). An exception from `resolveCall`, the configuration or the client does too;
  it is described by `PurviewDlpClient.describeError`, which keeps the message only of errors the SDK raised
  itself, as a host's (for example from a configuration provider) may carry a token or a response body.
- **Replies in `audit` mode** (`A365_PURVIEW_DLP_RESPONSE_MODE`, the default): Purview DLP policies for custom AI
  apps cannot restrict replies, so the evaluation starts in the background and the interceptor returns `allow` at
  once, whatever the fail mode. The background evaluation is bounded by the client's own timeout and never by the
  emitter (which passes no cancellation), converts every failure to a not-evaluated result, reports to `onEvaluated`,
  and catches whatever remains, so it never leaves an unhandled rejection. In `enforce` mode the reply is awaited and
  mapped like the input.
- `onEvaluated` receives every evaluation, as for Defender: after the verdict is returned, off the timed path, with
  its errors and rejections ignored.

### toVerdict (Purview)

| Purview result | agent-hooks verdict |
|---|---|
| evaluated, a policy action with `restrictionAction: block` or `action: blockAccess` | `deny`, reason `purview:block`, "The request was blocked by a Microsoft Purview data loss prevention policy." ("The response ..." for a reply), evidence `urn:a365:purview:<client-request-id>` |
| evaluated, other or no actions | `allow` |
| not evaluated, fail open | `allow` with warning `purview:unverified` carrying the error |
| not evaluated, fail closed | `deny`, reason `runtime_error:purview_unverified`, same warning |
| allow of truncated text (`truncated`) | as not evaluated: the fail mode decides |
| block of truncated text | the block stands |

Processing errors, which Graph reports with HTTP 200 (an empty entry name is a permanent bad request reported that
way), are not a verdict. An allow of truncated text does not cover the rest of it, so treating it as authoritative
would let padding carry sensitive text past the limit unseen.

### createProtectionEmitter, addA365Defender and addA365Purview ([A365AgentHooks.ts](../src/A365AgentHooks.ts))

```typescript
const emitter = addA365Purview(addA365Defender(createProtectionEmitter(), defenderInterceptor), purviewInterceptor);
```

`createProtectionEmitter` returns an `InterceptionEmitter` in `enforce` mode with the `parallel/strictest`
profile (`Composition.strictest('deny')`): an action proceeds only when every interceptor allows it, and a
transform conflict denies. Its per-interceptor timeout defaults to the longer client timeout plus two seconds: the
Defender timeout, and the Purview timeout when Purview DLP is enabled (read from `purviewConfigProvider`, which
defaults to `configProvider`). So each client's own deadline and fail mode apply first; an explicit
`interceptorTimeoutMilliseconds` that does not exceed that client timeout, or that is not an integer of at most
2147483647 (Node's largest timer delay, beyond which a timer fires after 1 ms), is rejected (`RangeError`). A
disabled Purview client makes no calls, so its timeout is then ignored, which keeps the emitter of a Defender-only
host unchanged. For the same reason as above, each client timeout is at most 2147481647, so the default emitter
timeout stays in range. An interceptor that exceeds the emitter timeout fails closed as
`host_error:interceptor_timeout`. This matters because the agent-hooks default interceptor timeout (5 s) is below
the clients' default (10 s): a host that registers the interceptors on its own emitter must set a longer timeout.
The timeout is read once, when the emitter is created; with a configuration whose timeouts change per request,
create the emitter per turn or pass an `interceptorTimeoutMilliseconds` above the largest value. The emitter keeps
the last 1000 records (the agent-hooks default is unbounded). `addA365Purview` registers the Purview interceptor
under the name `purview`, as `addA365Defender` does the Defender one under `defender`.

## Design Decisions

- **A fitted copy of the context is sent.** `DefenderRtpClient` sends a copy of the emitted context, fitted to
  Defender's request validation (normalized, every string well formed, each content string clamped, at most four
  times that much content in all with the content under decision first, optional fields of another shape left
  out, identifiers and protocol fields unchanged), and never modifies the host's context. The host's session,
  sequence and tool call ids are kept, so Defender's evaluations line up with the host's interception records.
- **The fail mode, not a host error, decides a slow call.** One deadline covers the token acquisition and the
  request, and `createProtectionEmitter` rejects an interceptor timeout that does not exceed it.
- **Purview audits replies by default.** Purview DLP policies for custom AI apps restrict only prompts, so an awaited
  reply evaluation would only add latency; the reply is sent in the background instead and still recorded for audit.
  `enforce` is available for tenants whose policies can restrict replies.
- **Purview sees text, not the agent-hooks context.** `processContent` evaluates text content, so the interceptor
  sends the text of the message or reply; the agent-hooks session id and sequence become the conversation's
  `correlationId` and `sequenceNumber`.
- **Mirrors the .NET SDK.** `A365DefenderInterceptor`, `A365DefenderCall`, `createProtectionEmitter` and
  `addA365Defender` correspond to the .NET `Microsoft.Agents.A365.Tooling.Extensions.AgentHooks` API, with the same
  verdict mapping, defaults (10 s timeout, 20000 characters, fail open) and environment variables. The Purview
  support (`A365PurviewInterceptor`, `A365PurviewCall`, `addA365Purview`, `PurviewDlpClient`) is designed to match the
  .NET and Python SDKs, with the same environment variables, defaults (10 s timeout, 100000 characters, fail open,
  audited replies) and verdict mapping.
- **agent-hooks is a peer dependency, isolated to this package.** Only this package loads the native core. The
  application installs `@responsibleai/agent-hooks` itself, so the emitter, `AgentContextBuilder`, `proceeds` and
  `InterceptionBlocked` it imports are the same copy this package uses: with two copies, `addA365Defender` would
  not accept the application's emitter (TypeScript rejects classes with private members from separate
  declarations) and `instanceof` checks would fail. The range admits the 0.1.0 prereleases from alpha.5 on
  (beta.1 included) and 0.1.x releases; development and tests pin `0.1.0-alpha.5`.

## File Structure

```
src/
├── index.ts                    # Public API exports
├── A365DefenderInterceptor.ts  # Interceptor, A365DefenderCall, toVerdict
├── A365PurviewInterceptor.ts   # Interceptor, A365PurviewCall, toVerdict
└── A365AgentHooks.ts           # createProtectionEmitter, addA365Defender, addA365Purview
```

## Dependencies

- `@microsoft/agents-a365-tooling` - `DefenderRtpClient`, `PurviewDlpClient`, their configuration
- `@microsoft/agents-a365-runtime` - configuration provider types
- `@responsibleai/agent-hooks` - `InterceptionEmitter`, `Interceptor`, `Verdict` (peer dependency,
  `>=0.1.0-alpha.5 <0.2.0`; development and tests pin `0.1.0-alpha.5`)
