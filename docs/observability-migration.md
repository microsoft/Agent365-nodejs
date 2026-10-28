# Observability retirement and application migration

Agent365 Observability is retired from this repository. Future builds and releases contain only Notifications, Runtime, Tooling, and the three Tooling extensions. Existing npm releases are not unpublished. Migration is an **application change**, not a dependency added to the remaining SDK packages.

## Replacement and verified contract

Use the [Microsoft OpenTelemetry JavaScript distro](https://github.com/microsoft/opentelemetry-distro-javascript) and its onboarding package, [`@microsoft/opentelemetry`](https://www.npmjs.com/package/@microsoft/opentelemetry), initialized with `useMicrosoftOpenTelemetry()`.

Consult the distro's [official Agent365 documentation](https://github.com/microsoft/opentelemetry-distro-javascript/blob/main/A365_DOCUMENTATION.md), [Agent365 migration guide](https://github.com/microsoft/opentelemetry-distro-javascript/blob/main/MIGRATION_A365.md), [API reference](https://microsoft.github.io/opentelemetry-distro-javascript/), and [Microsoft Learn onboarding](https://learn.microsoft.com/microsoft-agent-365/developer/microsoft-opentelemetry?tabs=nodejs). This guide supplements them; it does not promise drop-in compatibility.

Verification snapshot: **2026-10-28**, published package **1.5.0**. Its npm metadata declares Node.js **>=22.0.0**, root `import` and `require` exports with declarations, and the public `@microsoft/opentelemetry/loader` subpath. The repository's `main` currently declares stricter engines (`^22.23.4 || ^24.22.1 || >=26.12.1`); some Learn prerequisites still describe older runtimes. Choose a supported Node release satisfying the **selected published version's** engines and deployment policy, and recheck before upgrading:

```shell
npm view @microsoft/opentelemetry version engines exports --json
```

The remaining Agent365 SDK packages retain their own Node >=18 requirement; that is not a compatibility guarantee for the distro.

## What was removed

| Retired npm package | Removed source | Dedicated tests removed |
|---|---|---|
| `@microsoft/agents-a365-observability` | `packages/agents-a365-observability` | Core, exporter, scope, configuration, tracing, and integration tests under `tests/observability` |
| `@microsoft/agents-a365-observability-hosting` | `packages/agents-a365-observability-hosting` | Hosting/middleware tests under `tests/observability` |
| `@microsoft/agents-a365-observability-extensions-openai` | `packages/agents-a365-observability-extensions-openai` | OpenAI tests under `tests/observability` and `tests/observability-extensions-openai` |
| `@microsoft/agents-a365-observability-extensions-langchain` | `packages/agents-a365-observability-extensions-langchain` | LangChain tests under `tests/observability` |

Their package-root public exports, dual CJS/ESM builds, release/versioning participation, and dedicated Azure OpenAI integration workflow are removed. A historical `observability-tokencache` diagram/mapping was stale, not a fifth current package. The Runtime-only `getObservabilityAuthenticationScope()` and `PROD_OBSERVABILITY_SCOPE` exports were also removed: resolve telemetry authentication with the distro instead of continuing to use a hardcoded legacy scope.

Notifications, Runtime, Tooling, and Tooling framework adapters remain maintained. **Do not uninstall Runtime if your application still uses its authentication, identity, configuration, or discovery APIs.** No maintained implementation depended on the removed packages. The deprecated Runtime constant `PROD_OBSERVABILITY_CLUSTER_CATEGORY` remains a general cluster-default compatibility alias, not a telemetry implementation.

## Update dependencies and imports

Remove only retired packages your application actually installed; the following pnpm commands show all four:

```shell
pnpm remove @microsoft/agents-a365-observability @microsoft/agents-a365-observability-hosting @microsoft/agents-a365-observability-extensions-openai @microsoft/agents-a365-observability-extensions-langchain
pnpm add @microsoft/opentelemetry
```

Use your application's existing package manager, update its lockfile, and remove direct OpenTelemetry dependencies only if no remaining application code needs them. Search source, tests, preload commands, bundler configuration, and deployment settings for old imports, including deep imports.

| Old surface | Application migration |
|---|---|
| `ObservabilityManager`, `ObservabilityBuilder` / `Builder` | Replace startup/configuration with `useMicrosoftOpenTelemetry({ a365: ... })`; no compatible manager/builder root export |
| `ObservabilityConfiguration`, options, default providers | Review `A365Configuration`, `A365Options`, and `MicrosoftOpenTelemetryOptions`; old provider overrides are not mechanically portable |
| `Request`, `SpanDetails` | Public distro names are `A365Request`, `A365SpanDetails` |
| `InvokeAgentScope`, `InferenceScope`, `ExecuteToolScope`, contracts | Available from the distro root, but review current argument/response types and signatures |
| `BaggageBuilder`, trace/context and export-token helpers | Available distro APIs; review propagation, identity, and token semantics |
| Hosting manager, middleware, token cache | Prefer distro `configureA365Hosting`; explicitly configure authentication and content capture |
| OpenAI instrumentor/trace processor; `LangChainTraceInstrumentor`, `LangChainTracer` | Replace explicit registration with distro `instrumentationOptions`; remove old callbacks/instrumentors |
| `PerRequestSpanProcessor`, its configuration/providers and buffer limits | No matching public replacement contract verified; redesign and test delivery/latency requirements rather than copying options |

Names such as `Agent365Exporter`, `ObservabilityHostingManager`, and `A365_OBSERVABILITY_*` can legitimately remain when imported/configured through the **replacement**. A name match alone is not a retired dependency. Do not copy deleted implementations into the remaining packages.

## Initialize before application modules load

Initialize once per process before loading instrumented frameworks. Both patterns below use **JavaScript runtime files**, not uncompiled TypeScript. `acquireTelemetryToken` is an application-owned authentication function; it must return a valid token or reject explicitly and must not load instrumented frameworks before startup.

### CommonJS

Create `telemetry.cjs`:

```javascript
const { useMicrosoftOpenTelemetry } = require('@microsoft/opentelemetry');
const { acquireTelemetryToken } = require('./telemetry-auth.cjs');

useMicrosoftOpenTelemetry({
  a365: {
    enabled: true,
    enableObservabilityExporter: true,
    tokenResolver: (agentId, tenantId, authScopes) =>
      acquireTelemetryToken(agentId, tenantId, authScopes),
  },
  instrumentationOptions: {
    openaiAgents: { enabled: true },
    langchain: { enabled: true },
  },
});
```

Preload it before the entry point:

```shell
node --require ./telemetry.cjs ./app.cjs
```

### ESM

Create `telemetry.mjs` using the distro's supported loader registration:

```javascript
import '@microsoft/opentelemetry/loader';
import { useMicrosoftOpenTelemetry } from '@microsoft/opentelemetry';
import { acquireTelemetryToken } from './telemetry-auth.mjs';

useMicrosoftOpenTelemetry({
  a365: {
    enabled: true,
    enableObservabilityExporter: true,
    tokenResolver: (agentId, tenantId, authScopes) =>
      acquireTelemetryToken(agentId, tenantId, authScopes),
  },
  instrumentationOptions: {
    openaiAgents: { enabled: true },
    langchain: { enabled: true },
  },
});
```

```shell
node --import ./telemetry.mjs ./app.mjs
```

**Calling initialization textually above static imports in `app.mjs` is insufficient**: ESM dependencies load/evaluate before the importing module's body. Register the loader and initialize in the preload before loading the application. The loader-only command `node --import @microsoft/opentelemetry/loader ...` registers hooks; it does not substitute for your configured initialization. Keep preload dependencies lightweight, including their transitive imports. Validate framework instrumentation in the actual deployment/bundler/serverless environment; module rewriting or bundling can change hook behavior.

Set service identity with the distro's OpenTelemetry resource options or `OTEL_RESOURCE_ATTRIBUTES` (`service.name`, `service.version`), not old builder methods. Any direct OTel resource imports need compatible application-owned dependencies.

## Authentication and Agent365 delivery

`a365.enabled: true` enables Agent365 enrichment; **also set `enableObservabilityExporter: true`** for Agent365 HTTP export. Merely configuring generic OTLP or Azure Monitor does not preserve Agent365 routing, token acquisition, payload filtering, identity, or delivery semantics.

Supply a token resolver for the chosen identity/endpoint. The simple resolver receives `(agentId, tenantId, authScopes)` and returns a string or `Promise<string>`. The contextual resolver accepts `TokenResolverContext`, supports `identity.agenticUserId`, and takes precedence when supplied. A cache must be populated/refreshed through your authenticated flow; do not return empty strings as successful credentials.

The retired exporter used `/observabilityService` with an **app-only resolver**, including per-request export. Request-context tokens were not fallback credentials. The distro's `useS2SEndpoint` defaults to `false`: explicitly choose and validate the endpoint and identity flow rather than assuming old behavior. Check current scopes, audience, tenant consent, and `Agent365.Observability.OtelWrite` permissions in the official migration/authentication documentation. Do not reuse the removed Runtime hardcoded scope or confuse MCP Tooling tokens with telemetry tokens.

The distro documents a changed default scope (`api://9b975845-388f-4429-889e-eab1ef63949c/.default`) and distinct OBO/S2S requirements. Treat these as identity-flow-specific configuration, not interchangeable strings. Verify acquisition, expiry/refresh, denied consent, and 401/403 handling against your tenant before rollout.

Some environment names remain supported upstream: `ENABLE_A365_OBSERVABILITY_EXPORTER`, `A365_OBSERVABILITY_SCOPES_OVERRIDE`, `A365_OBSERVABILITY_DOMAIN_OVERRIDE`, `A365_OBSERVABILITY_LOG_LEVEL`, and `CLUSTER_CATEGORY`. They do not make every old setting compatible. Revalidate precedence against the selected distro version. Old `ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT` and `A365_PER_REQUEST_MAX_*` settings have no verified equivalent; remove or redesign them explicitly.

## Context, manual spans, hosting, and frameworks

Use distro `BaggageBuilder` to scope tenant/agent/conversation/session metadata around asynchronous work:

```javascript
import { BaggageBuilder } from '@microsoft/opentelemetry';

await new BaggageBuilder()
  .tenantId(tenantId)
  .agentId(agentId)
  .conversationId(conversationId)
  .sessionId(sessionId)
  .build()
  .run(async () => {
    await handleRequest();
  });
```

This is an application-body ESM fragment after preloading; CommonJS obtains the same API with `require()`. Use `injectContextToHeaders`, `extractContextFromHeaders`, or `runWithExtractedTraceContext` for process boundaries, following upstream signatures. Validate/sanitize untrusted incoming baggage and identity; never place tokens, secrets, or unnecessary personal content in baggage.

Manual scopes remain available, but typed tool argument payloads, response recording, and scope details have changed. Follow the [current Agent365 scope examples](https://github.com/microsoft/opentelemetry-distro-javascript/blob/main/A365_DOCUMENTATION.md), await asynchronous `run()` work, and dispose scopes in `finally` so spans end after completion/errors. Recheck parent/child relationships, token usage, tool arguments, exceptions, and output events rather than replacing import strings alone.

For hosting, use `configureA365Hosting(adapter, { enableBaggage: true, enableOutputLogging: false })` after initialization and before requests. Enable output logging only after a privacy review. It does not configure token acquisition for you.

OpenAI Agents and LangChain instrumentation are bundled and enabled by default for supported framework versions. `instrumentationOptions.openaiAgents` and `.langchain` control them. Remove old `.enable()` calls and registered legacy tracers/processors to avoid duplicate spans. In A365-only mode, non-GenAI instrumentation (for example HTTP/databases) is disabled by default; enable required categories explicitly. Consult upstream for supported framework/version combinations. Content capture requires deliberate sensitive-data settings (including framework-specific options); do not assume old capture policy carries forward.

## Shutdown, flushing, and unsupported assumptions

During an application-owned graceful shutdown, first stop accepting requests and await in-flight work, then:

```javascript
// ESM; CommonJS: const { shutdownMicrosoftOpenTelemetry } = require('...');
import { shutdownMicrosoftOpenTelemetry } from '@microsoft/opentelemetry';

await shutdownMicrosoftOpenTelemetry();
```

Await this in your asynchronous signal/lifecycle handler; a synchronous `exit` handler or immediate `process.exit()` cannot flush reliably. Handle rejected shutdown explicitly through application logging/error policy. No generic root-level `forceFlush()` API was verified. Applications explicitly owning an `Agent365Exporter` can use its documented `forceFlush()` contract; do not reach into private distro internals.

The current A365 HTTP exporter requests durable delivery by default. Review its platform requirements: on Unix, provision an existing absolute private durable-storage root; persisted telemetry is plaintext and delivery is at least once. `durableDelivery: { enabled: false }` chooses network-only delivery, with different loss guarantees. Shutdown is bounded and does not drain an existing spool; exporter force-flush replay is also bounded. See upstream operational guidance for permissions, storage, replay, timeouts, and recovery.

Unsupported migration assumptions include old per-request buffering/flush semantics, custom provider factories and builder hooks, identical trace schemas, automatic token fallback, identical log/content policies, and identical instrumentation coverage. Build application regression tests for these requirements. Do not retain both SDKs to mask gaps or assume OTLP success proves Agent365 ingestion. Validate actual backend receipt, identity separation, retries, shutdown, and failures.

## Repository release safeguards

Root and pnpm workspace lists explicitly contain six maintained packages; version tooling uses that list. CI uses the root guarded packaging path:

```shell
pnpm run pack artifacts/release-candidate
node packPackages.js --verify artifacts/release-candidate
```

Use an output directory that does **not** already exist (on Windows, use backslashes). The guard rejects physical retired package directories, cleans/rebuilds maintained packages, packs only explicit allowed manifests, and independently inspects all six archives. It checks package identity, dependency sections, entry points, retired paths/imports/known implementation signatures, and duplicate/missing packages, then emits a SHA-256 `packages.json` receipt. Historical changelog entries are preserved and are not executable implementation.

Reviewed stale `dist` trees from deleted packages must be removed before packing. Do not copy cached `packages/*.tgz`, reuse old output directories, publish by wildcard discovery, or treat a successful individual `pnpm pack` as removal verification. Package owners must publish only verified receipt-listed artifacts from the approved commit. These repository safeguards do **not** revoke already uploaded artifacts, old-branch pipelines, registry permissions, or external release jobs.

## Owner-operated npm retirement checklist

No registry operation is performed by this change. An authorized package owner/maintainer must:

1. Publish this guide at the canonical link below and announce the breaking removal, including Runtime scope-helper removal. Confirm migration destinations, ownership, and support routing.
2. Audit npm owners/tokens/trusted publishers and every external pipeline, release branch/tag trigger, scheduled job, artifact feed, and manual release runbook. Disable retired-package publishing or backport the allowlist/artifact checks to every branch still allowed to release. Enforce the package-name allowlist independently in the external publisher.
3. Quarantine/delete specifically identified retired cached tarballs and artifacts in external drops/caches. Rebuild from the approved commit into fresh directories; compare receipt hashes immediately before publishing. Do not replay an old successful build.
4. Review all versions/dist-tags of the four exact packages, including prereleases, and confirm authorization. Run the following **only after the migration link is live**, using your normal authenticated npm environment.
5. Check registry deprecation metadata for representative stable/prerelease versions and confirm installation displays the warning. Monitor consumer migration and stop new retired-package releases. Deprecation **warns**; it neither replaces dependencies nor prevents installation. **Do not unpublish.**

[npm's current deprecation syntax](https://docs.npmjs.com/cli/v11/commands/npm-deprecate) is `npm deprecate <package-spec> <message>`. Quoted `@*` targets all versions, including prereleases. This command is workspace-unaware; run once for each exact package:

```shell
npm deprecate "@microsoft/agents-a365-observability@*" "Retired: migrate your application to @microsoft/opentelemetry using useMicrosoftOpenTelemetry(). Migration: https://github.com/microsoft/Agent365-nodejs/blob/main/docs/observability-migration.md"
npm deprecate "@microsoft/agents-a365-observability-hosting@*" "Retired: migrate hosting telemetry to @microsoft/opentelemetry. Migration: https://github.com/microsoft/Agent365-nodejs/blob/main/docs/observability-migration.md"
npm deprecate "@microsoft/agents-a365-observability-extensions-openai@*" "Retired: use OpenAI Agents instrumentation in @microsoft/opentelemetry. Migration: https://github.com/microsoft/Agent365-nodejs/blob/main/docs/observability-migration.md"
npm deprecate "@microsoft/agents-a365-observability-extensions-langchain@*" "Retired: use LangChain instrumentation in @microsoft/opentelemetry. Migration: https://github.com/microsoft/Agent365-nodejs/blob/main/docs/observability-migration.md"
```

These are ready-to-paste owner actions, not commands for CI or this implementation session. Preserve historical changelogs and released package availability.
