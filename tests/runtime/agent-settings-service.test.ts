// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  AgentSettingsService,
  AgentSettingTemplate,
  AgentSettings,
  PowerPlatformApiDiscovery,
  ClusterCategory,
} from '@microsoft/agents-a365-runtime';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('AgentSettingsService', () => {
  const testTenantId = 'e3064512-cc6d-4703-be71-a2ecaecaa98a';
  const testAccessToken = 'test-access-token-123';
  const testAgentType = 'test-agent-type';
  const testAgentInstanceId = 'test-agent-instance-123';
  let service: AgentSettingsService;
  let apiDiscovery: PowerPlatformApiDiscovery;

  beforeEach(() => {
    apiDiscovery = new PowerPlatformApiDiscovery('prod' as ClusterCategory);
    service = new AgentSettingsService(apiDiscovery, testTenantId);
    mockFetch.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAgentSettingTemplateEndpoint', () => {
    it('should return correct endpoint for agent setting template', () => {
      const endpoint = service.getAgentSettingTemplateEndpoint(testAgentType);
      expect(endpoint).toContain('/agents/v1.0/settings/templates/');
      expect(endpoint).toContain(encodeURIComponent(testAgentType));
      expect(endpoint).toMatch(/^https:\/\//);
    });

    it('should encode special characters in agent type', () => {
      const agentTypeWithSpecialChars = 'agent/type with spaces';
      const endpoint = service.getAgentSettingTemplateEndpoint(agentTypeWithSpecialChars);
      expect(endpoint).toContain(encodeURIComponent(agentTypeWithSpecialChars));
    });
  });

  describe('getAgentSettingsEndpoint', () => {
    it('should return correct endpoint for agent instance settings', () => {
      const endpoint = service.getAgentSettingsEndpoint(testAgentInstanceId);
      expect(endpoint).toContain('/agents/v1.0/settings/instances/');
      expect(endpoint).toContain(encodeURIComponent(testAgentInstanceId));
      expect(endpoint).toMatch(/^https:\/\//);
    });

    it('should encode special characters in agent instance id', () => {
      const instanceIdWithSpecialChars = 'instance/id with spaces';
      const endpoint = service.getAgentSettingsEndpoint(instanceIdWithSpecialChars);
      expect(endpoint).toContain(encodeURIComponent(instanceIdWithSpecialChars));
    });
  });

  describe('getAgentSettingTemplate', () => {
    const mockTemplate: AgentSettingTemplate = {
      agentType: testAgentType,
      settings: {
        setting1: 'value1',
        setting2: 42,
      },
      metadata: {
        version: '1.0',
      },
    };

    it('should successfully retrieve agent setting template', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTemplate,
      } as Response);

      const result = await service.getAgentSettingTemplate(testAgentType, testAccessToken);

      expect(result).toEqual(mockTemplate);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/settings/templates/${encodeURIComponent(testAgentType)}`),
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: `Bearer ${testAccessToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should throw error when API returns non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      await expect(
        service.getAgentSettingTemplate(testAgentType, testAccessToken)
      ).rejects.toThrow(`Failed to get agent setting template for type '${testAgentType}': 404 Not Found`);
    });

    it('should include authorization header with access token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTemplate,
      } as Response);

      await service.getAgentSettingTemplate(testAgentType, testAccessToken);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${testAccessToken}`,
          }),
        })
      );
    });
  });

  describe('setAgentSettingTemplate', () => {
    const mockTemplate: AgentSettingTemplate = {
      agentType: testAgentType,
      settings: {
        setting1: 'value1',
        setting2: 42,
      },
      metadata: {
        version: '1.0',
      },
    };

    it('should successfully set agent setting template', async () => {
      const updatedTemplate = { ...mockTemplate, metadata: { version: '1.1' } };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => updatedTemplate,
      } as Response);

      const result = await service.setAgentSettingTemplate(mockTemplate, testAccessToken);

      expect(result).toEqual(updatedTemplate);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/settings/templates/${encodeURIComponent(testAgentType)}`),
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${testAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockTemplate),
        })
      );
    });

    it('should throw error when API returns non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      } as Response);

      await expect(
        service.setAgentSettingTemplate(mockTemplate, testAccessToken)
      ).rejects.toThrow(`Failed to set agent setting template for type '${testAgentType}': 400 Bad Request`);
    });

    it('should send template data in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTemplate,
      } as Response);

      await service.setAgentSettingTemplate(mockTemplate, testAccessToken);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(mockTemplate),
        })
      );
    });
  });

  describe('getAgentSettings', () => {
    const mockSettings: AgentSettings = {
      agentInstanceId: testAgentInstanceId,
      agentType: testAgentType,
      settings: {
        instanceSetting1: 'value1',
        instanceSetting2: 100,
      },
      metadata: {
        lastUpdated: '2024-01-01T00:00:00Z',
      },
    };

    it('should successfully retrieve agent settings', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSettings,
      } as Response);

      const result = await service.getAgentSettings(testAgentInstanceId, testAccessToken);

      expect(result).toEqual(mockSettings);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/settings/instances/${encodeURIComponent(testAgentInstanceId)}`),
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: `Bearer ${testAccessToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should throw error when API returns non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response);

      await expect(
        service.getAgentSettings(testAgentInstanceId, testAccessToken)
      ).rejects.toThrow(`Failed to get agent settings for instance '${testAgentInstanceId}': 403 Forbidden`);
    });

    it('should include authorization header with access token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSettings,
      } as Response);

      await service.getAgentSettings(testAgentInstanceId, testAccessToken);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${testAccessToken}`,
          }),
        })
      );
    });
  });

  describe('setAgentSettings', () => {
    const mockSettings: AgentSettings = {
      agentInstanceId: testAgentInstanceId,
      agentType: testAgentType,
      settings: {
        instanceSetting1: 'value1',
        instanceSetting2: 100,
      },
      metadata: {
        lastUpdated: '2024-01-01T00:00:00Z',
      },
    };

    it('should successfully set agent settings', async () => {
      const updatedSettings = { ...mockSettings, settings: { ...mockSettings.settings, newSetting: true } };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => updatedSettings,
      } as Response);

      const result = await service.setAgentSettings(mockSettings, testAccessToken);

      expect(result).toEqual(updatedSettings);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/settings/instances/${encodeURIComponent(testAgentInstanceId)}`),
        expect.objectContaining({
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${testAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(mockSettings),
        })
      );
    });

    it('should throw error when API returns non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(
        service.setAgentSettings(mockSettings, testAccessToken)
      ).rejects.toThrow(
        `Failed to set agent settings for instance '${testAgentInstanceId}': 500 Internal Server Error`
      );
    });

    it('should send settings data in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSettings,
      } as Response);

      await service.setAgentSettings(mockSettings, testAccessToken);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(mockSettings),
        })
      );
    });
  });

  describe('different cluster categories', () => {
    it.each<{ cluster: ClusterCategory; expectedDomain: string }>([
      { cluster: 'prod', expectedDomain: 'api.powerplatform.com' },
      { cluster: 'gov', expectedDomain: 'api.gov.powerplatform.microsoft.us' },
      { cluster: 'high', expectedDomain: 'api.high.powerplatform.microsoft.us' },
    ])('should construct endpoint with correct domain for $cluster cluster', ({ cluster, expectedDomain }) => {
      const discovery = new PowerPlatformApiDiscovery(cluster);
      const testService = new AgentSettingsService(discovery, testTenantId);
      
      const endpoint = testService.getAgentSettingTemplateEndpoint(testAgentType);
      
      expect(endpoint).toContain(expectedDomain);
      expect(endpoint).toContain('/agents/v1.0/settings/templates/');
    });
  });
});
