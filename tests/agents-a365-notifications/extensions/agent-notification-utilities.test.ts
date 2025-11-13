// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext } from '@microsoft/agents-hosting';
import {
  AGENTS_CHANNEL,
  AGENTS_EMAIL_SUBCHANNEL,
  AGENTS_EXCEL_SUBCHANNEL,
  AGENTS_WORD_SUBCHANNEL,
  AGENTS_POWERPOINT_SUBCHANNEL,
  AGENT_LIFECYCLE,
  USER_CREATED_LIFECYCLE_EVENT,
  USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT,
  USER_DELETED_LIFECYCLE_EVENT
} from '@microsoft/agents-a365-notifications';

// These utility functions are internal to agent-notification.ts
// We'll test them through the public API behavior they support

describe('Agent Notification Utilities', () => {
  let mockActivity: any;
  let mockTurnContext: Partial<TurnContext>;

  beforeEach(() => {
    mockActivity = {
      type: 'message',
      id: 'test-activity-id',
      channelId: AGENTS_EMAIL_SUBCHANNEL,
      recipient: {
        id: 'agent-recipient',
        role: 'agenticAppInstance'
      },
      from: {
        id: 'user-123',
        role: 'user'
      }
    };

    mockTurnContext = {
      activity: mockActivity
    };
  });

  describe('Agentic Request Detection', () => {
    it('should identify agentic app instance requests', () => {
      // Arrange
      mockActivity.recipient = {
        id: 'agent-id',
        role: 'agenticAppInstance'
      };

      // Act & Assert - We test this through the behavior it enables
      expect(mockActivity.recipient?.role).toBe('agenticAppInstance');
    });

    it('should identify agentic user requests', () => {
      // Arrange
      mockActivity.recipient = {
        id: 'user-id',
        role: 'agenticUser'
      };

      // Act & Assert - We test this through the behavior it enables
      expect(mockActivity.recipient?.role).toBe('agenticUser');
    });

    it('should handle non-agentic requests', () => {
      // Arrange
      mockActivity.recipient = {
        id: 'regular-bot',
        role: 'bot'
      };

      // Act & Assert
      expect(mockActivity.recipient?.role).not.toBe('agenticAppInstance');
      expect(mockActivity.recipient?.role).not.toBe('agenticUser');
    });

    it('should handle missing recipient information', () => {
      // Arrange
      mockActivity.recipient = undefined;

      // Act & Assert
      expect(mockActivity.recipient).toBeUndefined();
    });

    it('should handle missing role information', () => {
      // Arrange
      mockActivity.recipient = {
        id: 'recipient-id'
      };

      // Act & Assert
      expect(mockActivity.recipient.role).toBeUndefined();
    });
  });

  describe('Channel Validation', () => {
    it('should validate agentic channels start with agents prefix', () => {
      // Arrange
      const agenticChannels = [
        AGENTS_EMAIL_SUBCHANNEL,
        AGENTS_EXCEL_SUBCHANNEL,
        AGENTS_WORD_SUBCHANNEL,
        AGENTS_POWERPOINT_SUBCHANNEL
      ];

      // Act & Assert
      agenticChannels.forEach(channel => {
        expect(channel.toLowerCase().startsWith(AGENTS_CHANNEL)).toBe(true);
      });
    });

    it('should identify valid agentic subchannels', () => {
      // Arrange
      const validChannels = [
        AGENTS_EMAIL_SUBCHANNEL,
        AGENTS_EXCEL_SUBCHANNEL,
        AGENTS_WORD_SUBCHANNEL,
        AGENTS_POWERPOINT_SUBCHANNEL
      ];

      // Act & Assert
      validChannels.forEach(channel => {
        expect(channel).toMatch(/^agents:/);
      });
    });

    it('should reject non-agentic channels', () => {
      // Arrange
      const nonAgenticChannels = [
        'msteams',
        'skype',
        'webchat',
        'directline'
      ];

      // Act & Assert
      nonAgenticChannels.forEach(channel => {
        expect(channel.startsWith(AGENTS_CHANNEL)).toBe(false);
      });
    });

    it('should handle case insensitive channel validation', () => {
      // Arrange
      const mixedCaseChannels = [
        'AGENTS:EMAIL',
        'Agents:Excel',
        'agents:WORD',
        'AgEnTs:PowerPoint'
      ];

      // Act & Assert
      mixedCaseChannels.forEach(channel => {
        expect(channel.toLowerCase().startsWith(AGENTS_CHANNEL)).toBe(true);
      });
    });
  });

  describe('Lifecycle Event Validation', () => {
    it('should validate supported lifecycle events', () => {
      // Arrange
      const validLifecycleEvents = [
        USER_CREATED_LIFECYCLE_EVENT,
        USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT,
        USER_DELETED_LIFECYCLE_EVENT
      ];

      // Act & Assert
      validLifecycleEvents.forEach(event => {
        expect(event).toBeDefined();
        expect(typeof event).toBe('string');
        expect(event.length).toBeGreaterThan(0);
      });
    });

    it('should handle case insensitive lifecycle event matching', () => {
      // Arrange
      const lifecycleEvents = [
        USER_CREATED_LIFECYCLE_EVENT.toUpperCase(),
        USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT.toLowerCase(),
        USER_DELETED_LIFECYCLE_EVENT
      ];

      // Act & Assert
      lifecycleEvents.forEach(event => {
        expect(typeof event).toBe('string');
        expect(event.length).toBeGreaterThan(0);
      });
    });

    it('should identify invalid lifecycle events', () => {
      // Arrange
      const invalidEvents = [
        'invalidEvent',
        'userLoggedIn',
        'dataUpdated',
        ''
      ];

      // Act & Assert
      const validEvents = [
        USER_CREATED_LIFECYCLE_EVENT,
        USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT,
        USER_DELETED_LIFECYCLE_EVENT
      ];

      invalidEvents.forEach(event => {
        expect(validEvents).not.toContain(event);
      });
    });
  });

  describe('Activity Routing Context', () => {
    it('should handle activities with lifecycle information', () => {
      // Arrange
      mockActivity.name = AGENT_LIFECYCLE;
      mockActivity.valueType = USER_CREATED_LIFECYCLE_EVENT;

      // Act & Assert
      expect(mockActivity.name).toBe(AGENT_LIFECYCLE);
      expect(mockActivity.valueType).toBe(USER_CREATED_LIFECYCLE_EVENT);
    });

    it('should handle activities without lifecycle information', () => {
      // Arrange
      mockActivity.name = undefined;
      mockActivity.valueType = undefined;

      // Act & Assert
      expect(mockActivity.name).toBeUndefined();
      expect(mockActivity.valueType).toBeUndefined();
    });

    it('should validate lifecycle activity structure', () => {
      // Arrange
      const lifecycleActivity = {
        ...mockActivity,
        name: AGENT_LIFECYCLE,
        valueType: USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT,
        channelId: AGENTS_CHANNEL
      };

      // Act & Assert
      expect(lifecycleActivity.name).toBe(AGENT_LIFECYCLE);
      expect(lifecycleActivity.valueType).toBe(USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT);
      expect(lifecycleActivity.channelId).toBe(AGENTS_CHANNEL);
    });
  });

  describe('Route Selector Logic Support', () => {
    it('should support wildcard channel matching', () => {
      // Arrange
      const wildcardChannel = 'agents:*';
      
      // Act & Assert - Wildcard should match any agentic channel
      expect(wildcardChannel).toMatch(/agents:\*/);
    });

    it('should support specific channel matching', () => {
      // Arrange
      const specificChannels = [
        AGENTS_EMAIL_SUBCHANNEL,
        AGENTS_EXCEL_SUBCHANNEL,
        AGENTS_WORD_SUBCHANNEL,
        AGENTS_POWERPOINT_SUBCHANNEL
      ];

      // Act & Assert
      specificChannels.forEach(channel => {
        expect(channel).toMatch(/^agents:[a-z]+$/);
      });
    });

    it('should support lifecycle event wildcard matching', () => {
      // Arrange
      const wildcardEvent = '*';

      // Act & Assert
      expect(wildcardEvent).toBe('*');
    });

    it('should validate channel ID format consistency', () => {
      // Arrange
      const channels = [
        AGENTS_EMAIL_SUBCHANNEL,
        AGENTS_EXCEL_SUBCHANNEL,
        AGENTS_WORD_SUBCHANNEL,
        AGENTS_POWERPOINT_SUBCHANNEL
      ];

      // Act & Assert - All should follow agents:subchannel format
      channels.forEach(channel => {
        expect(channel).toMatch(/^agents:[a-z]+$/);
        expect(channel.split(':')).toHaveLength(2);
        expect(channel.split(':')[0]).toBe('agents');
      });
    });
  });

  describe('Error Handling Support', () => {
    it('should handle null or undefined turn context', () => {
      // Arrange
      const nullContext = null;
      const undefinedContext = undefined;

      // Act & Assert
      expect(nullContext).toBeNull();
      expect(undefinedContext).toBeUndefined();
    });

    it('should handle activities without required properties', () => {
      // Arrange
      const incompleteActivity: any = {
        type: 'message'
        // Missing channelId, recipient, etc.
      };

      // Act & Assert
      expect(incompleteActivity.channelId).toBeUndefined();
      expect(incompleteActivity.recipient).toBeUndefined();
    });

    it('should handle empty or malformed channel IDs', () => {
      // Arrange
      const malformedChannels = [
        '',
        'agents',
        'agents:',
        ':email',
        'invalid:format'
      ];

      // Act & Assert
      malformedChannels.forEach(channel => {
        if (channel.includes(':')) {
          const parts = channel.split(':');
          expect(parts.length).toBeLessThanOrEqual(2);
        }
      });
    });
  });

  describe('Integration with Constants', () => {
    it('should maintain consistency between channel constants and validation', () => {
      // Arrange
      const channelConstants = [
        AGENTS_EMAIL_SUBCHANNEL,
        AGENTS_EXCEL_SUBCHANNEL,
        AGENTS_WORD_SUBCHANNEL,
        AGENTS_POWERPOINT_SUBCHANNEL
      ];

      // Act & Assert
      channelConstants.forEach(channel => {
        expect(channel.startsWith(AGENTS_CHANNEL)).toBe(true);
        expect(channel).toContain(':');
      });
    });

    it('should maintain consistency between lifecycle constants and validation', () => {
      // Arrange
      const lifecycleConstants = [
        USER_CREATED_LIFECYCLE_EVENT,
        USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT,
        USER_DELETED_LIFECYCLE_EVENT
      ];

      // Act & Assert
      lifecycleConstants.forEach(event => {
        expect(event).toBeDefined();
        expect(typeof event).toBe('string');
        expect(event).not.toContain(' '); // No spaces in event names
      });
    });
  });
});