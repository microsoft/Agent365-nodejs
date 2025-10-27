import { Semaphore } from './semaphore';
import {
  ManagedIdentityCredential,
  TokenCredential,
  AccessToken,
} from '@azure/identity';
import { AuthConfiguration } from '@microsoft/agents-hosting';

// JWT payload interface for token parsing
interface JwtPayload {
  exp?: number;
  iat?: number;
  [key: string]: any;
}

// OAuth token response interface
interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
}

export interface AgentConfiguration extends AuthConfiguration {
  agentApplicationId: string;
  agentClientSecret: string;
  agentId: string;
  userPrincipalName: string;
  agenticUserId: string;
}

export const getUserManagedIdentityToken = async (): Promise<string> => {
  const credential: TokenCredential = new ManagedIdentityCredential();
  const token: AccessToken | null = await credential.getToken(
    'api://AzureADTokenExchange'
  );

  if (!token) {
    throw new Error('Failed to acquire access token.');
  }

  return token.token;
};

/**
 * Helper function to create AgentConfiguration from AuthConfiguration
 */
function createAgentConfig(authConfig: AuthConfiguration) {
  const agentConfig: AgentConfiguration = {
    ...authConfig,
    agentApplicationId: process.env.AGENT_APPLICATION_ID || '',
    agentClientSecret: process.env.AGENT_CLIENT_SECRET || '',
    agentId: process.env.AGENT_ID || '',
    userPrincipalName: process.env.USER_PRINCIPAL_NAME || '',
    agenticUserId: process.env.AGENTIC_USER_ID || ''
  };

  return agentConfig;
}

export class AgenticAuthProvider {
  private readonly logger = console;
  private readonly refreshBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly semaphore = new Semaphore(1);

  private cachedToken: AccessToken | null = null;
  private skipAgentIdAuth: boolean;

  constructor(skipAgentIdAuth: boolean = false) {
    this.skipAgentIdAuth = skipAgentIdAuth;
  }

  // AuthProvider interface implementation
  async getAccessToken(authConfig: AuthConfiguration, scope: string): Promise<string> {
    const agentConfig = createAgentConfig(authConfig);

    if (!agentConfig.agentApplicationId && process.env.NODE_ENV === 'development') {
      return '';
    }
    let token = '';
    if (agentConfig.agentClientSecret) {
      token = await this.aquireAccessToken(agentConfig, scope);
    }

    return token;
  }

  /**
   * Gets access token with caching and thread-safe refresh
   */
  async aquireAccessToken(agentConfig: AgentConfiguration, scope: string): Promise<string> {
    try {
      // Check if we have a valid cached token
      if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
        this.logger.log(`✅ Using cached token for agent ${agentConfig.agentId}`);
        return this.cachedToken.token;
      }

      // Use semaphore to ensure only one token refresh at a time
      await this.semaphore.acquire();

      try {
        // verify token is still invalid after acquiring semaphore
        if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
          return this.cachedToken.token;
        }

        this.logger.log(`🔄 Refreshing token for agent ${agentConfig.agentId}`);

        const accessToken = await this.getAgentUserToken(agentConfig, scope);

        if (!accessToken) {
          throw new Error('Failed to get token from AgentTokenHelper');
        }

        // Parse JWT to get actual expiry time
        const expiresOnTimestamp = this.parseJwtExpiry(accessToken) || (Date.now() + (60 * 60 * 1000));
        const tokenWithExpiry: AccessToken = {
          token: accessToken,
          expiresOnTimestamp
        };

        // Cache the token
        this.cachedToken = tokenWithExpiry;

        this.logger.log(`✅ Token refreshed successfully for agent ${agentConfig.agentId}, expires: ${new Date(expiresOnTimestamp).toISOString()}`);
        return tokenWithExpiry.token;

      } finally {
        this.semaphore.release();
      }

    } catch (error) {
      this.logger.error(`❌ Error getting token for agent ${agentConfig.agentId}:`, error);
      throw error;
    }
  }

  /**
   * Check if the token is still valid (with refresh buffer)
   */
  private isTokenValid(token: AccessToken): boolean {
    if (!token || !token.expiresOnTimestamp) {
      return false;
    }

    const now = Date.now();
    const expiresWithBuffer = token.expiresOnTimestamp - this.refreshBuffer;

    return now < expiresWithBuffer;
  }

  /**
   * Clear the cached token (force refresh on next request)
   */
  clearCache(agentConfig: AgentConfiguration): void {
    this.cachedToken = null;
    this.logger.log(`🗑️ Cleared token cache for agent ${agentConfig.agentId}`);
  }

  /**
   * Parse JWT token to extract expiry timestamp
   */
  private parseJwtExpiry(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      const payload = JSON.parse(atob(parts[1])) as JwtPayload;
      if (payload.exp) {
        return payload.exp * 1000; // Convert to milliseconds
      }
      return null;
    } catch (error) {
      this.logger.warn('Failed to parse JWT expiry:', error);
      return null;
    }
  }

  /**
   * Get certificate authentication fallback (similar to .NET version)
   */
  async getCertificateAuthToken(scope: string): Promise<string> {
    try {
      this.logger.log('Using certificate authentication fallback');

      // For now, fall back to managed identity
      const credential = new ManagedIdentityCredential();
      const token = await credential.getToken(scope);

      if (!token) {
        throw new Error('Failed to acquire certificate auth token');
      }

      return token.token;
    } catch (error) {
      this.logger.error('Certificate authentication failed:', error);
      throw error;
    }
  }

  private authUrl(agentConfig: AgentConfiguration): string {
    const tenantId = agentConfig.tenantId;
    if (!tenantId) {
      throw new Error('TENANT_ID is required in agent configuration');
    }
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  }

  async getManagedIdentityToken(): Promise<string> {
    try {
      // For local development, use environment variable. For production, use managed identity.
      const token = process.env.MANAGED_IDENTITY_TOKEN || await getUserManagedIdentityToken();
      if (!token) {
        throw new Error('Unable to acquire managed identity token. Set MANAGED_IDENTITY_TOKEN environment variable for local development.');
      }
      return token;
    } catch (error) {
      this.logger.error('Error getting managed identity token:', error);
      throw error;
    }
  }

  /**
   * STEP 1: Get Agent Application Token
   * CRITICAL: This is the first step in the 3-step auth flow - DO NOT MODIFY
   */
  async getAgentApplicationToken(agentConfig: AgentConfiguration): Promise<string> {
    try {
      // Prepare form-encoded body
      const params = new URLSearchParams();
      params.append('client_id', agentConfig.agentApplicationId);
      params.append('grant_type', 'client_credentials');
      params.append('scope', 'api://AzureADTokenExchange/.default');
      params.append(
        'client_assertion_type',
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
      );

      // Use client secret if available, otherwise use managed identity token
      if (agentConfig.agentClientSecret) {
        params.append('client_secret', agentConfig.agentClientSecret);
      } else {
        const userIdentityToken = await this.getManagedIdentityToken();
        params.append('client_assertion', userIdentityToken);
      }

      params.append('fmi_path', agentConfig.agentId);

      this.logger.log('🔐 Step 1: Getting Agent Application Token...');

      const response = await fetch(this.authUrl(agentConfig), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token request failed: ${response.status} ${response.statusText}: ${errorText}`
        );
      }

      const tokenResponse = await response.json() as TokenResponse;

      if (!tokenResponse.access_token) {
        throw new Error('No access token in response');
      }

      this.logger.log('✅ Step 1: Agent Application Token acquired successfully');
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error('❌ Step 1: Failed to get Agent Application Token:', error);
      throw error;
    }
  }

  /**
   * STEP 2: Get Agent Identity Token
   * CRITICAL: This is the second step in the 3-step auth flow - DO NOT MODIFY
   */
  async getAgentIdentityToken(agentConfig: AgentConfiguration): Promise<string> {
    try {
      // First get the agent application token
      const agentApplicationToken = await this.getAgentApplicationToken(agentConfig);

      // Prepare form-encoded body
      const params = new URLSearchParams();
      params.append('client_id', agentConfig.agentId);
      params.append('scope', 'api://AzureADTokenExchange/.default');
      params.append('grant_type', 'client_credentials');
      params.append(
        'client_assertion_type',
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
      );
      params.append('client_assertion', agentApplicationToken);

      this.logger.log('🔐 Step 2: Getting Agent Identity Token...');

      const response = await fetch(this.authUrl(agentConfig), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Agent Identity Token request failed: ${response.status} ${response.statusText}: ${errorText}`
        );
      }

      const tokenResponse = await response.json() as TokenResponse;

      if (!tokenResponse.access_token) {
        throw new Error('No access token in Agent Identity Token response');
      }

      this.logger.log('✅ Step 2: Agent Identity Token acquired successfully');
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error('❌ Step 2: Failed to get Agent Identity Token:', error);
      throw error;
    }
  }

  /**
   * STEP 3: Get Agent User Token (Final Step)
   * CRITICAL: This is the final step in the 3-step auth flow with fallbacks - DO NOT MODIFY
   */
  async getAgentUserToken(agentConfig: AgentConfiguration, scope: string = 'https://canary.graph.microsoft.com/.default'): Promise<string> {
    try {
      // Check if we should skip agentic auth and use fallback
      if (this.skipAgentIdAuth) {
        this.logger.log('Skipping agentic auth, using certificate fallback');
        return await this.getCertificateAuthToken(scope);
      }

      // Get tokens from previous steps
      const agentApplicationToken = await this.getAgentApplicationToken(agentConfig);
      const agentIdentityToken = await this.getAgentIdentityToken(agentConfig);

      // Prepare form-encoded body
      const params = new URLSearchParams();
      params.append('client_id', agentConfig.agentId);
      params.append('scope', scope);
      params.append('grant_type', 'user_fic');
      params.append(
        'client_assertion_type',
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
      );
      params.append('client_assertion', agentApplicationToken);
      params.append('user_federated_identity_credential', agentIdentityToken);
      params.append('username', agentConfig.userPrincipalName);

      // Only add audience for specific scopes
      if (scope.includes('apihub')) {
        params.append('audience', 'https://apihub.azure.com');
      }

      this.logger.log('🔐 Step 3: Getting Agent User Token...');

      const response = await fetch(this.authUrl(agentConfig), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.warn(`⚠️ Agentic auth failed, trying certificate fallback: (${response.status}) ${errorText}`);

        // Fall back to certificate authentication
        return await this.getCertificateAuthToken(scope);
      }

      const tokenResponse = await response.json() as TokenResponse;

      if (!tokenResponse.access_token) {
        throw new Error('No access token in Agent User Token response');
      }

      this.logger.log('✅ Step 3: Agent User Token acquired successfully');
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error('❌ Step 3: Failed to get Agent User Token:', error);

      // Final fallback to certificate auth
      try {
        this.logger.log('🔄 Attempting final certificate auth fallback');
        return await this.getCertificateAuthToken(scope);
      } catch (fallbackError) {
        this.logger.error('❌ All authentication methods failed:', fallbackError);
        throw error;
      }
    }
  }

  /**
   * STEP 4: Get Power Platform Token
   * CRITICAL: Power Platform integration token - uses same pattern as Step 3
   */
  async getPowerPlatformToken(agentConfig: AgentConfiguration): Promise<string> {
    try {
      // Get tokens from previous steps (same as Step 3, but for Power Platform)
      const agentApplicationToken = await this.getAgentApplicationToken(agentConfig);
      const agentIdentityToken = await this.getAgentIdentityToken(agentConfig);

      // Prepare form-encoded body using the same pattern as Step 3 but with Power Platform scope
      const params = new URLSearchParams();
      params.append('client_id', agentConfig.agentId);
      params.append('scope', 'https://api.preprod.powerplatform.com/.default');
      params.append('grant_type', 'user_fic');
      params.append(
        'client_assertion_type',
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
      );
      params.append('client_assertion', agentApplicationToken);
      params.append('user_federated_identity_credential', agentIdentityToken);
      params.append('username', agentConfig.userPrincipalName);

      this.logger.log('🔐 Step 4: Getting Power Platform Token...');

      const response = await fetch(this.authUrl(agentConfig), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Power Platform Token request failed: ${response.status} ${response.statusText}: ${errorText}`
        );
      }

      const tokenResponse = await response.json() as TokenResponse;

      if (!tokenResponse.access_token) {
        throw new Error('No access token in Power Platform Token response');
      }

      this.logger.log('✅ Step 4: Power Platform Token acquired successfully');
      return tokenResponse.access_token;
    } catch (error) {
      this.logger.error('❌ Step 4: Failed to get Power Platform Token:', error);
      throw error;
    }
  }
}