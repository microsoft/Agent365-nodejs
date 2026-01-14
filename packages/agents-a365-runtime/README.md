# @microsoft/agents-a365-runtime

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-runtime?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-runtime)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-runtime?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-runtime)

Core runtime utilities and services for applications built with the Microsoft Agent 365 SDK. This package provides authentication, authorization, and Power Platform API discovery capabilities for building enterprise-ready AI agents.

## Installation

```bash
npm install @microsoft/agents-a365-runtime
```

## Usage

### Agent Settings Service

The Agent Settings Service provides methods to manage agent settings templates and instance-specific settings:

```typescript
import { 
  AgentSettingsService, 
  PowerPlatformApiDiscovery 
} from '@microsoft/agents-a365-runtime';

// Initialize the service
const apiDiscovery = new PowerPlatformApiDiscovery('prod');
const tenantId = 'your-tenant-id';
const service = new AgentSettingsService(apiDiscovery, tenantId);

// Get agent setting template by agent type
const template = await service.getAgentSettingTemplate(
  'my-agent-type',
  accessToken
);

// Set agent setting template
await service.setAgentSettingTemplate(
  {
    agentType: 'my-agent-type',
    settings: { key1: 'value1', key2: 'value2' }
  },
  accessToken
);

// Get agent settings by instance
const settings = await service.getAgentSettings(
  'agent-instance-id',
  accessToken
);

// Set agent settings by instance
await service.setAgentSettings(
  {
    agentInstanceId: 'agent-instance-id',
    agentType: 'my-agent-type',
    settings: { instanceKey: 'instanceValue' }
  },
  accessToken
);
```

For detailed usage examples and implementation guidance, see the [Microsoft Agent 365 Developer Documentation](https://learn.microsoft.com/microsoft-agent-365/developer/?tabs=nodejs).

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
