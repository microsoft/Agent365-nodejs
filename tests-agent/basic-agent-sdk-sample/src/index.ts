// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// It is important to load environment variables before importing other modules
import { configDotenv } from 'dotenv';

configDotenv();

import { AuthConfiguration, CloudAdapter, loadAuthConfigFromEnv, Request } from '@microsoft/agents-hosting';
import express, { NextFunction, Response } from 'express';
import { agentApplication } from './agent';
import { a365Observability } from './telemetry';
import { logger, runWithExportToken } from '@microsoft/agents-a365-observability';
import { getObservabilityAuthenticationScope } from '@microsoft/agents-a365-runtime';

const authConfig: AuthConfiguration = loadAuthConfigFromEnv();
const adapter = new CloudAdapter(authConfig);

const app = express();
app.use(express.json());

a365Observability.start();

// Mock authentication middleware for development
// This is only required when running from agents playground
app.use((req: Request, _res: Response, next: NextFunction) => {
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
    // Check if per-request export is enabled
    const isPerRequestExportEnabled = 
      process.env.ENABLE_A365_OBSERVABILITY_PER_REQUEST_EXPORT?.toLowerCase() === 'true';

    await adapter.process(req, res, async (context) => {
      const agentApp = agentApplication;

      if (!isPerRequestExportEnabled) {
        // For batch export, token resolution is handled by exporter/tokenResolver.
        await agentApp.run(context);
        return;
      }

      let token = '';
      try {
        const exchanged = await agentApp.authorization.exchangeToken(context, 'agentic', {
          scopes: getObservabilityAuthenticationScope()
        });
        token = exchanged?.token || '';
      } catch (exchangeErr) {
        logger.error('[diagnostic] token exchange failed; continuing without export token', exchangeErr);
        token = '';
      }

      await runWithExportToken(token, async () => {
        await agentApp.run(context);
      });
    });
  } catch (err) {
    // Enhanced diagnostic logging for token acquisition / adapter failures
    type AdapterProcessError = Error & {
      status?: number;
      response?: { status?: number; data?: unknown };
      config?: { url?: string; data?: unknown };
    };

    const e = err as AdapterProcessError;
    const status = e?.status || e?.response?.status;
    const data = e?.response?.data as Record<string, unknown> | undefined;
    const message = e?.message || 'Unknown error';
    const aadError = data?.error || data?.error_description || data;
    console.error('[diagnostic] adapter.process failed', {
      message,
      status,
      aadError,
      url: e?.config?.url,
      scope: e?.config?.data,
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
