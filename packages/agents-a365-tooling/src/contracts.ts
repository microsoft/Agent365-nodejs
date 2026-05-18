// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export interface MCPServerConfig {
  mcpServerName: string;
  url: string;
  headers?: Record<string, string>;
  audience?: string;   // per-server AppId (V2) or ATG AppId (V1) — undefined = treat as V1
  scope?: string;      // e.g. "Tools.ListInvoke.All" (V2) or "McpServers.Mail.All" (V1)
  publisher?: string;
}

export type MCPServerManifestEntry = {
  url?: string;
  headers?: Record<string, string>;
  audience?: string;
  scope?: string;
  publisher?: string;
} & (
  | { mcpServerName: string; mcpServerUniqueName?: string }
  | { mcpServerUniqueName: string; mcpServerName?: string }
);

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
}
