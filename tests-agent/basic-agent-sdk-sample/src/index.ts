// It is important to load environment variables before importing other modules
import { configDotenv } from 'dotenv';

configDotenv();

import { AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, Request } from '@microsoft/agents-hosting';
import express, { NextFunction, Response } from 'express';
import { agentApplication } from './agent';
import { a365Observability } from './telemetry';

const authConfig: AuthConfiguration = loadAuthConfigFromEnv();
const adapter = new CloudAdapter(authConfig);

const app = express();
app.use(express.json());

a365Observability.start();

// Mock authentication middleware for development
// This is only required when running from agents playground
app.use((req: Request, res: Response, next: NextFunction) => {
  // Create a mock identity when JWT is disabled
  req.user = {
    aud: authConfig.clientId || 'mock-client-id',
    appid: authConfig.clientId || 'mock-client-id',
    azp: authConfig.clientId || 'mock-client-id'
  };
  next();
});

app.post('/api/messages', async (req: Request, res: Response) => {
  try {
    await adapter.process(req, res, async (context) => {
      const app = agentApplication;
      await app.run(context);
    });
  } catch (err) {
    // Enhanced diagnostic logging for token acquisition / adapter failures
    const anyErr = err as any;
    const status = anyErr?.status || anyErr?.response?.status;
    const data = anyErr?.response?.data;
    const message = anyErr?.message || 'Unknown error';
    // Axios style nested config
    const aadError = data?.error || data?.error_description || data;
    console.error('[diagnostic] adapter.process failed', {
      message,
      status,
      aadError,
      url: anyErr?.config?.url,
      scope: anyErr?.config?.data,
    });
    // Surface minimal info to caller while keeping internals in log
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error', detail: status ? `upstream status ${status}` : message });
    }
  }
});

const port = process.env.PORT || 3978;
const server = app.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`);
}).on('error', async (err: Error) => {
  console.error(err);
  await a365Observability.shutdown();
  process.exit(1);
}).on('close', async () => {
  console.log('Agent 365 observability is shutting down...');
    await a365Observability.shutdown();
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
