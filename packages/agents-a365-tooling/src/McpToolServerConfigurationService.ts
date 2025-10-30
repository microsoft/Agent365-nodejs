import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { MCPServerConfig } from './contracts';
import { Utility } from './Utility';

/**
 * Service responsible for discovering and normalizing MCP (Model Context Protocol)
 * tool servers and producing configuration objects consumable by the Claude SDK.
 */
export class McpToolServerConfigurationService {
  private readonly logger = console;

  /**
   * Construct a McpToolServerConfigurationService.
   */
  constructor() {
  }

  /**
   * Return MCP server definitions for the given agent and environment. In development (NODE_ENV=Development) this reads the local ToolingManifest.json; otherwise it queries the remote tooling gateway.
   *
   * @param agentUserId The unique identifier of the digital worker/agent user for which to discover servers.
   * @param authToken Optional bearer token used when querying the remote tooling gateway.
   * @returns A promise resolving to an array of normalized MCP server configuration objects.
   */
  async listToolServers(agentUserId: string, authToken: string): Promise<MCPServerConfig[]> {
    return await (this.isDevScenario() ? this.getMCPServerConfigsFromManifest() : this.getMCPServerConfigsFromToolingGateway(agentUserId, authToken));
  }

  /**
   * Query the tooling gateway for MCP servers for the specified agent and normalize each entry's mcpServerUniqueName into a full URL using Utility.BuildMcpServerUrl.
   * Throws an error if the gateway call fails.
   *
   * @param agentId The digital worker/agent id used by the tooling gateway to scope results.
   * @param authToken Optional Bearer token to include in the Authorization header when calling the gateway.
   * @throws Error when the gateway call fails or returns an unexpected payload.
   */
  private async getMCPServerConfigsFromToolingGateway(agentUserId: string, authToken: string): Promise<MCPServerConfig[]> {
    const configEndpoint = Utility.GetToolingGatewayForDigitalWorker(agentUserId);

    try {
      const response = await axios.get(
        configEndpoint,
        {
          headers: {
            'Authorization': authToken ? `Bearer ${authToken}` : undefined,
          },
          timeout: 10000 // 10 seconds timeout
        }
      );

      return (response.data) || [];
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      throw new Error(`Failed to read MCP servers from endpoint: ${error.code || 'UNKNOWN'} ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Read MCP servers from a local ToolingManifest.json file (development only).
   * Searches process.cwd() and process.argv[1] for the manifest file.
   *
   * Reads MCP server configurations from ToolingManifest.json in the application's content root.
   * The file should be located at: [ProjectRoot]/ToolingManifest.json
   *
   * Example ToolingManifest.json:
   * {
   *   "mcpServers": [
   *     {
   *       "mcpServerName": "mailMCPServerConfig",
   *       "mcpServerUniqueName": "mcp_MailTools"
   *     },
   *     {
   *       "mcpServerName": "sharePointMCPServerConfig",
   *       "mcpServerUniqueName": "mcp_SharePointTools"
   *     }
   *   ]
   * }
   */
  private async getMCPServerConfigsFromManifest(): Promise<MCPServerConfig[]> {
    let manifestPath = path.join(process.cwd(), 'ToolingManifest.json');
    if (!fs.existsSync(manifestPath)) {
      this.logger.warn(`ToolingManifest.json not found at ${manifestPath}, checking argv[1] location.`);
      manifestPath = path.join(path.dirname(process.argv[1] || ''), 'ToolingManifest.json');
    }

    if (!fs.existsSync(manifestPath)) {
      this.logger.warn(`ToolingManifest.json not found at ${manifestPath}`);
      return [];
    }

    try {
      const jsonContent = fs.readFileSync(manifestPath, 'utf-8');
      const manifestData = JSON.parse(jsonContent);
      const mcpServers = manifestData.mcpServers || [];

      return mcpServers.map((s: MCPServerConfig) => {
        return {
          mcpServerName: s.mcpServerName,
          url: Utility.BuildMcpServerUrl(s.mcpServerName)
        };
      });
    } catch (err: unknown) {
      const error = err as Error;
      this.logger.error(`Error reading or parsing ToolingManifest.json: ${error.message || 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Detect if the process is running in a development scenario based on environment variables.
   *
   * @returns {boolean} True when running in a development environment.
   */
  private isDevScenario(): boolean {
    const environment = process.env.NODE_ENV || 'Development';
    return environment.toLowerCase() === 'development';
  }
}
