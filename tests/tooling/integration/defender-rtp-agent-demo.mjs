// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DefenderRtpClient,
  ToolingConfiguration,
} = require('../../../packages/agents-a365-tooling/dist/cjs/index.js');

const colors = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
};

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function heading(text) {
  console.log(`\n${colors.bold}${colors.cyan}=== ${text} ===${colors.reset}`);
}

function printDecision(evaluation) {
  if (!evaluation) throw new Error('Defender integration was unexpectedly disabled.');
  const color = evaluation.allowed ? colors.green : colors.red;
  const verdict = evaluation.allowed ? 'ALLOW' : 'BLOCK';
  console.log(
    `${color}[${verdict}]${colors.reset} ${evaluation.inspectionPoint} `
    + `(HTTP ${evaluation.httpStatus ?? 'n/a'}, reason ${evaluation.decision.reasonCode ?? 'n/a'})`,
  );
  return evaluation;
}

function assertAllowed(evaluation) {
  printDecision(evaluation);
  if (!evaluation?.evaluated || !evaluation.allowed) {
    throw new Error(`Expected ${evaluation?.inspectionPoint ?? 'evaluation'} to be allowed.`);
  }
}

async function runAllowedTurn(client, authentication, identity) {
  heading('Turn 1 - benign request completes all four security gates');
  const sessionId = randomUUID();
  const toolCallId = `tooluse_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  console.log('User: What is 2 + 2?');
  assertAllowed(await client.evaluateAgentRequest(
    {
      ...identity,
      sessionId,
      requestId: 'turn-1',
      messages: ['What is 2 + 2?'],
    },
    authentication,
  ));

  const tool = {
    name: 'add_numbers',
    toolId: 'demo.add_numbers',
    toolType: 'local',
    description: 'Adds two numbers and returns their sum.',
  };
  const toolRequest = {
    ...identity,
    sessionId,
    requestId: 'turn-1',
    toolCallId,
    tool,
    arguments: { a: 2, b: 2 },
  };

  assertAllowed(await client.evaluateToolRequest(toolRequest, authentication));
  const result = 2 + 2;
  console.log(`${colors.yellow}[TOOL EXECUTED]${colors.reset} add_numbers(2, 2) -> ${result}`);
  assertAllowed(await client.evaluateToolResponse(
    { ...toolRequest, result },
    authentication,
  ));

  const answer = `2 + 2 = ${result}.`;
  assertAllowed(await client.evaluateAgentResponse(
    {
      ...identity,
      sessionId,
      requestId: 'turn-1',
      messages: [answer],
    },
    authentication,
  ));
  console.log(`Agent: ${answer}`);
}

async function runBlockedTurn(client, authentication, identity) {
  heading('Turn 2 - malicious tool call is blocked before execution');
  const sessionId = randomUUID();
  let toolExecuted = false;

  console.log('User: Fetch the requested security test URL.');
  assertAllowed(await client.evaluateAgentRequest(
    {
      ...identity,
      sessionId,
      requestId: 'turn-2',
      messages: ['Fetch the requested security test URL.'],
    },
    authentication,
  ));

  const evaluation = await client.evaluateToolRequest(
    {
      ...identity,
      sessionId,
      requestId: 'turn-2',
      toolCallId: `tooluse_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      tool: {
        name: 'fetch_url',
        toolId: 'demo.fetch_url',
        toolType: 'mcp',
        description: 'Fetches a URL.',
      },
      arguments: {
        url: required('A365_DEFENDER_RTP_BLOCKED_TEST_URL'),
      },
    },
    authentication,
  );
  printDecision(evaluation);

  if (evaluation?.allowed) {
    toolExecuted = true;
  }

  console.log(
    `${toolExecuted ? colors.red : colors.green}`
    + `[TOOL EXECUTED: ${toolExecuted}]${colors.reset}`,
  );
  if (!evaluation?.evaluated || evaluation.allowed || toolExecuted) {
    throw new Error('Expected Defender to block the malicious tool call before execution.');
  }
  console.log(`${colors.bold}${colors.green}Protection verified: side effect prevented.${colors.reset}`);
}

async function main() {
  const tenantId = required('A365_DEFENDER_RTP_TENANT_ID');
  const clientId = required('A365_DEFENDER_RTP_CLIENT_ID');
  const clientSecret = required('A365_DEFENDER_RTP_CLIENT_SECRET');
  const configuration = new ToolingConfiguration({
    isDefenderRtpEnabled: () => true,
    defenderRtpEndpoint: () => required('A365_DEFENDER_RTP_ENDPOINT'),
    defenderRtpFailClosed: () => true,
  });
  const client = new DefenderRtpClient({
    configProvider: { getConfiguration: () => configuration },
  });
  const authentication = {
    tenantId,
    clientId,
    clientSecret,
    tokenScope: process.env.A365_DEFENDER_RTP_TOKEN_SCOPE?.trim()
      || `api://${clientId}/.default`,
  };
  const identity = {
    tenantId,
    agentId: clientId,
    agentName: 'Defender RTP SDK Demo Agent',
    platformAgentId: clientId,
  };

  heading('Agent365 Node.js SDK - Defender RTP live demo');

  await runAllowedTurn(client, authentication, identity);
  await runBlockedTurn(client, authentication, identity);

  heading('Demo completed successfully');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown demo failure.';
  console.error(`\n${colors.red}[DEMO FAILED]${colors.reset} ${message}`);
  process.exitCode = 1;
});
