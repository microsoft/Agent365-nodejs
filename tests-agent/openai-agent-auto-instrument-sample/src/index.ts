// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

// It is important to load environment variables before importing other modules
import { configDotenv } from 'dotenv';

configDotenv();

import { AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, Request } from '@microsoft/agents-hosting';
import express, { Response } from 'express';
import { agentApplication } from './A365Agent';
import { a365Observability, openAIAgentsTraceInstrumentor } from './Telemetry';

// Start observability
a365Observability.start();
// Enable OpenAI Agents auto instrumentation
openAIAgentsTraceInstrumentor.enable();

const authConfig: AuthConfiguration = loadAuthConfigFromEnv();
const adapter = new CloudAdapter(authConfig);

const app = express();
app.use(express.json());
app.use(authorizeJWT(authConfig));

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => {
    const app = agentApplication;
    await app.run(context);
  });
});

const port = process.env.PORT || 3978;
const server = app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`);
}).on('error', async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  openAIAgentsTraceInstrumentor.disable();
  await a365Observability.shutdown();
  process.exit(1);
}).on('close', async () => {
  // eslint-disable-next-line no-console
  console.log('Observability is shutting down...');
  openAIAgentsTraceInstrumentor.disable();
  await a365Observability.shutdown();
});

process.on('SIGINT', () => {
  // eslint-disable-next-line no-console
  console.log('Received SIGINT. Shutting down gracefully...');
  server.close(() => {
    // eslint-disable-next-line no-console
    console.log('Server closed.');
    process.exit(0);
  });
});
