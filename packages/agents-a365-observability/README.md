# @microsoft/agents-a365-observability

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-observability?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-observability)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-observability?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-observability)

OpenTelemetry-based observability and tracing for Microsoft Agents A365 applications. This package provides comprehensive monitoring capabilities for agent invocations, tool executions, and AI model inference calls with seamless Azure Monitor integration.

## Installation

```bash
npm install @microsoft/agents-a365-observability
```

## Usage

For detailed usage examples and implementation guidance, see the [Microsoft Agent 365 Observability Documentation](https://learn.microsoft.com/microsoft-agent-365/developer/observability?tabs=nodejs).

### OBS endpoint

All exports use `/observabilityService/tenants/{tenantId}/otlp/agents/{agentId}/traces?api-version=1`,
including batch and per-request exports from AI Teammate and OBO workloads. The exporter
never falls back to `/observability`. The `useS2SEndpoint` option is deprecated and ignored,
including when set to `false`; domain overrides change the host, not this route.

Endpoint selection does not acquire or convert tokens. Supply an **app-only** OBS token
for the exporting tenant and agent identity with `Agent365.Observability.OtelWrite`
application permission. The S2S service rejects delegated (`scp`) tokens, including
AI Teammate user tokens. Keep workload authentication
(such as OBO for MCP or Microsoft Graph) separate from OBS authentication. An authorization
failure is not a reason to retry telemetry on the OBO route.

When using the hosting token cache, call
`RefreshObservabilityToken(agentId, tenantId, appOnlyTokenResolver)`. The old
`TurnContext`/`Authorization` overload throws rather than acquiring a delegated OBS token.
S2S ingestion may remove unverified user attribution; routing a workload through S2S
does not establish that its caller identity is trusted.

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
