# @microsoft/agents-a365-runtime# @microsoft/agents-a365-runtime



[![npm](https://img.shields.io/npm/v/@microsoft/agents-a365-runtime?label=npm&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-runtime)Agent 365 Runtime SDK for AI agents built with TypeScript/Node.js.

[![npm Downloads](https://img.shields.io/npm/dm/@microsoft/agents-a365-runtime?label=Downloads&logo=npm)](https://www.npmjs.com/package/@microsoft/agents-a365-runtime)

## Description

Core runtime utilities and services for Microsoft Agents A365 applications. This package provides authentication, authorization, and Power Platform API discovery capabilities for building enterprise-ready AI agents.

This package provides runtime utilities and services for Agent365 SDK, including:

## Installation- Agentic Authentication Service

- Agentic Authorization Service  

```bash- Power Platform API Discovery

npm install @microsoft/agents-a365-runtime- Semaphore utilities

```

## Installation

## Usage

\\\ash

### Authentication Servicenpm install @microsoft/agents-a365-runtime

\\\

```typescript

import { AgenticAuthenticationService } from '@microsoft/agents-a365-runtime';## Usage



const authService = new AgenticAuthenticationService();\\\	ypescript

import { AgenticAuthenticationService, AgenticAuthorizationService } from '@microsoft/agents-a365-runtime';

// Get authentication token\\\

const token = await authService.getToken(tenantId, scopes);

```## License



### Authorization ServiceSee license file


```typescript
import { AgenticAuthorizationService } from '@microsoft/agents-a365-runtime';

const authzService = new AgenticAuthorizationService();

// Check user permissions
const hasAccess = await authzService.checkAccess(userId, resource);
```

### Power Platform API Discovery

```typescript
import { PowerPlatformApiDiscovery } from '@microsoft/agents-a365-runtime';

// Discover Power Platform API endpoints
const apiEndpoint = await PowerPlatformApiDiscovery.getEndpoint(environment);
```

## Support

For issues, questions, or feedback:

- File issues in the [GitHub Issues](https://github.com/microsoft/Agent365-nodejs/issues) section
- See the [main documentation](../../README.md) for more information

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details.
