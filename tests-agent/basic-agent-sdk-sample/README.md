# Basic Agent365 SDK Sample

This project shows how a simple agent can be created using Agents SDK and Agent365 SDK in Node.js.

To try it out, make sure the Agent365 Node.js SDK has been built:

```sh
$ cd nodejs/src
$ npm install
$ npm run build:all
```

Switch to this sample directory and install the agent application dependencies:

```sh
$ cd samples/basic-agent-sdk-sample
$ npm install
```

Create the required `.env` file out of the provided example `.env.example`. Just copying it as-is should be enough.

Start the agent application:

```sh
$ npm run dev
```

In a new terminal start the Agents Playground:

```sh
$ npm run test-tool
```

This should open a web browser with a chat interface. Send a message to your agent and you should see it reply back with a mocked response.

In the first terminal, where you are running the agent application, you should see telemetry rendered similar to:

```
{
  resource: {
    attributes: {
      'service.name': 'TypeScript Sample Agent',
      'host.name': 'XXXXXX',
      'host.arch': 'amd64',
      'host.id': '2a7db653-9be9-4fdf-bf15-a475f6cd1e40',
      'process.pid': 39784,
      'process.executable.name': 'C:\\WINDOWS\\system32\\cmd.exe ',
      'process.executable.path': 'C:\\Program Files\\nodejs\\node.exe',
      'process.command_args': [
        'D:\\Agent365\\nodejs\\node_modules\\ts-node\\dist\\bin.js',
        'D:\\Agent365\\nodejs\\node_modules\\ts-node\\dist\\bin.js',
        'D:\\Agent365\\nodejs\\samples\\basic-agent-sdk-sample\\src\\index.ts'
      ],
      'process.runtime.version': '20.12.2',
      'process.runtime.name': 'nodejs',
      'process.runtime.description': 'Node.js',
      'process.command': 'D:\\Agent365\\nodejs\\samples\\basic-agent-sdk-sample\\src\\index.ts',
      'process.owner': 'XXXX',
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'opentelemetry',
      'telemetry.sdk.version': '2.0.1'
    }
  },
  instrumentationScope: undefined,
  traceId: '9960c528cad72704cab091321a5e1c34',
  parentId: undefined,
  traceState: undefined,
  name: 'inference gpt-4',
  id: 'dcb34a8ed1be696d',
  kind: 2,
  timestamp: 1758200071596000,
  duration: 201942.6,
  attributes: {
    'gen_ai.system': 'az.ai.agent365',
    'gen_ai.operation.name': 'inference',
    'gen_ai.agent.id': '30ed5699-b157-4e87-bb45-9b0cfb13b8e5',
    'gen_ai.request.model': 'gpt-4',
    'gen_ai.request.model.provider': 'openai',
    'gen_ai.request.model.version': '0613',
    'gen_ai.request.temperature': 0.7,
    'gen_ai.request.max_tokens': 500,
    'gen_ai.request.top_p': 0.9,
    'gen_ai.request.content': 'Analyze the following compliance query: testing',
    'gen_ai.event.content': 'Based on my analysis of "testing", I recommend checking policy documents XYZ and ensuring proper data handling procedures.',
    'gen_ai.response.id': 'resp-1758200071798',
    'gen_ai.response.finish_reasons': 'stop',
    'gen_ai.usage.input_tokens': 45,
    'gen_ai.usage.output_tokens': 78,
    'gen_ai.usage.total_tokens': 123,
    'operation.duration': 0.201
  },
  status: { code: 0 },
  events: [],
  links: []
}
```

That means your agent is correctly receiving activities and correctly sending traces!
