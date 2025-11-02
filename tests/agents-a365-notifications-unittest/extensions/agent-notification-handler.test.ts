// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AgentNotificationHandler } from '../../../packages/agents-a365-notifications/src/extensions/agent-notification-handler';
import { TurnContext, TurnState } from '@microsoft/agents-hosting';
import { AgentNotificationActivity } from '../../../packages/agents-a365-notifications/src/models/agent-notification-activity';

// Mock implementations for testing
const mockTurnContext = {} as TurnContext;
const mockTurnState = {} as TurnState;
const mockNotificationActivity = {} as AgentNotificationActivity;

describe('AgentNotificationHandler', () => {
  describe('type definition', () => {
    it('should be a function type that returns Promise<void>', async () => {
      const testHandler: AgentNotificationHandler = async (
        turnContext: TurnContext,
        turnState: TurnState,
        agentNotificationActivity: AgentNotificationActivity
      ): Promise<void> => {
        // Test implementation
        expect(turnContext).toBeDefined();
        expect(turnState).toBeDefined();
        expect(agentNotificationActivity).toBeDefined();
      };

      // Should be able to call the handler without errors
      await expect(testHandler(mockTurnContext, mockTurnState, mockNotificationActivity)).resolves.toBeUndefined();
    });

    it('should accept custom TurnState generic', async () => {
      interface CustomTurnState extends TurnState {
        customProperty: string;
      }

      const testHandler: AgentNotificationHandler<CustomTurnState> = async (
        turnContext: TurnContext,
        turnState: CustomTurnState,
        agentNotificationActivity: AgentNotificationActivity
      ): Promise<void> => {
        expect(turnState.customProperty).toBeDefined();
      };

      const customTurnState = { customProperty: 'test' } as CustomTurnState;
      
      await expect(testHandler(mockTurnContext, customTurnState, mockNotificationActivity)).resolves.toBeUndefined();
    });

    it('should work with default TurnState when no generic provided', async () => {
      const testHandler: AgentNotificationHandler = async (
        turnContext,
        turnState,
        agentNotificationActivity
      ) => {
        // Should compile without specifying generic type
        expect(turnContext).toBeDefined();
        expect(turnState).toBeDefined();
        expect(agentNotificationActivity).toBeDefined();
      };

      await expect(testHandler(mockTurnContext, mockTurnState, mockNotificationActivity)).resolves.toBeUndefined();
    });
  });

  describe('function signature validation', () => {
    it('should have correct parameter types', () => {
      const testHandler: AgentNotificationHandler = async (
        turnContext: TurnContext,
        turnState: TurnState,
        agentNotificationActivity: AgentNotificationActivity
      ) => {
        // Type validation through parameter usage
        expect(typeof turnContext).toBe('object');
        expect(typeof turnState).toBe('object');
        expect(typeof agentNotificationActivity).toBe('object');
      };

      // Type checking happens at compile time, this validates the handler can be defined
      expect(testHandler).toBeDefined();
      expect(typeof testHandler).toBe('function');
    });

    it('should return Promise<void>', () => {
      const testHandler: AgentNotificationHandler = async () => {
        return; // Explicit void return
      };

      const result = testHandler(mockTurnContext, mockTurnState, mockNotificationActivity);
      expect(result).toBeInstanceOf(Promise);
    });
  });
});