# OpenAI Sample Agent for Node.js

This sample demonstrates how to build a complete OpenAI agent using the Microsoft Agent 365 SDK for Node.js. It showcases key patterns and integrations including authentication, Graph API integration, message polling, and OpenAI API usage.

## 🎯 What This Sample Demonstrates

This sample shows you how to:

- **OpenAI API Integration** - Connect and interact with OpenAI's API using the `@openai/agents` SDK
- **Agent Token Helper** - Authenticate and manage access tokens for Microsoft 365 services
- **Graph Service Integration** - Access Microsoft Graph API to interact with user data, emails, and more
- **Message Polling Service** - Implement a message polling pattern for asynchronous message processing
- **Observability** - Use Agent 365 observability features for tracing and monitoring
- **End-to-End Agent Workflow** - Complete agent lifecycle from installation to message handling

## 📋 Prerequisites

- Node.js 18 or later
- An OpenAI API key (get one at [platform.openai.com](https://platform.openai.com/api-keys))
- pnpm package manager (or npm)
- Basic understanding of TypeScript and Express.js

## 🚀 Getting Started

### 1. Build the SDK

First, build the Microsoft Agent 365 SDK from the repository root:

```bash
cd /path/to/Agent365-nodejs
pnpm install
pnpm build
```

### 2. Install Sample Dependencies

Navigate to this sample directory and install dependencies:

```bash
cd nodejs/samples/openai/sample_agent
npm install
```

### 3. Configure Environment Variables

Copy the `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Edit the `.env` file and configure the required variables:

```env
# OpenAI Configuration (Required)
OPENAI_API_KEY=your-openai-api-key-here

# Agent Application Configuration (Optional for local development)
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
TENANT_ID=your-tenant-id

# For testing with authentication
AGENT_APPLICATION_ID=your-agent-app-id
AGENT_ID=your-agent-id
USER_PRINCIPAL_NAME=your-upn
AGENTIC_USER_ID=your-user-id
```

**Note:** For local testing without authentication, you can leave most fields empty. The sample will work in development mode without full authentication setup.

### 4. Build the Sample

Compile the TypeScript code:

```bash
npm run build
```

### 5. Run the Sample

Start the agent server:

```bash
npm run dev
```

You should see output similar to:

```
Starting Agent 365 observability...
✅ OpenAI Sample Agent is running!
   Server listening on port 3978
   App ID: Not configured
   Debug level: agents:*:error

📝 To test the agent:
   1. Run: npm run test-tool
   2. Open the agent playground in your browser
   3. Send a message to start chatting!
```

### 6. Test the Agent

In a new terminal window, start the Agents Playground:

```bash
npm run test-tool
```

This will open a web browser with a chat interface where you can interact with your agent.

## 💬 Using the Agent

### Basic Conversation

Once you've installed the agent (by accepting the terms when prompted), you can have natural conversations:

```
You: Hello!
Agent: Hello! How can I assist you today?

You: What's the weather like?
Agent: I can help you with that! However, I'd need your location to provide weather information...
```

### Special Commands

The sample includes special commands to demonstrate various features:

#### Graph API Commands

Access Microsoft Graph API (requires authentication):

```
/graph user        - Get your user profile information
/graph emails      - Get your recent emails
/graph             - Show available Graph commands
```

#### Polling Service Commands

Control the message polling service:

```
/polling start     - Start the message polling service
/polling stop      - Stop the polling service
/polling status    - Get polling service statistics
/polling           - Show available polling commands
```

## 🏗️ Architecture

### Project Structure

```
nodejs/samples/openai/sample_agent/
├── src/
│   ├── index.ts                      # Main entry point, Express server setup
│   ├── agent.ts                      # Agent application with message handling
│   ├── openai-client.ts              # OpenAI API client and agent invocation
│   ├── telemetry.ts                  # Observability and tracing setup
│   ├── token-helper.ts               # Authentication and token management
│   ├── graph-service.ts              # Microsoft Graph API integration
│   └── message-polling-service.ts    # Message polling pattern implementation
├── package.json                      # Dependencies and scripts
├── tsconfig.json                     # TypeScript configuration
├── .env.example                      # Environment variables template
└── README.md                         # This file
```

### Key Components

#### Agent Application (`agent.ts`)

The `SampleAgent` class extends `AgentApplication` and provides:
- Message handling and routing
- Installation lifecycle management
- Integration with OpenAI, Graph API, and polling services
- Command processing for demonstration features

#### OpenAI Client (`openai-client.ts`)

Manages OpenAI API interactions:
- Agent configuration and initialization
- MCP (Model Context Protocol) tool registration
- Agent invocation and response handling
- Connection management

#### Token Helper (`token-helper.ts`)

Provides authentication utilities:
- Token provider initialization
- Access token retrieval for Microsoft 365 services
- Secure token management

#### Graph Service (`graph-service.ts`)

Demonstrates Microsoft Graph API integration:
- User profile retrieval
- Email operations (send, retrieve)
- Extensible pattern for other Graph operations

#### Message Polling Service (`message-polling-service.ts`)

Implements asynchronous message processing:
- Message queue management
- Configurable polling intervals
- Service lifecycle control
- Statistics and monitoring

#### Telemetry (`telemetry.ts`)

Sets up observability:
- Agent 365 observability initialization
- OpenAI auto-instrumentation
- Tracing and monitoring configuration

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `OPENAI_API_KEY` | OpenAI API key | ✅ Yes (for OpenAI) | - |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key (alternative) | No | - |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL | No | - |
| `CLIENT_ID` | Azure AD client ID | For production | - |
| `CLIENT_SECRET` | Azure AD client secret | For production | - |
| `TENANT_ID` | Azure AD tenant ID | For production | - |
| `PORT` | Server port | No | 3978 |
| `NODE_ENV` | Environment mode | No | development |
| `TOOLS_MODE` | MCP tools mode | No | MockMCPServer |
| `DEBUG` | Debug logging level | No | agents:*:error |

### MCP Tools Configuration

The sample supports both mock and production MCP (Model Context Protocol) servers:

- **Mock Mode** (default): `TOOLS_MODE=MockMCPServer`
  - Used for local development
  - No external MCP servers required
  
- **Production Mode**: `TOOLS_MODE=ProductionMCPServer`
  - Connects to real MCP tool servers
  - Requires `MCP_AUTH_TOKEN` and proper authentication

## 🔍 Observability and Monitoring

The sample includes comprehensive observability features:

### Telemetry Output

When you interact with the agent, you'll see telemetry traces in the console:

```javascript
{
  resource: {
    attributes: {
      'service.name': 'OpenAI Sample Agent',
      'host.name': '...',
      'process.pid': 12345,
      // ... more attributes
    }
  },
  traceId: '...',
  name: 'inference gpt-4',
  attributes: {
    'gen_ai.system': 'openai',
    'gen_ai.operation.name': 'inference',
    'gen_ai.request.model': 'gpt-4',
    'gen_ai.usage.input_tokens': 45,
    'gen_ai.usage.output_tokens': 78,
    // ... more attributes
  }
}
```

### Health Check Endpoint

The sample includes a health check endpoint at `/health`:

```bash
curl http://localhost:3978/health
```

Response:
```json
{
  "status": "healthy",
  "service": "OpenAI Sample Agent",
  "version": "1.0.0",
  "timestamp": "2025-11-17T21:00:00.000Z"
}
```

## 🧪 Development and Testing

### Running in Development Mode

Use `nodemon` for automatic restart on code changes:

```bash
npm run dev
```

### Building for Production

```bash
npm run build
npm start
```

### Linting

Check code style:

```bash
npm run lint
```

Auto-fix issues:

```bash
npm run lint:fix
```

### Clean and Rebuild

```bash
npm run clean
npm install
npm run build
```

## 🐛 Troubleshooting

### Common Issues

#### "Authorization is not set"

This warning is normal for local development without full authentication. The sample will still work for basic OpenAI interactions.

#### OpenAI API Errors

- **Error 401**: Check that your `OPENAI_API_KEY` is valid
- **Error 429**: Rate limit exceeded, wait before retrying
- **Error 500**: Check OpenAI service status

#### MCP Connection Failures

If you see MCP connection errors and you're not using MCP tools:
- Set `TOOLS_MODE=MockMCPServer` in your `.env` file
- Or leave MCP environment variables empty

#### Port Already in Use

If port 3978 is already in use, change it in your `.env` file:

```env
PORT=4000
```

## 📚 Additional Resources

- [Microsoft Agent 365 SDK Documentation](https://learn.microsoft.com/microsoft-agent-365/developer/)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Microsoft Graph API Documentation](https://learn.microsoft.com/graph/)
- [Agent 365 GitHub Repository](https://github.com/microsoft/Agent365-nodejs)

## 🤝 Contributing

Contributions are welcome! Please follow the repository's contribution guidelines.

## 📄 License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../../../LICENSE.md) file for details.

## 🔖 Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*
