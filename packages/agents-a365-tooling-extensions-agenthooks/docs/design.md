# Tooling Extensions - agent-hooks - Design Document

This document describes the architecture and design of the `@microsoft/agents-a365-tooling-extensions-agenthooks`
package.

## Overview

The package connects Microsoft Agent 365 real-time protection to the
[agent-hooks](https://github.com/responsibleai/agent-hooks) control contract (AGENT-HOOKS-0.1). An agent-hooks
host (an agent framework adapter, or the application itself) emits an `AgentContext` at each interception point
of the agent loop; registered interceptors return verdicts, which the host composes and enforces.
`A365DefenderInterceptor` forwards the contexts Microsoft Defender for AI evaluates to its prevention endpoint
and maps Defender's verdict back to an agent-hooks verdict.

It is the only Agent 365 package that depends on `@responsibleai/agent-hooks`, a prerelease package with a native
core for a subset of platforms (no musl) and Node.js 20+. The Defender client itself (`DefenderRtpClient`) is in
`@microsoft/agents-a365-tooling` and has no agent-hooks dependency, so core tooling users do not take one on.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                      agent-hooks host                                │
│   AgentContextBuilder ─► InterceptionEmitter.emitUnchecked(context)  │
│        (enforce, parallel/strictest, from createProtectionEmitter)   │
└──────────────────────────────────────────────────────────────────────┘
                                 │ intercept(context)
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    A365DefenderInterceptor                           │
│  1. Allow other points, and everything while Defender RTP is off     │
│  2. resolveCall(context) ─► A365DefenderCall (identity + tokens)     │
│  3. DefenderRtpClient.evaluateHookContext(...)                       │
│  4. onEvaluated(result) for logging (errors ignored)                 │
│  5. toVerdict(result) ─► agent-hooks Verdict                         │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│              DefenderRtpClient (@microsoft/agents-a365-tooling)      │
│  fits the context to Defender's validation, agent identity token,   │
│  x-ms-correlation-id, POST .../v1/protection/evaluate, fail mode     │
└──────────────────────────────────────────────────────────────────────┘
```

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
  from the current turn. `null` or `undefined` allows the context without a call.
- An exception from `resolveCall` or `evaluateHookContext` (an invalid context or identity) is never a verdict:
  it becomes `DefenderRtpClient.unavailable(...)`, which follows the fail mode.
- `onEvaluated` receives every evaluation (correlation id, latency, error) for logging; its errors and rejected
  promises are ignored so logging cannot change a verdict.

### toVerdict

| Defender result | agent-hooks verdict |
|---|---|
| evaluated, `allow` | `allow` with Defender's warnings and `result_labels` |
| evaluated, `deny` or `transform` | `deny`, reason `defender:block[:<reason>]`, Defender's message, evidence `urn:a365:defender:<correlation id>`, labels |
| not evaluated, fail open | `allow` with warning `defender:unverified` carrying the error |
| not evaluated, fail closed | `deny`, reason `runtime_error:defender_unverified`, same warning |

`transform` blocks because this version cannot apply the rewrite, and releasing the original content would defeat
it. The `runtime_error:` prefix is the agent-hooks convention for decision-runtime failures, so a fail-closed
block is never reported as a detection.

### createProtectionEmitter and addA365Defender ([A365AgentHooks.ts](../src/A365AgentHooks.ts))

```typescript
const emitter = addA365Defender(createProtectionEmitter(), interceptor);
```

`createProtectionEmitter` returns an `InterceptionEmitter` in `enforce` mode with the `parallel/strictest`
profile (`Composition.strictest('deny')`): an action proceeds only when every interceptor allows it, and a
transform conflict denies. Its per-interceptor timeout defaults to the Defender timeout plus two seconds, so the
client's own deadline and fail mode apply first; an explicit `interceptorTimeoutMilliseconds` that does not exceed
the Defender timeout is rejected (`RangeError`). An interceptor that exceeds the emitter timeout fails closed as
`host_error:interceptor_timeout`. This matters because the agent-hooks default interceptor timeout (5 s) is below
the Defender default (10 s): a host that registers the interceptor on its own emitter must set a longer timeout.
The emitter keeps the last 1000 records (the agent-hooks default is unbounded).

## Design Decisions

- **A fitted copy of the context is sent.** `DefenderRtpClient` sends a copy of the emitted context, fitted to
  Defender's request validation (normalized, every content string clamped, identifiers and protocol fields
  unchanged), and never modifies the host's context. The host's session, sequence and tool call ids are kept,
  so Defender's evaluations line up with the host's interception records.
- **The fail mode, not a host error, decides a slow call.** One deadline covers the token acquisition and the
  request, and `createProtectionEmitter` rejects an interceptor timeout that does not exceed it.
- **Mirrors the .NET SDK.** `A365DefenderInterceptor`, `A365DefenderCall`, `createProtectionEmitter` and
  `addA365Defender` correspond to the .NET `Microsoft.Agents.A365.Tooling.Extensions.AgentHooks` API, with the same
  verdict mapping, defaults (10 s timeout, 20000 characters, fail open) and environment variables.
- **The agent-hooks dependency is isolated.** Only this package loads the native core.

## File Structure

```
src/
├── index.ts                    # Public API exports
├── A365DefenderInterceptor.ts  # Interceptor, A365DefenderCall, toVerdict
└── A365AgentHooks.ts           # createProtectionEmitter, addA365Defender
```

## Dependencies

- `@microsoft/agents-a365-tooling` - `DefenderRtpClient`, Defender configuration
- `@microsoft/agents-a365-runtime` - configuration provider types
- `@responsibleai/agent-hooks` - `InterceptionEmitter`, `Interceptor`, `Verdict` (pinned prerelease)
