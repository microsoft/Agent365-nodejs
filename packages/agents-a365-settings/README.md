# @microsoft/agents-a365-settings

[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-settings?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-settings)
[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-settings?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-settings)

Agent settings SDK for managing agent settings templates and instance settings via the Microsoft Agent 365 platform API. This package provides type-safe CRUD operations for agent settings.

## Installation

```bash
npm install @microsoft/agents-a365-settings
```

## Usage

```typescript
import { AgentSettingsService, AgentSettings } from '@microsoft/agents-a365-settings';

// Create service instance
const settingsService = new AgentSettingsService();

// Get template
const template = await settingsService.getSettingsTemplateByAgentType('custom-agent', authToken);

// Set instance settings
const settings: AgentSettings = {
  agentInstanceId: 'instance-123',
  properties: [
    { name: 'maxRetries', value: '3', type: 'integer', required: true }
  ]
};
await settingsService.setSettingsByAgentInstance('instance-123', settings, authToken);
```

## Models

### AgentSettingsTemplate
Represents a settings template for a specific agent type.

| Property | Type | Description |
|----------|------|-------------|
| `id` | string? | Unique identifier of the template |
| `agentType` | string | The agent type this template applies to |
| `name` | string? | Display name of the template |
| `description` | string? | Optional description |
| `version` | string? | Template version (default: "1.0") |
| `properties` | AgentSettingProperty[] | Collection of setting properties |

### AgentSettings
Represents settings for a specific agent instance.

| Property | Type | Description |
|----------|------|-------------|
| `id` | string? | Unique identifier of the settings |
| `agentInstanceId` | string | The agent instance these settings belong to |
| `templateId` | string? | Optional reference to the template |
| `agentType` | string? | The agent type |
| `properties` | AgentSettingProperty[] | Collection of setting values |
| `createdAt` | string? | Creation timestamp (ISO 8601) |
| `modifiedAt` | string? | Last modification timestamp (ISO 8601) |

### AgentSettingProperty
Represents a single setting property.

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Name of the setting |
| `value` | string | Current value |
| `type` | string | Value type (default: "string") |
| `required` | boolean | Whether the setting is required |
| `description` | string? | Optional description |
| `defaultValue` | string? | Optional default value |

## Service Interface

- `IAgentSettingsService` - CRUD operations for templates and instance settings

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/PUT | `/agents/types/{agentType}/settings/template` | Template by agent type |
| GET/PUT | `/agents/{agentInstanceId}/settings` | Settings by instance |

## Configuration

- `MCP_PLATFORM_ENDPOINT` - Override platform base URL (validated for proper URI format)

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details
