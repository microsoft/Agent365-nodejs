// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Manual mock for @anthropic-ai/claude-agent-sdk (ESM-only module)
// Jest cannot load ESM .mjs files in CJS test mode, so we provide this mock.

export const getSessionMessages = jest.fn();

export interface SessionMessage {
  type: 'user' | 'assistant' | 'system';
  uuid: string;
  session_id: string;
  message: unknown;
  parent_tool_use_id: string | null;
}

export interface GetSessionMessagesOptions {
  dir?: string;
  limit?: number;
  offset?: number;
}

export interface McpServerConfig {
  name: string;
  url: string;
  apiKey?: string;
}

export interface Options {
  serverConfigs?: McpServerConfig[];
}
