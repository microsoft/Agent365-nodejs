# Per-request export (token via OpenTelemetry Context)

This document explains how to enable **per-request export** for `@microsoft/agents-a365-observability` and how to provide an export token *per incoming request* using OpenTelemetry Context.

## What it does

When per-request export is enabled:

- The SDK uses `PerRequestSpanProcessor` instead of OpenTelemetry’s `BatchSpanProcessor`.
- Spans are **buffered per trace** and exported when the request/trace completes.
- The Agent 365 exporter reads the auth token from the **active OpenTelemetry Context** at export time (set via `runWithExportToken`).

This is useful when tokens are request-scoped (multi-tenant, delegated auth, per-user tokens, etc.).

## Enable per-request export

Set these environment variables:

```bash
ENABLE_OBSERVABILITY=true
ENABLE_A365_OBSERVABILITY_EXPORTER=true
ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT=true
```

Then build/start observability as usual (the builder will pick the correct span processor automatically based on the env var).

## Provide the token per request

At your **request boundary** (e.g., Express route handler, bot adapter handler), acquire a token using your auth flow, then wrap the request handling code with `runWithExportToken(token, fn)`.

Example (Express-style handler):

```ts
import { runWithExportToken } from '@microsoft/agents-a365-observability';

app.post('/api/messages', async (req, res) => {
  const token = await acquireTokenSomehow(req); // your auth

  await runWithExportToken(token, async () => {
    // Any spans created in here (and async work chained from here)
    // will export using this token.
    await handleRequest(req, res);
  });
});
```

Notes:

- `runWithExportToken` uses OpenTelemetry Context (AsyncLocalStorage) so it must wrap the async call chain that creates the spans.
- In per-request export mode, the exporter will log an error if no token is available in context.

## Guardrails (recommended)

Per-request buffering can increase memory usage and cause export bursts during traffic spikes. `PerRequestSpanProcessor` includes guardrails that you can tune via env vars:

- `A365_PER_REQUEST_MAX_CONCURRENT_EXPORTS` (default `20`): caps concurrent exports across requests/traces.
- `A365_PER_REQUEST_MAX_TRACES` (default `1000`): caps concurrently buffered traces.
- `A365_PER_REQUEST_MAX_SPANS_PER_TRACE` (default `5000`): caps buffered ended spans per trace.

Export timing can also be tuned:

- `A365_PER_REQUEST_FLUSH_GRACE_MS` (default `250`): how long to wait after the root span ends before flushing a trace that still has open child spans.
- `A365_PER_REQUEST_MAX_TRACE_AGE_MS` (default `1800000`): maximum time to keep a trace buffered before dropping (not exporting). (30 minutes)

Set to `0` (or negative) to disable a specific guardrail.