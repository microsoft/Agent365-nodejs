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
  USER_DELETED_LIFECYCLE_EVENT,
} from '@microsoft/agents-a365-notifications';

describe('Constants', () => {
  describe('Channel Constants', () => {
    it('should have correct AGENTS_CHANNEL value', () => {
      expect(AGENTS_CHANNEL).toBe('agents');
    });

    it('should have correct AGENTS_EMAIL_SUBCHANNEL value', () => {
      expect(AGENTS_EMAIL_SUBCHANNEL).toBe('agents:email');
    });

    it('should have correct AGENTS_EXCEL_SUBCHANNEL value', () => {
      expect(AGENTS_EXCEL_SUBCHANNEL).toBe('agents:excel');
    });

    it('should have correct AGENTS_WORD_SUBCHANNEL value', () => {
      expect(AGENTS_WORD_SUBCHANNEL).toBe('agents:word');
    });

    it('should have correct AGENTS_POWERPOINT_SUBCHANNEL value', () => {
      expect(AGENTS_POWERPOINT_SUBCHANNEL).toBe('agents:powerpoint');
    });
  });

  describe('Lifecycle Constants', () => {
    it('should have correct AGENT_LIFECYCLE value', () => {
      expect(AGENT_LIFECYCLE).toBe('agentlifecycle');
    });

    it('should have correct USER_CREATED_LIFECYCLE_EVENT value', () => {
      expect(USER_CREATED_LIFECYCLE_EVENT).toBe('agenticuseridentitycreated');
    });

    it('should have correct USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT value', () => {
      expect(USER_WORKLOAD_ONBOARDING_LIFECYCLE_EVENT).toBe('agenticuserworkloadonboardingupdated');
    });

    it('should have correct USER_DELETED_LIFECYCLE_EVENT value', () => {
      expect(USER_DELETED_LIFECYCLE_EVENT).toBe('agenticuserdeleted');
    });
  });
});