// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  TurnState,
  Authorization,
  AgentApplication,
  TurnContext,
  DefaultConversationState,
} from '@microsoft/agents-hosting';
import { ActivityTypes } from '@microsoft/agents-activity';
import { getOpenAIClient, OpenAIClient } from './openai-client';
import { TokenHelper } from './token-helper';
import { GraphService } from './graph-service';
import { MessagePollingService } from './message-polling-service';

/**
 * Extended conversation state to track message count and other state.
 */
interface ConversationState extends DefaultConversationState {
  count: number;
}

type ApplicationTurnState = TurnState<ConversationState>;

/**
 * SampleAgent demonstrates a complete OpenAI agent implementation
 * with authentication, Graph API integration, and message polling.
 */
export class SampleAgent extends AgentApplication<ApplicationTurnState> {
  isApplicationInstalled: boolean = false;
  termsAndConditionsAccepted: boolean = false;
  agentName = 'OpenAI Sample Agent';
  authHandlerName = 'agentic';

  private tokenHelper: TokenHelper;
  private graphService: GraphService;
  private pollingService: MessagePollingService;

  constructor() {
    super();

    // Initialize services
    this.tokenHelper = new TokenHelper(this.authHandlerName);
    this.graphService = new GraphService(this.tokenHelper);
    this.pollingService = new MessagePollingService(5000); // 5 second polling interval

    // Register activity handlers
    this.onActivity(ActivityTypes.Message, async (context: TurnContext, state: ApplicationTurnState) => {
      // Increment message count
      let count = state.conversation.count ?? 0;
      state.conversation.count = ++count;

      await this.handleAgentMessageActivity(context, state);
    });

    this.onActivity(ActivityTypes.InstallationUpdate, async (context: TurnContext, state: TurnState) => {
      await this.handleInstallationUpdateActivity(context, state);
    });
  }

  /**
   * Handles incoming user messages and generates responses using OpenAI.
   */
  async handleAgentMessageActivity(turnContext: TurnContext, _state: TurnState): Promise<void> {
    // Check if application is installed
    if (!this.isApplicationInstalled) {
      await turnContext.sendActivity('Please install the application before sending messages.');
      return;
    }

    // Check if terms and conditions are accepted
    if (!this.termsAndConditionsAccepted) {
      if (turnContext.activity.text?.trim().toLowerCase() === 'i accept') {
        this.termsAndConditionsAccepted = true;
        await turnContext.sendActivity(
          'Thank you for accepting the terms and conditions! How can I assist you today?'
        );
        return;
      } else {
        await turnContext.sendActivity(
          'Please accept the terms and conditions to proceed. Send "I accept" to continue.'
        );
        return;
      }
    }

    const userMessage = turnContext.activity.text?.trim() || '';

    if (!userMessage) {
      await turnContext.sendActivity('Please send me a message and I\'ll help you!');
      return;
    }

    try {
      // Initialize token helper if not already done
      const authorization = this.getAuthorizationSafe();
      if (authorization && !this.tokenHelper.isInitialized()) {
        await this.tokenHelper.initialize(authorization, turnContext);
      }

      // Handle special commands
      if (userMessage.toLowerCase().startsWith('/graph')) {
        await this.handleGraphCommand(turnContext, userMessage);
        return;
      }

      if (userMessage.toLowerCase().startsWith('/polling')) {
        await this.handlePollingCommand(turnContext, userMessage);
        return;
      }

      // Get OpenAI client and invoke the agent
      const client = await getOpenAIClient(authorization, this.authHandlerName, turnContext);
      const response = await this.invokeAgent(client, userMessage);
      await turnContext.sendActivity(response);
    } catch (error) {
      console.error('Error handling message:', error);
      const err = error as Error;
      await turnContext.sendActivity(`Error: ${err.message || String(err)}`);
    }
  }

  /**
   * Handles Graph API commands for demonstration.
   */
  private async handleGraphCommand(turnContext: TurnContext, message: string): Promise<void> {
    const command = message.toLowerCase();

    if (!this.tokenHelper.isInitialized()) {
      await turnContext.sendActivity(
        'Graph API integration is not available. Authentication is required.'
      );
      return;
    }

    try {
      if (command.includes('user') || command.includes('profile')) {
        const user = await this.graphService.getCurrentUser();
        if (user) {
          await turnContext.sendActivity(
            `User Profile:\n- Name: ${user.displayName || 'N/A'}\n- Email: ${user.mail || user.userPrincipalName || 'N/A'}`
          );
        } else {
          await turnContext.sendActivity('Unable to retrieve user profile.');
        }
      } else if (command.includes('emails') || command.includes('mail')) {
        const emails = await this.graphService.getRecentEmails(5);
        if (emails && emails.length > 0) {
          const emailList = emails
            .map((email, index) => `${index + 1}. ${email.subject} (${email.receivedDateTime})`)
            .join('\n');
          await turnContext.sendActivity(`Recent Emails:\n${emailList}`);
        } else {
          await turnContext.sendActivity('No recent emails found or unable to retrieve emails.');
        }
      } else {
        await turnContext.sendActivity(
          'Graph commands:\n- /graph user - Get user profile\n- /graph emails - Get recent emails'
        );
      }
    } catch (error) {
      console.error('Graph command error:', error);
      await turnContext.sendActivity('An error occurred while executing the Graph command.');
    }
  }

  /**
   * Handles polling service commands for demonstration.
   */
  private async handlePollingCommand(turnContext: TurnContext, message: string): Promise<void> {
    const command = message.toLowerCase();

    if (command.includes('start')) {
      if (!this.pollingService.isServiceRunning()) {
        this.pollingService.start(async (_ctx) => {
          // Example polling callback
          console.log('Processing message from polling service');
        });
        await turnContext.sendActivity('Message polling service started.');
      } else {
        await turnContext.sendActivity('Polling service is already running.');
      }
    } else if (command.includes('stop')) {
      if (this.pollingService.isServiceRunning()) {
        this.pollingService.stop();
        await turnContext.sendActivity('Message polling service stopped.');
      } else {
        await turnContext.sendActivity('Polling service is not running.');
      }
    } else if (command.includes('status') || command.includes('stats')) {
      const stats = this.pollingService.getStats();
      await turnContext.sendActivity(
        `Polling Service Status:\n- Running: ${stats.isRunning}\n- Queue Size: ${stats.queueSize}\n- Poll Interval: ${stats.pollInterval}ms`
      );
    } else {
      await turnContext.sendActivity(
        'Polling commands:\n- /polling start - Start the service\n- /polling stop - Stop the service\n- /polling status - Get service status'
      );
    }
  }

  /**
   * Handles agent installation and removal events.
   */
  async handleInstallationUpdateActivity(turnContext: TurnContext, _state: TurnState): Promise<void> {
    if (turnContext.activity.action === 'add') {
      this.isApplicationInstalled = true;
      this.termsAndConditionsAccepted = false;
      await turnContext.sendActivity(
        'Welcome! Thank you for installing the OpenAI Sample Agent. ' +
          'Before we begin, please confirm that you accept the terms and conditions by sending "I accept".'
      );
    } else if (turnContext.activity.action === 'remove') {
      this.isApplicationInstalled = false;
      this.termsAndConditionsAccepted = false;
      await turnContext.sendActivity('Thank you for using the OpenAI Sample Agent. Goodbye!');
    }
  }

  /**
   * Invokes the OpenAI agent with a user prompt.
   */
  async invokeAgent(client: OpenAIClient, prompt: string): Promise<string> {
    try {
      return await client.invokeAgent(prompt);
    } catch (error) {
      console.error('Error invoking agent:', error);
      throw error;
    }
  }

  /**
   * Safely retrieves the authorization context.
   */
  private getAuthorizationSafe(): Authorization | undefined {
    try {
      return this.authorization as Authorization;
    } catch {
      console.warn('Authorization is not set on the agent application');
      return undefined;
    }
  }

  /**
   * Cleanup method to stop services when the agent is destroyed.
   */
  async cleanup(): Promise<void> {
    if (this.pollingService.isServiceRunning()) {
      this.pollingService.stop();
    }
  }
}

// Export a singleton instance of the agent
export const agentApplication = new SampleAgent();
