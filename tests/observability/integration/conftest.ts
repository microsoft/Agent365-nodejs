// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

/**
 * Test configuration and utilities based on Python conftest.py pattern
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env file if it exists (for local development)
const envFile = path.join(__dirname, '.', '.env');

try {
  dotenv.config({ path: envFile });
} catch (error) {
  // .env file is optional
}

/**
 * Azure OpenAI configuration interface
 */
export interface AzureOpenAIConfig {
  apiKey: string;
  endpoint: string;
  deployment: string;
  apiVersion?: string;
}

/**
 * Agent 365 configuration interface
 */
export interface Agent365Config {
  tenantId?: string;
  correlationId?: string;
  agentId?: string;
}

/**
 * Get Azure OpenAI configuration from environment variables
 */
export function getAzureOpenAIConfig(): AzureOpenAIConfig | null {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  
  if (!apiKey || !endpoint || !deployment) {
    return null;
  }

  return {
    apiKey,
    endpoint,
    deployment,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview',
  };
}

/**
 * Get Agent 365 configuration from environment variables
 */
export function getAgent365Config(): Agent365Config {
  return {
    tenantId: process.env.AGENT365_TENANT_ID || 'test-tenant-id',
    correlationId: process.env.AGENT365_CORRELATION_ID || 'test-correlation-id',
    agentId: process.env.AGENT365_AGENT_ID || 'test-agent-id',
  };
}

/**
 * Environment validation helper
 */
export function validateEnvironment(): void {
  const azureConfig = getAzureOpenAIConfig();
  
  if (!azureConfig) {
    throw new Error('Missing required environment variables: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT');
  }
}
