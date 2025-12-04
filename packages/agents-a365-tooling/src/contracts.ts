// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export interface MCPServerConfig {
  mcpServerName: string;
  url: string;
  headers?: Record<string, string>;
}

export interface McpClientTool {
  name: string;
  description?: string | undefined;
  inputSchema: InputSchema;
}

export interface InputSchema {
  type: string;
  properties?: Record<string, object> | undefined;
  required?: string[] | undefined;
  additionalProperties?: boolean;
}