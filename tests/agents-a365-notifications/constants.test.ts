// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

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

describe('Notification Constants', () => {
  describe('Channel Constants', () => {
    it('should define AGENTS_CHANNEL constant', () => {
      // Assert
      expect(AGENTS_CHANNEL).toBeDefined();
      expect(typeof AGENTS_CHANNEL).toBe('string');
      expect(AGENTS_CHANNEL).toBe('agents');
    });

    it('should define AGENTS_EMAIL_SUBCHANNEL constant', () => {
      // Assert
      expect(AGENTS_EMAIL_SUBCHANNEL).toBeDefined();
      expect(typeof AGENTS_EMAIL_SUBCHANNEL).toBe('string');
      expect(AGENTS_EMAIL_SUBCHANNEL).toBe('agents:email');
    });

    it('should define AGENTS_EXCEL_SUBCHANNEL constant', () => {
      // Assert
      expect(AGENTS_EXCEL_SUBCHANNEL).toBeDefined();
      expect(typeof AGENTS_EXCEL_SUBCHANNEL).toBe('string');
      expect(AGENTS_EXCEL_SUBCHANNEL).toBe('agents:excel');
    });

    it('should define AGENTS_WORD_SUBCHANNEL constant', () => {
      // Assert
      expect(AGENTS_WORD_SUBCHANNEL).toBeDefined();
      expect(typeof AGENTS_WORD_SUBCHANNEL).toBe('string');
      expect(AGENTS_WORD_SUBCHANNEL).toBe('agents:word');
    });

    it('should define AGENTS_POWERPOINT_SUBCHANNEL constant', () => {
      // Assert
      expect(AGENTS_POWERPOINT_SUBCHANNEL).toBeDefined();
      expect(typeof AGENTS_POWERPOINT_SUBCHANNEL).toBe('string');
      expect(AGENTS_POWERPOINT_SUBCHANNEL).toBe('agents:powerpoint');
    });

    it('should have all subchannel constants start with main channel', () => {
      // Assert
      expect(AGENTS_EMAIL_SUBCHANNEL.startsWith(AGENTS_CHANNEL)).toBe(true);
      expect(AGENTS_EXCEL_SUBCHANNEL.startsWith(AGENTS_CHANNEL)).toBe(true);
      expect(AGENTS_WORD_SUBCHANNEL.startsWith(AGENTS_CHANNEL)).toBe(true);
      expect(AGENTS_POWERPOINT_SUBCHANNEL.startsWith(AGENTS_CHANNEL)).toBe(true);
    });

    it('should have unique subchannel identifiers', () => {
      // Arrange
      const subchannels = [
        AGENTS_EMAIL_SUBCHANNEL,
        AGENTS_EXCEL_SUBCHANNEL,
        AGENTS_WORD_SUBCHANNEL,
        AGENTS_POWERPOINT_SUBCHANNEL
      ];

      // Assert
      const uniqueSubchannels = new Set(subchannels);
      expect(uniqueSubchannels.size).toBe(subchannels.length);
    });
  });

  describe('Lifecycle Constants', () => {
    it('should define AGENT_LIFECYCLE constant', () => {
      // Assert
      expect(AGENT_LIFECYCLE).toBeDefined();
      expect(typeof AGENT_LIFECYCLE).toBe('string');
      expect(AGENT_LIFECYCLE).toBe('agentlifecycle');
    });

    it('should define USER_CREATED_LIFECYCLE_EVENT constant', () => {
      // Assert
      expect(USER_CREATED_LIFECYCLE_EVENT).toBeDefined();
      expect(typeof USER_CREATED_LIFECYCLE_EVENT).toBe('string');
      expect(USER_CREATED_LIFECYCLE_EVENT).toBe('agenticuseridentitycreated');
    });

    it('should define USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT constant', () => {
      // Assert
      expect(USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT).toBeDefined();
      expect(typeof USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT).toBe('string');
      expect(USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT).toBe('agenticuserworkloadonboardingupdated');
    });

    it('should define USER_DELETED_LIFECYCLE_EVENT constant', () => {
      // Assert
      expect(USER_DELETED_LIFECYCLE_EVENT).toBeDefined();
      expect(typeof USER_DELETED_LIFECYCLE_EVENT).toBe('string');
      expect(USER_DELETED_LIFECYCLE_EVENT).toBe('agenticuserdeleted');
    });

    it('should have unique lifecycle event identifiers', () => {
      // Arrange
      const lifecycleEvents = [
        USER_CREATED_LIFECYCLE_EVENT,
        USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT,
        USER_DELETED_LIFECYCLE_EVENT
      ];

      // Assert
      const uniqueEvents = new Set(lifecycleEvents);
      expect(uniqueEvents.size).toBe(lifecycleEvents.length);
    });
  });

  describe('Constant Validation', () => {
    it('should export immutable string constants', () => {
      // Arrange & Act & Assert
      const constants = [
        AGENTS_CHANNEL,
        AGENTS_EMAIL_SUBCHANNEL,
        AGENTS_EXCEL_SUBCHANNEL,
        AGENTS_WORD_SUBCHANNEL,
        AGENTS_POWERPOINT_SUBCHANNEL,
        AGENT_LIFECYCLE,
        USER_CREATED_LIFECYCLE_EVENT,
        USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT,
        USER_DELETED_LIFECYCLE_EVENT
      ];

      constants.forEach(constant => {
        expect(typeof constant).toBe('string');
        expect(constant.length).toBeGreaterThan(0);
      });
    });

    it('should have descriptive constant names that match values', () => {
      // Assert - Channel constants
      expect(AGENTS_CHANNEL).toMatch(/agents/);
      expect(AGENTS_EMAIL_SUBCHANNEL).toMatch(/email/);
      expect(AGENTS_EXCEL_SUBCHANNEL).toMatch(/excel/);
      expect(AGENTS_WORD_SUBCHANNEL).toMatch(/word/);
      expect(AGENTS_POWERPOINT_SUBCHANNEL).toMatch(/powerpoint/);

      // Assert - Lifecycle constants
      expect(AGENT_LIFECYCLE).toMatch(/agentlifecycle/);
      expect(USER_CREATED_LIFECYCLE_EVENT).toMatch(/created/);
      expect(USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT).toMatch(/onboarding/);
      expect(USER_DELETED_LIFECYCLE_EVENT).toMatch(/deleted/);
    });
  });
});