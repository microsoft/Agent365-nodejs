# Sample Agent - Node.js OpenAI

This directory contains a sample OpenAI agent implementation using the Microsoft Agent 365 SDK with Node.js and OpenAI Agents SDK instrumentation extensions.

## Demonstrates

This sample demonstrates how to build auto instrument for Microsoft Agent 365 using OpenAI Agents SDK instrumentation extensions for telemetry and observability.



## Prerequisites

- Node.js 18+
- OpenAI API access

## How to run this sample

### Build the SDK and Sample
To try it out, make sure the Agents Node.js SDK has been built:

```sh
$ cd Agent365-nodejs
$ npm install
$ npm run build
```

Switch to this sample directory and install the agent application dependencies:

```sh
$ cd tests-agent/openai-agent-auto-instrument-sample
$ npm install
$ npm run build
```

### Setting up the .env file

Create the required `.env` file out of the provided example `.env.example`. Just copying it as-is should be enough.

If you'd like to use Agentic authentication, you should set the values under Agent 365 Authentication Configuration.
Otherwise, you can set the value `MCP_AUTH_TOKEN` to authentication against your MCP servers.

`NODE_ENV` should be set to `Development` if you'd like to use your tooling manifest. Otherwise, the tooling sdk will
default to retrieving MCP servers from the agent's tooling gateway, in which case you will need to set `AGENTIC_USER_ID`.

### Interacting with your Agent
Start the agent application:

```sh
$ npm run dev
```

In a new terminal start the Agents Playground:

```sh
$ npm run test-tool
```

This should open a web browser with a chat interface. Send a message to your agent and you should see it reply back with a mocked response.

In the first terminal, where you are running the agent application with TOOLS_MODE=MockMCPServer and NODE_ENV=development in .env,  
 you should see telemetry rendered starting similar as below when you invoke the agent e.g ask the agent to send email to someone.

```
> openaiagent-instrument@1.0.0 start
> node dist/index.js

[dotenv@17.2.3] injecting env (27) from .env -- tip: 🔐 prevent building .env in docker: https://dotenvx.com/prebuild

Server listening to port 3978 for appId  debug agents:*:error
Authorization is not set on the agent application
🔗 Setting up 2 MCP servers...
🔗 Connecting to MCP server: mcp_MailTools at http://localhost:5309
✅ Added mcp_MailTools to agent's mcpServers array
🔗 Connecting to MCP server: mcp_CalendarTools at http://localhost:5309
✅ Added mcp_CalendarTools to agent's mcpServers array
✅ Local MCP setup complete. Added 2 servers to agent: OpenAI Agent
🌐 Mock connection established to mcp_MailTools
🌐 Mock connection established to mcp_CalendarTools
🔌 Mock connection closed to mcp_MailTools
🔌 Mock connection closed to mcp_CalendarTools
{
  resource: {
    attributes: {
      'host.name': 'pefan4-0',
      'host.arch': 'amd64',
      'host.id': '3dc679db-f652-4002-98b7-5e05e5071507',
      'process.pid': 50460,
      'process.executable.name': 'C:\\WINDOWS\\system32\\cmd.exe ',
      'process.executable.path': 'C:\\Program Files\\nodejs\\node.exe',
      'process.command_args': [
        'C:\\Program Files\\nodejs\\node.exe',
        'D:\\repos\\sdk1\\Agent365-nodejs\\tests-agent\\openai-agent-auto-instrument-sample\\dist\\index.js'
      ],
      'process.runtime.version': '20.18.3',
      'process.runtime.name': 'nodejs',
      'process.runtime.description': 'Node.js',
      'process.command': 'D:\\repos\\sdk1\\Agent365-nodejs\\tests-agent\\openai-agent-auto-instrument-sample\\dist\\index.js',
      'process.owner': 'pefan',
      'service.name': 'OpenAI Agent Instrumentation Sample-1.0.0'
    }
  },
  instrumentationScope: {
    name: 'openai-agent-auto-instrumentation',
    version: '1.0.0',
    schemaUrl: undefined
  },
  traceId: '3b91449a52bd15cc3343eab40c570cdb',
  parentSpanContext: {
    traceId: '3b91449a52bd15cc3343eab40c570cdb',
    spanId: 'f9f26c098f3c98ba',
    traceFlags: 1,
    traceState: undefined
  },
  traceState: undefined,
  name: 'execute_tool mcp_MailTools',
  id: 'c5052df48e801a8f',
  kind: 0,
  timestamp: 1761764780213000,
  duration: 2000,
  attributes: {
    'gen_ai.operation.name': 'execute_tool',
    'gen_ai.system': 'openai',
    'gen_ai.event.content': '["send_email","read_emails","search_emails"]',
    'gen_ai.tool.name': 'mcp_MailTools',
    'gen_ai.tool.type': 'extension'
  },
  status: { code: 1 },
  events: [],
  links: []
}
......
```

That means your agent is correctly receiving activities and correctly sending traces!

## Debugging

### VS Code Debugging

This sample includes a VS Code debug configuration. To debug:

1. **Set up your environment**: 
   - Copy `.env.debug` to `.env` and update the `OPENAI_API_KEY` with your actual OpenAI API key
   - You can get an API key from: https://platform.openai.com/api-keys

2. **Launch the debugger**:
   - Open VS Code in the root Agent 365 directory
   - Go to Run and Debug (Ctrl+Shift+D)
   - Select "Debug OpenAI Agent with Instrumentation" from the dropdown
   - Press F5 or click the green play button

3. **Set breakpoints**:
   - You can set breakpoints in any `.ts` file in the `src/` directory
   - Common places to debug:
     - `src/client.ts` - Line 19 (`addMcpToolServers`) for MCP setup issues
     - `src/agent.ts` - `handleAgentMessageActivity` method for message processing
     - `src/index.ts` - Server startup and configuration

4. **Debug MCP Connection Issues**:
   - If you see MCP connection errors, set breakpoints in `src/client.ts`
   - The sample will skip MCP setup if environment variables are not configured
   - For local debugging, you can leave MCP variables empty in `.env`

### Troubleshooting

- **"Authorization is not set"**: This is normal for local development. The sample handles this gracefully.
- **MCP connection failures**: If you're not using MCP tools, leave the MCP environment variables empty in `.env`
- **OpenAI API errors**: Make sure your `OPENAI_API_KEY` is valid and has sufficient credits
- **Build errors**: Run `npm run build` to check for TypeScript compilation issues

### Known Issues with MCPPlatform
MCPPlatform currently has compatibility issues with OpenAI. Mail and Sharepoint tools will not work.

Issues seen:
Mail:
```
Error: 400 Invalid schema for function 'mcp_MailTools_graph_mail_createMessage': In context=('properties', 'toRecipients', 'items'), 'additionalProperties' is required to be supplied and to be false.
```

## 📋 Telemetry

Data Collection. The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft's privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details.
