# @microsoft/agents-a365-runtime

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-runtime?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-runtime)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-runtime?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-runtime)

Core runtime utilities and services for Microsoft Agents A365 applications. This package provides authentication, authorization, and Power Platform API discovery capabilities for building enterprise-ready AI agents.

## Installation

```bash
npm install @microsoft/agents-a365-runtime
```

## Usage

### Authentication Service

```typescript
import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';
import { TurnContext } from '@microsoft/agents-hosting';

// Get agentic user token (static method)
const token = await AgenticAuthenticationService.GetAgenticUserToken(
  authorization,
  turnContext
);
```

### Power Platform API Discovery

```typescript
import { PowerPlatformApiDiscovery, ClusterCategory } from '@microsoft/agents-a365-runtime';

// Create API discovery service
const apiDiscovery = new PowerPlatformApiDiscovery(ClusterCategory.Prod);

// Get service endpoints
const mcpPlatformEndpoint = apiDiscovery.getMcpPlatformEndpoint();
const toolingGatewayEndpoint = apiDiscovery.getToolingGatewayEndpoint();
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
