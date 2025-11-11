export interface MCPServerConfig {
  mcpServerName: string;
  url: string;
  headers?: Record<string, string>;
}

export interface McpClientTool {
  name: string;
  description: string;
  inputSchema: InputSchema;
}

export interface InputSchema {
  type: string;
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
  additionalProperties?: boolean;
}