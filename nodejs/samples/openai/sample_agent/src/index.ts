// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Load environment variables before importing other modules
import { configDotenv } from 'dotenv';

configDotenv();

import {
  AuthConfiguration,
  authorizeJWT,
  CloudAdapter,
  loadAuthConfigFromEnv,
  Request,
} from '@microsoft/agents-hosting';
import express, { Response } from 'express';
import { agentApplication } from './agent';
import { a365Observability, openAIAgentsTraceInstrumentor } from './telemetry';

// Start observability and enable OpenAI auto-instrumentation
console.log('Starting Agent 365 observability...');
a365Observability.start();
openAIAgentsTraceInstrumentor.enable();

// Load authentication configuration
const authConfig: AuthConfiguration = loadAuthConfigFromEnv();
const adapter = new CloudAdapter(authConfig);

// Create Express application
const app = express();
app.use(express.json());
app.use(authorizeJWT(authConfig));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'OpenAI Sample Agent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Main message endpoint
app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => {
    await agentApplication.run(context);
  });
});

// Start the server
const port = process.env.PORT || 3978;
const server = app
  .listen(port, () => {
    console.log('\n✅ OpenAI Sample Agent is running!');
    console.log(`   Server listening on port ${port}`);
    console.log(`   App ID: ${authConfig.clientId || 'Not configured'}`);
    console.log(`   Debug level: ${process.env.DEBUG || 'Not set'}`);
    console.log('\n📝 To test the agent:');
    console.log('   1. Run: npm run test-tool');
    console.log('   2. Open the agent playground in your browser');
    console.log('   3. Send a message to start chatting!\n');
  })
  .on('error', async (err) => {
    console.error('❌ Server error:', err);
    openAIAgentsTraceInstrumentor.disable();
    await a365Observability.shutdown();
    process.exit(1);
  })
  .on('close', async () => {
    console.log('🔄 Server is shutting down...');
    await agentApplication.cleanup();
    openAIAgentsTraceInstrumentor.disable();
    await a365Observability.shutdown();
    console.log('✅ Observability shutdown complete');
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Received SIGTERM. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});
