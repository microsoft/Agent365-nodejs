// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// ------------------------------------------------------------------------------

import { TurnState, AgentApplication, TurnContext, DefaultConversationState } from '@microsoft/agents-hosting';
import { ActivityTypes } from '@microsoft/agents-activity';

import { Client, getClient } from './client';


interface ConversationState extends DefaultConversationState {
  count: number;
}
type ApplicationTurnState = TurnState<ConversationState>

export class A365Agent extends AgentApplication<ApplicationTurnState> {
  isApplicationInstalled: boolean = false;
  termsAndConditionsAccepted: boolean = false;
  agentName = 'A365 Agent';

  constructor() {
    super();

    this.onActivity(ActivityTypes.Message, async (context: TurnContext, state: ApplicationTurnState) => {
      // Increment count state
      let count = state.conversation.count ?? 0;
      state.conversation.count = ++count;

      await this.handleAgentMessageActivity(context, state);
    });

    this.onActivity(ActivityTypes.InstallationUpdate, async (context: TurnContext, state: TurnState) => {
      await this.handleInstallationUpdateActivity(context, state);
    });
  }

  /**
   * Handles incoming user messages and sends responses.
   */
  async handleAgentMessageActivity(turnContext: TurnContext, _state: TurnState): Promise<void> {
    if (!this.isApplicationInstalled) {
      await turnContext.sendActivity('Please install the application before sending messages.');
      return;
    }

    if (!this.termsAndConditionsAccepted) {
      if (turnContext.activity.text?.trim().toLowerCase() === 'i accept') {
        this.termsAndConditionsAccepted = true;
        await turnContext.sendActivity('Thank you for accepting the terms and conditions! How can I assist you today?');
        return;
      } else {
        await turnContext.sendActivity('Please accept the terms and conditions to proceed. Send \'I accept\' to accept.');
        return;
      }
    }

    const userMessage = turnContext.activity.text?.trim() || '';

    if (!userMessage) {
      await turnContext.sendActivity('Please send me a message and I\'ll help you!');
      return;
    }

    try {
      const client = await getClient(this.getAuthorizationSafe(), turnContext);
      const response = await this.invokeAgent(client, userMessage);
      await turnContext.sendActivity(response);
    } catch (error) {
      console.error('LLM query error:', error);
      const err = error as Error;
      await turnContext.sendActivity(`Error: ${err.message || String(err)}`);
    }
  }

  /**
   * Handles agent installation and removal events.
   */
  async handleInstallationUpdateActivity(turnContext: TurnContext, _state: TurnState): Promise<void> {
    if (turnContext.activity.action === 'add') {
      this.isApplicationInstalled = true;
      this.termsAndConditionsAccepted = false;
      await turnContext.sendActivity('Thank you for hiring me! Looking forward to assisting you in your professional journey! Before I begin, could you please confirm that you accept the terms and conditions? Send "I accept" to accept.');
    } else if (turnContext.activity.action === 'remove') {
      this.isApplicationInstalled = false;
      this.termsAndConditionsAccepted = false;
      await turnContext.sendActivity('Thank you for your time, I enjoyed working with you.');
    }
  }

  async invokeAgent(client: Client, prompt: string): Promise<string> {
    try {
      return await client.invokeAgent(prompt);
    } catch (error) {
      console.error('Error invoking agent:', error);
      throw error;
    }
  }

  private getAuthorizationSafe() {
    try {
      // This will return an error if authorization is not set
      return this.authorization;
    } catch {
      console.warn('Authorization is not set on the agent application');
      return undefined;
    }
  }
}

export const agentApplication = new A365Agent();
