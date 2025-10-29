import { Agent } from '@openai/agents';
import { TurnContext } from '@microsoft/agents-hosting';

/**
 * MCP Server Configuration interface
 */
interface McpServerConfig {
  serverName: string;
  serverUrl: string;
  authToken?: string;
  environmentId?: string;
}

/**
 * Local MCP Tool Registration Service
 */
export class LocalMcpToolRegistrationService {
  async addMcpToolServers(
    agent: Agent,
    userId: string,
    environmentId: string,
    _turnContext: TurnContext,
    authToken: string,
  ): Promise<void> {
    try {
      const serverConfigs = this.getServerConfigurations(userId, environmentId, authToken);
      console.log(`🔗 Setting up ${serverConfigs.length} MCP servers...`);

      for (const config of serverConfigs) {
        await this.createAndAddMcpServer(agent, config);
      }

      console.log(`✅ Local MCP setup complete. Added ${serverConfigs.length} servers to agent: ${agent.name}`);

    } catch (error) {
      console.warn('⚠️ Failed to setup local MCP servers:', error);
    }
  }

  private getServerConfigurations(userId: string, environmentId: string, authToken: string): McpServerConfig[] {
    return [
      {
        serverName: 'mcp_MailTools',
        serverUrl: 'http://localhost:5309',
        authToken,
        environmentId
      },
      {
        serverName: 'mcp_CalendarTools',
        serverUrl: 'http://localhost:5309',
        authToken,
        environmentId
      }
    ];
  }

  private async createAndAddMcpServer(agent: Agent, config: McpServerConfig): Promise<void> {
    try {
      console.log(`🔗 Connecting to MCP server: ${config.serverName} at ${config.serverUrl}`);
      // For local development, we simulate the server creation
      const mockMcpServer = this.createMockMcpServer(config);

      // Add server to agent's mcpServers array
      if (!agent.mcpServers) {
        agent.mcpServers = [];
      }
      agent.mcpServers.push(mockMcpServer);

      console.log(`✅ Added ${config.serverName} to agent's mcpServers array`);

    } catch (error) {
      console.error(`Failed to create MCP server ${config.serverName}:`, error);
    }
  }

  private createMockMcpServer(config: McpServerConfig): {
    name: string;
    url: string;
    cacheToolsList: boolean;
    connect: () => Promise<void>;
    close: () => Promise<void>;
    listTools: () => Promise<Array<{
      name: string;
      inputSchema: {
        type: 'object';
        required: string[];
        properties: Record<string, unknown>;
        additionalProperties: boolean;
      };
      description?: string;
    }>>;
    getResourceContents: () => Promise<unknown[]>;
    getResourceTemplates: () => Promise<unknown[]>;
    callTool: () => Promise<Array<{type: string; text: string}>>;
    invalidateToolsCache: () => Promise<void>;
  } {
    return {
      name: config.serverName,
      url: config.serverUrl,
      cacheToolsList: true,
      connect: async () => {
        console.log(`🌐 Mock connection established to ${config.serverName}`);
        return Promise.resolve();
      },
      close: async () => {
        console.log(`🔌 Mock connection closed to ${config.serverName}`);
        return Promise.resolve();
      },
      listTools: async () => {
        return this.getMockTools(config.serverName);
      },
      // Mock additional required properties for MCPServer interface
      getResourceContents: async () => ([]),
      getResourceTemplates: async () => ([]),
      callTool: async () => ([]),
      invalidateToolsCache: async () => Promise.resolve()
    };
  }

  private getMockTools(serverName: string): Array<{
    name: string;
    inputSchema: {
      type: 'object';
      required: string[];
      properties: Record<string, unknown>;
      additionalProperties: boolean;
    };
    description?: string;
  }> {
    if (serverName === 'mcp_MailTools') {
      return [
        {
          name: 'send_email',
          description: 'Send an email message',
          inputSchema: {
            type: 'object' as const,
            required: ['to', 'subject', 'body'],
            properties: {
              to: { type: 'string', description: 'Recipient email address' },
              cc: { type: 'string', description: 'CC email addresses (comma-separated)' },
              bcc: { type: 'string', description: 'BCC email addresses (comma-separated)' },
              subject: { type: 'string', description: 'Email subject line' },
              body: { type: 'string', description: 'Email body content' },
              priority: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Email priority' }
            },
            additionalProperties: false
          }
        },
        {
          name: 'read_emails',
          description: 'Read recent emails from inbox',
          inputSchema: {
            type: 'object' as const,
            required: [],
            properties: {
              folder: { type: 'string', description: 'Folder to read from (inbox, sent, drafts)', default: 'inbox' },
              count: { type: 'number', description: 'Number of emails to retrieve', default: 10, minimum: 1, maximum: 100 },
              unreadOnly: { type: 'boolean', description: 'Only return unread emails', default: false }
            },
            additionalProperties: false
          }
        },
        {
          name: 'search_emails',
          description: 'Search for emails by criteria',
          inputSchema: {
            type: 'object' as const,
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'Search query string' },
              from: { type: 'string', description: 'Filter by sender email' },
              subject: { type: 'string', description: 'Filter by subject keywords' },
              dateFrom: { type: 'string', format: 'date', description: 'Start date for search (YYYY-MM-DD)' },
              dateTo: { type: 'string', format: 'date', description: 'End date for search (YYYY-MM-DD)' },
              hasAttachments: { type: 'boolean', description: 'Filter emails with attachments' }
            },
            additionalProperties: false
          }
        }
      ];
    } else if (serverName === 'mcp_CalendarTools') {
      return [
        {
          name: 'create_event',
          description: 'Create a new calendar event',
          inputSchema: {
            type: 'object' as const,
            required: ['title', 'startTime', 'endTime'],
            properties: {
              title: { type: 'string', description: 'Event title' },
              description: { type: 'string', description: 'Event description' },
              startTime: { type: 'string', format: 'date-time', description: 'Event start time (ISO 8601)' },
              endTime: { type: 'string', format: 'date-time', description: 'Event end time (ISO 8601)' },
              location: { type: 'string', description: 'Event location' },
              attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendee email addresses' },
              isAllDay: { type: 'boolean', description: 'Is this an all-day event', default: false },
              reminder: { type: 'number', description: 'Reminder time in minutes before event', default: 15 }
            },
            additionalProperties: false
          }
        },
        {
          name: 'list_events',
          description: 'List upcoming calendar events',
          inputSchema: {
            type: 'object' as const,
            required: [],
            properties: {
              startDate: { type: 'string', format: 'date', description: 'Start date for listing events (YYYY-MM-DD)', default: 'today' },
              endDate: { type: 'string', format: 'date', description: 'End date for listing events (YYYY-MM-DD)' },
              count: { type: 'number', description: 'Maximum number of events to return', default: 20, minimum: 1, maximum: 100 },
              calendarId: { type: 'string', description: 'Specific calendar ID to query' }
            },
            additionalProperties: false
          }
        },
        {
          name: 'update_event',
          description: 'Update an existing calendar event',
          inputSchema: {
            type: 'object' as const,
            required: ['eventId'],
            properties: {
              eventId: { type: 'string', description: 'ID of the event to update' },
              title: { type: 'string', description: 'Updated event title' },
              description: { type: 'string', description: 'Updated event description' },
              startTime: { type: 'string', format: 'date-time', description: 'Updated start time (ISO 8601)' },
              endTime: { type: 'string', format: 'date-time', description: 'Updated end time (ISO 8601)' },
              location: { type: 'string', description: 'Updated event location' },
              attendees: { type: 'array', items: { type: 'string' }, description: 'Updated list of attendee email addresses' }
            },
            additionalProperties: false
          }
        },
        {
          name: 'delete_event',
          description: 'Delete a calendar event',
          inputSchema: {
            type: 'object' as const,
            required: ['eventId'],
            properties: {
              eventId: { type: 'string', description: 'ID of the event to delete' },
              sendNotifications: { type: 'boolean', description: 'Whether to send cancellation notifications to attendees', default: true },
              reason: { type: 'string', description: 'Optional reason for cancellation' }
            },
            additionalProperties: false
          }
        }
      ];
    }
    return [];
  }

}
