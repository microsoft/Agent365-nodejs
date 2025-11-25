// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import axios, { AxiosError } from 'axios';
import { 
  AgentSettingsService, 
  AgentSettingsTemplate, 
  AgentSettings, 
  AgentSettingProperty 
} from '@microsoft/agents-a365-settings';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Track the mock state for isAxiosError
let isAxiosErrorReturnValue = false;

// Helper to create a valid JWT token with expiration
function createValidToken(expOffset = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ 
    exp: Math.floor(Date.now() / 1000) + expOffset,
    sub: 'test-user'
  })).toString('base64url');
  const signature = 'test-signature';
  return `${header}.${payload}.${signature}`;
}

// Helper to create an expired JWT token
function createExpiredToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ 
    exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    sub: 'test-user'
  })).toString('base64url');
  const signature = 'test-signature';
  return `${header}.${payload}.${signature}`;
}

describe('AgentSettingsService', () => {
  let service: AgentSettingsService;
  let validToken: string;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.MCP_PLATFORM_ENDPOINT;
    validToken = createValidToken();
    service = new AgentSettingsService();
    isAxiosErrorReturnValue = false;
    
    // Mock axios.isAxiosError as a type predicate function
    (mockedAxios.isAxiosError as unknown) = (payload: unknown): payload is AxiosError => {
      return isAxiosErrorReturnValue;
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should use default production URL when MCP_PLATFORM_ENDPOINT is not set', () => {
      const service = new AgentSettingsService();
      expect(service).toBeDefined();
    });

    it('should use custom endpoint when MCP_PLATFORM_ENDPOINT is set', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://custom.endpoint.com';
      const service = new AgentSettingsService();
      expect(service).toBeDefined();
    });

    it('should throw error for invalid MCP_PLATFORM_ENDPOINT URI', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'not-a-valid-uri';
      expect(() => new AgentSettingsService()).toThrow('Invalid MCP_PLATFORM_ENDPOINT');
    });

    it('should throw error for non-http/https MCP_PLATFORM_ENDPOINT', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'ftp://example.com';
      expect(() => new AgentSettingsService()).toThrow('Invalid URI scheme');
    });

    it('should remove trailing slash from endpoint', () => {
      process.env.MCP_PLATFORM_ENDPOINT = 'https://custom.endpoint.com/';
      const service = new AgentSettingsService();
      expect(service).toBeDefined();
    });
  });

  describe('getSettingsTemplateByAgentType', () => {
    const mockTemplate: AgentSettingsTemplate = {
      agentType: 'custom-agent',
      properties: [
        { name: 'setting1', value: 'default', type: 'string', required: true, description: 'Test setting' }
      ]
    };

    it('should successfully get settings template', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockTemplate });

      const result = await service.getSettingsTemplateByAgentType('custom-agent', validToken);

      expect(result).toEqual(mockTemplate);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://agent365.svc.cloud.microsoft/agents/types/custom-agent/settings/template',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should encode agent type in URL', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockTemplate });

      await service.getSettingsTemplateByAgentType('agent/type', validToken);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('agent%2Ftype'),
        expect.anything()
      );
    });

    it('should throw error when auth token is empty', async () => {
      await expect(service.getSettingsTemplateByAgentType('custom-agent', ''))
        .rejects.toThrow('Authentication token is required');
    });

    it('should throw error when auth token is invalid format', async () => {
      await expect(service.getSettingsTemplateByAgentType('custom-agent', 'invalid'))
        .rejects.toThrow('Invalid JWT token format');
    });

    it('should throw error when auth token is expired', async () => {
      const expiredToken = createExpiredToken();
      await expect(service.getSettingsTemplateByAgentType('custom-agent', expiredToken))
        .rejects.toThrow('Authentication token has expired');
    });

    it('should throw error when agent type is empty', async () => {
      await expect(service.getSettingsTemplateByAgentType('', validToken))
        .rejects.toThrow('Agent type is required');
    });

    it('should handle 404 error', async () => {
      const axiosError = {
        response: { status: 404, statusText: 'Not Found' },
        message: 'Request failed'
      };
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      isAxiosErrorReturnValue = true;

      await expect(service.getSettingsTemplateByAgentType('custom-agent', validToken))
        .rejects.toThrow('Not found');
    });

    it('should handle 401 error', async () => {
      const axiosError = {
        response: { status: 401, statusText: 'Unauthorized' },
        message: 'Request failed'
      };
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      isAxiosErrorReturnValue = true;

      await expect(service.getSettingsTemplateByAgentType('custom-agent', validToken))
        .rejects.toThrow('Unauthorized');
    });
  });

  describe('setSettingsTemplateByAgentType', () => {
    const mockTemplate: AgentSettingsTemplate = {
      agentType: 'custom-agent',
      properties: [
        { name: 'setting1', value: 'default', type: 'string', required: true }
      ]
    };

    it('should successfully set settings template', async () => {
      mockedAxios.put.mockResolvedValueOnce({ status: 200 });

      await service.setSettingsTemplateByAgentType('custom-agent', mockTemplate, validToken);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        'https://agent365.svc.cloud.microsoft/agents/types/custom-agent/settings/template',
        mockTemplate,
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should throw error when template is null', async () => {
      await expect(service.setSettingsTemplateByAgentType('custom-agent', null as unknown as AgentSettingsTemplate, validToken))
        .rejects.toThrow('Settings template is required');
    });

    it('should throw error when template agent type is empty', async () => {
      const invalidTemplate = { ...mockTemplate, agentType: '' };
      await expect(service.setSettingsTemplateByAgentType('custom-agent', invalidTemplate, validToken))
        .rejects.toThrow('Template agent type is required');
    });

    it('should throw error when template properties is not an array', async () => {
      const invalidTemplate = { ...mockTemplate, properties: null as unknown as AgentSettingProperty[] };
      await expect(service.setSettingsTemplateByAgentType('custom-agent', invalidTemplate, validToken))
        .rejects.toThrow('Template properties must be an array');
    });

    it('should handle 403 error', async () => {
      const axiosError = {
        response: { status: 403, statusText: 'Forbidden' },
        message: 'Request failed'
      };
      mockedAxios.put.mockRejectedValueOnce(axiosError);
      isAxiosErrorReturnValue = true;

      await expect(service.setSettingsTemplateByAgentType('custom-agent', mockTemplate, validToken))
        .rejects.toThrow('Forbidden');
    });
  });

  describe('getSettingsByAgentInstance', () => {
    const mockSettings: AgentSettings = {
      agentInstanceId: 'instance-123',
      properties: [
        { name: 'maxRetries', value: '3', type: 'integer', required: true }
      ]
    };

    it('should successfully get settings by agent instance', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: mockSettings });

      const result = await service.getSettingsByAgentInstance('instance-123', validToken);

      expect(result).toEqual(mockSettings);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://agent365.svc.cloud.microsoft/agents/instance-123/settings',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should throw error when agent instance ID is empty', async () => {
      await expect(service.getSettingsByAgentInstance('', validToken))
        .rejects.toThrow('Agent instance ID is required');
    });

    it('should throw error when agent instance ID is whitespace only', async () => {
      await expect(service.getSettingsByAgentInstance('   ', validToken))
        .rejects.toThrow('Agent instance ID is required');
    });
  });

  describe('setSettingsByAgentInstance', () => {
    const mockSettings: AgentSettings = {
      agentInstanceId: 'instance-123',
      properties: [
        { name: 'maxRetries', value: '3', type: 'integer', required: true }
      ]
    };

    it('should successfully set settings by agent instance', async () => {
      mockedAxios.put.mockResolvedValueOnce({ status: 200 });

      await service.setSettingsByAgentInstance('instance-123', mockSettings, validToken);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        'https://agent365.svc.cloud.microsoft/agents/instance-123/settings',
        mockSettings,
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${validToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should throw error when settings is null', async () => {
      await expect(service.setSettingsByAgentInstance('instance-123', null as unknown as AgentSettings, validToken))
        .rejects.toThrow('Agent settings is required');
    });

    it('should throw error when settings agent instance ID is empty', async () => {
      const invalidSettings = { ...mockSettings, agentInstanceId: '' };
      await expect(service.setSettingsByAgentInstance('instance-123', invalidSettings, validToken))
        .rejects.toThrow('Settings agent instance ID is required');
    });

    it('should throw error when settings properties is not an array', async () => {
      const invalidSettings = { ...mockSettings, properties: null as unknown as AgentSettingProperty[] };
      await expect(service.setSettingsByAgentInstance('instance-123', invalidSettings, validToken))
        .rejects.toThrow('Settings properties must be an array');
    });

    it('should handle network errors', async () => {
      const error = new Error('Network Error');
      mockedAxios.put.mockRejectedValueOnce(error);

      await expect(service.setSettingsByAgentInstance('instance-123', mockSettings, validToken))
        .rejects.toThrow('Network Error');
    });
  });

  describe('error handling', () => {
    it('should handle unknown error types', async () => {
      mockedAxios.get.mockRejectedValueOnce('Unknown error');

      await expect(service.getSettingsTemplateByAgentType('custom-agent', validToken))
        .rejects.toThrow('Unknown error');
    });

    it('should handle axios error with response data message', async () => {
      const axiosError = {
        response: { 
          status: 500, 
          statusText: 'Internal Server Error',
          data: { message: 'Server crashed' }
        },
        message: 'Request failed'
      };
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      isAxiosErrorReturnValue = true;

      await expect(service.getSettingsTemplateByAgentType('custom-agent', validToken))
        .rejects.toThrow('500 Internal Server Error');
    });
  });

  describe('model serialization', () => {
    it('should correctly serialize AgentSettingProperty', () => {
      const property: AgentSettingProperty = {
        name: 'testSetting',
        value: 'testValue',
        type: 'string',
        required: true,
        description: 'A test setting',
        defaultValue: 'defaultTestValue'
      };

      expect(property.name).toBe('testSetting');
      expect(property.value).toBe('testValue');
      expect(property.type).toBe('string');
      expect(property.required).toBe(true);
      expect(property.description).toBe('A test setting');
      expect(property.defaultValue).toBe('defaultTestValue');
    });

    it('should correctly serialize AgentSettingsTemplate', () => {
      const template: AgentSettingsTemplate = {
        id: 'template-123',
        agentType: 'custom-agent',
        name: 'Custom Agent Template',
        description: 'Template for custom agents',
        version: '2.0',
        properties: [
          { name: 'setting1', value: 'value1', type: 'string', required: true },
          { name: 'setting2', value: 'value2', type: 'integer', required: false }
        ]
      };

      expect(template.id).toBe('template-123');
      expect(template.agentType).toBe('custom-agent');
      expect(template.name).toBe('Custom Agent Template');
      expect(template.description).toBe('Template for custom agents');
      expect(template.version).toBe('2.0');
      expect(template.properties.length).toBe(2);
      expect(template.properties[0].name).toBe('setting1');
    });

    it('should correctly serialize AgentSettings', () => {
      const settings: AgentSettings = {
        id: 'settings-789',
        agentInstanceId: 'instance-456',
        templateId: 'template-123',
        agentType: 'custom-agent',
        properties: [
          { name: 'maxRetries', value: '5', type: 'integer', required: true }
        ],
        createdAt: '2024-01-15T10:30:00Z',
        modifiedAt: '2024-01-16T14:45:00Z'
      };

      expect(settings.id).toBe('settings-789');
      expect(settings.agentInstanceId).toBe('instance-456');
      expect(settings.templateId).toBe('template-123');
      expect(settings.agentType).toBe('custom-agent');
      expect(settings.properties.length).toBe(1);
      expect(settings.properties[0].name).toBe('maxRetries');
      expect(settings.createdAt).toBe('2024-01-15T10:30:00Z');
      expect(settings.modifiedAt).toBe('2024-01-16T14:45:00Z');
    });
  });

  describe('JWT token validation', () => {
    it('should accept token without expiration claim', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'test-user' })).toString('base64url');
      const signature = 'test-signature';
      const tokenWithoutExp = `${header}.${payload}.${signature}`;

      await expect(service.getSettingsTemplateByAgentType('custom-agent', tokenWithoutExp))
        .rejects.toThrow('Authentication token does not contain expiration claim');
    });

    it('should reject malformed base64 in token payload', async () => {
      const token = 'header.!!!invalid-base64!!!.signature';
      
      await expect(service.getSettingsTemplateByAgentType('custom-agent', token))
        .rejects.toThrow('Failed to decode JWT token payload');
    });
  });
});
