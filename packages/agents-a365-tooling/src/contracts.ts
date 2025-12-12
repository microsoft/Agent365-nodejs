// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext } from "@microsoft/agents-hosting";

export interface MCPServerConfig {
  mcpServerName: string;
  url: string;
  headers?: Record<string, string>;
}

export interface McpClientTool {
  name: string;
  description?: string;
  inputSchema: InputSchema;
}

export interface InputSchema {
  type: string;
  properties?: Record<string, object>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolOptions {
  orchestratorName?: string;
  turnContext?: TurnContext;
}