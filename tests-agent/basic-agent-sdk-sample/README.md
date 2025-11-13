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

## 📋 Telemetry

Data Collection. The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft's privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details.
