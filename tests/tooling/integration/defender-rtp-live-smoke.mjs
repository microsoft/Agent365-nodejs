// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DefenderRtpClient,
  ToolingConfiguration,
} = require('../../../packages/agents-a365-tooling/dist/cjs/index.js');

function readEnvironmentVariable(...names) {
  const value = names
    .map((name) => process.env[name]?.trim())
    .find(Boolean);
  if (!value) {
    throw new Error(`${names.join(' or ')} is required for the live Defender RTP smoke test.`);
  }
  return value;
}

function decodeTokenClaims(accessToken) {
  try {
    return JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
    );
  } catch {
    throw new Error('A365_DEFENDER_RTP_ACCESS_TOKEN could not be decoded as a JWT.');
  }
}

async function report(label, evaluation) {
  if (!evaluation) throw new Error('Defender RTP was unexpectedly disabled.');
  console.log(JSON.stringify({
    label,
    evaluated: evaluation.evaluated,
    blockAction: evaluation.decision.blockAction,
    reasonCode: evaluation.decision.reasonCode,
    httpStatus: evaluation.httpStatus,
    error: evaluation.error,
  }));
  return evaluation;
}

async function main() {
  const accessToken = process.env.A365_DEFENDER_RTP_ACCESS_TOKEN?.trim();
  const customerClientId = process.env.A365_DEFENDER_RTP_CLIENT_ID?.trim();
  const agentId = process.env.AGENT365_AGENT_ID?.trim()
    || process.env.A365_DEFENDER_RTP_AGENT_ID?.trim()
    || customerClientId;
  if (!agentId) {
    throw new Error(
      'AGENT365_AGENT_ID, A365_DEFENDER_RTP_AGENT_ID, or '
      + 'A365_DEFENDER_RTP_CLIENT_ID is required for the live Defender RTP smoke test.',
    );
  }
  const tenantId = readEnvironmentVariable(
    'AGENT365_TENANT_ID',
    'A365_DEFENDER_RTP_TENANT_ID',
  );
  const expectedAudience = process.env.A365_DEFENDER_RTP_EXPECTED_AUDIENCE?.trim();
  if (accessToken) {
    const claims = decodeTokenClaims(accessToken);
    if (expectedAudience && claims.aud !== expectedAudience) {
      throw new Error(
        `A365_DEFENDER_RTP_ACCESS_TOKEN must have audience ${expectedAudience}.`,
      );
    }
  }

  const authentication = accessToken
    ? { accessToken }
    : customerClientId
      ? {
        tenantId,
        clientId: customerClientId,
        clientSecret: readEnvironmentVariable('A365_DEFENDER_RTP_CLIENT_SECRET'),
        tokenScope: process.env.A365_DEFENDER_RTP_TOKEN_SCOPE?.trim() || undefined,
      }
      : {
      tenantId,
      agentId,
      blueprintClientId: readEnvironmentVariable(
        'AGENT365_CLIENT_ID',
        'AGENT365_BLUEPRINT_ID',
      ),
      blueprintClientSecret: readEnvironmentVariable('AGENT365_CLIENT_SECRET'),
      tokenScope: process.env.A365_DEFENDER_RTP_TOKEN_SCOPE?.trim() || undefined,
    };
  const configuration = new ToolingConfiguration({
    isDefenderRtpEnabled: () => true,
    defenderRtpEndpoint: () => readEnvironmentVariable('A365_DEFENDER_RTP_ENDPOINT'),
    defenderRtpFailClosed: () => true,
  });
  const client = new DefenderRtpClient({
    configProvider: { getConfiguration: () => configuration },
  });
  const common = {
    agentId,
    tenantId,
    agentName: 'Defender RTP SDK Smoke Test',
  };

  const benign = await report(
    'benign-agent-request',
    await client.evaluateAgentRequest(
      {
        ...common,
        sessionId: randomUUID(),
        messages: ['Help me add two numbers.'],
      },
      authentication,
    ),
  );

  const adversarial = await report(
    'malicious-tool-request',
    await client.evaluateToolRequest(
      {
        ...common,
        sessionId: randomUUID(),
        tool: {
          name: 'fetch_url',
          toolId: 'smoke.fetch_url',
          toolType: 'mcp',
          description: 'Fetches a URL.',
        },
        arguments: {
          url: readEnvironmentVariable('A365_DEFENDER_RTP_BLOCKED_TEST_URL'),
        },
      },
      authentication,
    ),
  );

  if (!benign.evaluated || !adversarial.evaluated) {
    throw new Error('The webhook did not return a verdict for every smoke payload.');
  }
  if (process.env.A365_DEFENDER_RTP_REQUIRE_EXPECTED_DECISIONS === 'true') {
    if (benign.decision.blockAction) {
      throw new Error('The benign smoke payload was unexpectedly blocked.');
    }
    if (!adversarial.decision.blockAction) {
      throw new Error('The malicious URL smoke payload was unexpectedly allowed.');
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown live smoke test failure.';
  console.error(`[Defender RTP smoke] ${message}`);
  process.exitCode = 1;
});
