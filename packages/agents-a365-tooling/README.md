# @microsoft/agents-a365-tooling

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-tooling?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-tooling?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-tooling)

Core tooling functionality for MCP (Model Context Protocol) tool server management in applications built with the Microsoft Agent 365 SDK. This package provides the foundation for discovering, registering, and managing tool servers across different AI frameworks.

## Installation

```bash
npm install @microsoft/agents-a365-tooling
```

## Usage

For detailed usage examples and implementation guidance, see the [Microsoft Agent 365 Tooling Documentation](https://learn.microsoft.com/microsoft-agent-365/developer/tooling?tabs=nodejs).

### Defender real-time protection

Defender protection is disabled by default. Configure the endpoint explicitly before enabling it,
then use the four lifecycle methods
`enforceAgentRequest`, `enforceAgentResponse`, `enforceToolRequest`, and
`enforceToolResponse`; `executeTool` composes both tool checks around a callback.

```typescript
import {
  DefenderRtpClient,
  ToolingConfiguration,
} from '@microsoft/agents-a365-tooling';

const configuration = new ToolingConfiguration({
  isDefenderRtpEnabled: () => true,
  defenderRtpEndpoint: () => '<defender-rtp-endpoint>',
});
const defender = new DefenderRtpClient({
  configProvider: { getConfiguration: () => configuration },
});

const result = await defender.executeTool(
  {
    agentId,
    tenantId,
    blueprintId,
    sessionId,
    tool: {
      name: 'send_email',
      description: 'Sends an email on behalf of the user.',
    },
    arguments: { to, subject },
  },
  { accessToken },
  () => sendEmail(to, subject),
);
```

Set `A365_DEFENDER_RTP_ENDPOINT` to `<defender-rtp-endpoint>` when using environment-based
configuration. The SDK supports customer credentials, a host-provided token callback, an existing
access token, and Blueprint to Agent Identity FMI authentication. Host token callbacks and FMI
contexts require an explicit `tokenScope`; customer credentials default to
`api://<customer-app-id>/.default`.

`blockAction: true` is enforced. Transport, authentication, and protocol failures return
`evaluated: false` and follow `defenderRtpFailClosed` (default is fail open).

#### Live verification

Unit tests mock the network. Live scripts require endpoint and authentication settings supplied
through the process environment.

Inject the short-lived token and request identity values through the process environment, then run:

```bash
npm run smoke:defender-rtp
```

Set `A365_DEFENDER_RTP_ENDPOINT` to `<defender-rtp-endpoint>`. For a pre-acquired token, set
`A365_DEFENDER_RTP_ACCESS_TOKEN`,
`A365_DEFENDER_RTP_AGENT_ID`, and `A365_DEFENDER_RTP_TENANT_ID`. To exercise the built-in FMI
flow instead, set `AGENT365_TENANT_ID`, `AGENT365_AGENT_ID`, `AGENT365_CLIENT_ID` (the blueprint),
`AGENT365_CLIENT_SECRET`, and `A365_DEFENDER_RTP_TOKEN_SCOPE`. For customer credentials,
set `A365_DEFENDER_RTP_CLIENT_ID`, `A365_DEFENDER_RTP_CLIENT_SECRET`, and optionally
`A365_DEFENDER_RTP_TOKEN_SCOPE` (defaults to `api://<customer-app-id>/.default`). The runner does not print
credentials or payload content; it reports only evaluation metadata.
Set `A365_DEFENDER_RTP_BLOCKED_TEST_URL` to a test URL approved for your environment. Set
`A365_DEFENDER_RTP_REQUIRE_EXPECTED_DECISIONS=true` to require the benign payload to be allowed
and that test URL to be blocked.

#### Video-friendly local agent demo

Set `A365_DEFENDER_RTP_ENDPOINT` to `<defender-rtp-endpoint>` and provide the customer app's tenant,
client ID, and short-lived secret, then run:

```bash
npm run demo:defender-rtp
```

The deterministic local agent demonstrates:

1. A benign turn passing `before_agent`, `before_tool`, `after_tool`, and `after_agent`.
2. A known malicious URL blocked at `before_tool`.
3. `TOOL EXECUTED: false`, proving the side effect never ran.

Required variables: `A365_DEFENDER_RTP_TENANT_ID`, `A365_DEFENDER_RTP_CLIENT_ID`, and
`A365_DEFENDER_RTP_CLIENT_SECRET`. Set `A365_DEFENDER_RTP_BLOCKED_TEST_URL` to a test URL approved
for your environment. `A365_DEFENDER_RTP_TOKEN_SCOPE` defaults to
`api://<customer-app-id>/.default`.

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
