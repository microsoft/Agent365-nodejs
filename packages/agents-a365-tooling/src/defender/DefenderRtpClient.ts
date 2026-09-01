// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import type { TurnContext } from '@microsoft/agents-hosting';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from '../configuration';
import { Utility } from '../Utility';
import {
  DefenderRtpAgentContext,
  DefenderRtpAgentEvaluationRequest,
  DefenderRtpAiSession,
  DefenderRtpAuthenticationContext,
  DefenderRtpDecision,
  DefenderRtpEvaluationResult,
  DefenderRtpInspectionPoint,
  DefenderRtpToolDefinition,
  DefenderRtpToolEvaluationRequest,
  DefenderRtpToolResponseEvaluationRequest,
} from './contracts';

const FMI_SCOPE = 'api://AzureADTokenExchange/.default';
const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const TOKEN_EXPIRY_BUFFER_MILLISECONDS = 5 * 60 * 1000;
const MAX_TOKEN_CACHE_ENTRIES = 100;
const DEFAULT_PLATFORM_TYPE = 'CUSTOM_BUILT_AGENTS_USING_SDK';

interface ResolvedAgentContext {
  sessionId: string;
  requestId: string;
  agentId: string;
  tenantId: string;
  blueprintId: string;
  agentName: string;
  agentObjectId: string;
  platformAgentId: string;
  platformType: string;
  userId: string;
  modelName: string;
  instructions: string;
}

interface CachedToken {
  key: string;
  token: string;
  expiresAtMilliseconds: number;
}

export interface DefenderRtpClientOptions {
  configProvider?: IConfigurationProvider<ToolingConfiguration>;
  fetchImplementation?: typeof fetch;
  idFactory?: () => string;
  now?: () => number;
}

export class DefenderRtpError extends Error {
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

/**
 * The inspected action was blocked by a Defender verdict or fail-closed policy.
 */
export class DefenderRtpBlockedError extends DefenderRtpError {
  constructor(public readonly evaluation: DefenderRtpEvaluationResult) {
    const subject = evaluation.inspectionPoint.replace('_', ' ');
    const reason = evaluation.decision.reason
      ?? (evaluation.evaluated
        ? 'It was flagged as unsafe.'
        : 'Security validation is unavailable and fail-closed mode is enabled.');
    const diagnostics = evaluation.decision.diagnostics
      ? ` [${evaluation.decision.diagnostics}]`
      : '';
    super(
      `${subject} was blocked by Microsoft Defender for AI. Reason: ${reason}${diagnostics} `
      + `Correlation ID: ${evaluation.correlationId}`,
    );
  }
}

export class DefenderRtpValidationError extends DefenderRtpError {}

/**
 * Opt-in client for the draft Defender third-party prevention webhook.
 *
 * The protocol is provisional and mirrors agent365-skills PR #78.
 */
export class DefenderRtpClient {
  private readonly configProvider: IConfigurationProvider<ToolingConfiguration>;
  private readonly fetchImplementation: typeof fetch;
  private readonly idFactory: () => string;
  private readonly now: () => number;
  private readonly tokenCache = new Map<string, CachedToken>();
  private readonly inFlightTokens = new Map<string, Promise<string>>();

  constructor(options: DefenderRtpClientOptions = {}) {
    this.configProvider = options.configProvider ?? defaultToolingConfigurationProvider;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? Date.now;
  }

  public async evaluateAgentRequest(
    request: DefenderRtpAgentEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    if (!this.configProvider.getConfiguration().isDefenderRtpEnabled) return null;
    this.validateMessages(request);
    const context = this.resolveContext(request, authenticationContext?.turnContext);
    const activity = {
      agentRequest: {
        context: { a365: {} },
        timestamp: this.timestamp(),
        messages: this.buildMessages('MESSAGE_ROLE_USER', request.messages),
        ...(context.requestId ? { requestId: context.requestId } : {}),
      },
    };
    return await this.evaluateActivity(
      context,
      authenticationContext,
      'before_agent',
      activity,
      request.tools,
    );
  }

  public async evaluateAgentResponse(
    request: DefenderRtpAgentEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    if (!this.configProvider.getConfiguration().isDefenderRtpEnabled) return null;
    this.validateMessages(request);
    const context = this.resolveContext(request, authenticationContext?.turnContext);
    const activity = {
      agentResponse: {
        context: { a365: {} },
        timestamp: this.timestamp(),
        messages: this.buildMessages('MESSAGE_ROLE_ASSISTANT', request.messages),
        ...(context.requestId ? { requestId: context.requestId } : {}),
      },
    };
    return await this.evaluateActivity(
      context,
      authenticationContext,
      'after_agent',
      activity,
      request.tools,
    );
  }

  public async evaluateToolRequest(
    request: DefenderRtpToolEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    if (!this.configProvider.getConfiguration().isDefenderRtpEnabled) return null;
    this.validateToolRequest(request);
    const context = this.resolveContext(request, authenticationContext?.turnContext);
    const toolCallId = request.toolCallId
      || `tooluse_${this.idFactory().replace(/-/g, '').slice(0, 12)}`;
    return await this.evaluateToolRequestWithContext(
      request,
      context,
      toolCallId,
      authenticationContext,
    );
  }

  public async evaluateToolResponse(
    request: DefenderRtpToolResponseEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    if (!this.configProvider.getConfiguration().isDefenderRtpEnabled) return null;
    this.validateToolRequest(request);
    const context = this.resolveContext(request, authenticationContext?.turnContext);
    const toolCallId = request.toolCallId
      || `tooluse_${this.idFactory().replace(/-/g, '').slice(0, 12)}`;
    return await this.evaluateToolResponseWithContext(
      request,
      context,
      toolCallId,
      authenticationContext,
    );
  }

  public async enforceAgentRequest(
    request: DefenderRtpAgentEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    const evaluation = await this.evaluateAgentRequest(request, authenticationContext);
    this.throwIfBlocked(evaluation);
    return evaluation;
  }

  public async enforceAgentResponse(
    request: DefenderRtpAgentEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    const evaluation = await this.evaluateAgentResponse(request, authenticationContext);
    this.throwIfBlocked(evaluation);
    return evaluation;
  }

  public async enforceToolRequest(
    request: DefenderRtpToolEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    const evaluation = await this.evaluateToolRequest(request, authenticationContext);
    this.throwIfBlocked(evaluation);
    return evaluation;
  }

  public async enforceToolResponse(
    request: DefenderRtpToolResponseEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    const evaluation = await this.evaluateToolResponse(request, authenticationContext);
    this.throwIfBlocked(evaluation);
    return evaluation;
  }

  /**
   * Applies before_tool and after_tool around a tool callback.
   */
  public async executeTool<T>(
    request: DefenderRtpToolEvaluationRequest,
    authenticationContext: DefenderRtpAuthenticationContext,
    execute: () => T | Promise<T>,
  ): Promise<T> {
    if (typeof execute !== 'function') {
      throw new DefenderRtpValidationError('execute must be a function.');
    }

    const configuration = this.configProvider.getConfiguration();
    if (!configuration.isDefenderRtpEnabled) {
      return await execute();
    }

    this.validateToolRequest(request);
    const context = this.resolveContext(request, authenticationContext?.turnContext);
    const toolCallId = request.toolCallId
      || `tooluse_${this.idFactory().replace(/-/g, '').slice(0, 12)}`;
    const accessToken = await this.tryGetAccessToken(authenticationContext, configuration);

    if (!accessToken) {
      const noToken = this.failure(
        'before_tool',
        context.sessionId,
        configuration,
        'entra token unavailable',
        null,
        0,
      );
      this.throwIfBlocked(noToken);
      return await execute();
    }

    const before = await this.evaluateToolRequestWithToken(
      request,
      context,
      toolCallId,
      accessToken,
      configuration,
    );
    this.throwIfBlocked(before);

    const result = await execute();

    const after = await this.evaluateToolResponseWithToken(
      { ...request, result },
      context,
      toolCallId,
      accessToken,
      configuration,
    );
    this.throwIfBlocked(after);
    return result;
  }

  private async evaluateToolRequestWithContext(
    request: DefenderRtpToolEvaluationRequest,
    context: ResolvedAgentContext,
    toolCallId: string,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    const configuration = this.configProvider.getConfiguration();
    if (!configuration.isDefenderRtpEnabled) return null;
    const token = await this.tryGetAccessToken(authenticationContext, configuration);
    if (!token) {
      return this.failure(
        'before_tool',
        context.sessionId,
        configuration,
        'entra token unavailable',
        null,
        0,
      );
    }
    return await this.evaluateToolRequestWithToken(
      request,
      context,
      toolCallId,
      token,
      configuration,
    );
  }

  private async evaluateToolResponseWithContext(
    request: DefenderRtpToolResponseEvaluationRequest,
    context: ResolvedAgentContext,
    toolCallId: string,
    authenticationContext: DefenderRtpAuthenticationContext,
  ): Promise<DefenderRtpEvaluationResult | null> {
    const configuration = this.configProvider.getConfiguration();
    if (!configuration.isDefenderRtpEnabled) return null;
    const token = await this.tryGetAccessToken(authenticationContext, configuration);
    if (!token) {
      return this.failure(
        'after_tool',
        context.sessionId,
        configuration,
        'entra token unavailable',
        null,
        0,
      );
    }
    return await this.evaluateToolResponseWithToken(
      request,
      context,
      toolCallId,
      token,
      configuration,
    );
  }

  private async evaluateToolRequestWithToken(
    request: DefenderRtpToolEvaluationRequest,
    context: ResolvedAgentContext,
    toolCallId: string,
    accessToken: string,
    configuration: ToolingConfiguration,
  ): Promise<DefenderRtpEvaluationResult> {
    const toolType = request.tool.toolType ?? 'mcp';
    const activity = {
      toolRequest: {
        context: { a365: {} },
        timestamp: this.timestamp(),
        toolName: request.tool.name,
        toolCallId,
        toolType,
        structuredArguments: request.arguments ?? {},
        ...(request.tool.description ? { toolDescription: request.tool.description } : {}),
        ...(context.requestId ? { requestId: context.requestId } : {}),
      },
    };
    const session = this.buildSession(context, activity, [request.tool]);
    return await this.postSession(
      session,
      'before_tool',
      context.sessionId,
      accessToken,
      configuration,
    );
  }

  private async evaluateToolResponseWithToken(
    request: DefenderRtpToolResponseEvaluationRequest,
    context: ResolvedAgentContext,
    toolCallId: string,
    accessToken: string,
    configuration: ToolingConfiguration,
  ): Promise<DefenderRtpEvaluationResult> {
    const normalizedResult = this.normalizeJsonValue(request.result);
    const toolResponse: Record<string, unknown> = {
      context: { a365: {} },
      timestamp: this.timestamp(),
      toolName: request.tool.name,
      toolCallId,
      toolType: request.tool.toolType ?? 'mcp',
      ...(context.requestId ? { requestId: context.requestId } : {}),
    };
    if (this.isJsonObject(normalizedResult) || Array.isArray(normalizedResult)) {
      toolResponse['structuredData'] = this.clampStructure(
        normalizedResult,
        configuration.defenderRtpMaxContentCharacters,
      );
    } else {
      toolResponse['text'] = this.truncate(
        String(normalizedResult ?? ''),
        configuration.defenderRtpMaxContentCharacters,
      );
    }

    const session = this.buildSession(
      context,
      { toolResponse },
      [request.tool],
    );
    return await this.postSession(
      session,
      'after_tool',
      context.sessionId,
      accessToken,
      configuration,
    );
  }

  private async evaluateActivity(
    context: ResolvedAgentContext,
    authenticationContext: DefenderRtpAuthenticationContext,
    inspectionPoint: DefenderRtpInspectionPoint,
    activity: Record<string, unknown>,
    tools?: DefenderRtpToolDefinition[],
  ): Promise<DefenderRtpEvaluationResult | null> {
    const configuration = this.configProvider.getConfiguration();
    if (!configuration.isDefenderRtpEnabled) return null;
    const token = await this.tryGetAccessToken(authenticationContext, configuration);
    if (!token) {
      return this.failure(
        inspectionPoint,
        context.sessionId,
        configuration,
        'entra token unavailable',
        null,
        0,
      );
    }
    const session = this.buildSession(context, activity, tools);
    return await this.postSession(
      session,
      inspectionPoint,
      context.sessionId,
      token,
      configuration,
    );
  }

  private buildSession(
    context: ResolvedAgentContext,
    activity: Record<string, unknown>,
    tools?: DefenderRtpToolDefinition[],
  ): DefenderRtpAiSession {
    const a365: Record<string, string> = {
      id: context.agentId,
      name: context.agentName,
      tenantId: context.tenantId,
    };
    if (context.blueprintId) a365['blueprintId'] = context.blueprintId;

    const identifier: Record<string, unknown> = {
      a365,
      platform: {
        type: context.platformType,
        id: context.platformAgentId,
        name: context.agentName,
      },
    };
    if (context.agentObjectId) {
      identifier['entra'] = {
        tenantId: context.tenantId,
        objectId: context.agentObjectId,
        ...(context.blueprintId ? { blueprintId: context.blueprintId } : {}),
      };
    }

    const identity: Record<string, string> = {
      tenantId: context.tenantId,
      appId: context.agentId,
    };
    if (context.agentObjectId) identity['entraObjectId'] = context.agentObjectId;

    const agent: Record<string, unknown> = { id: identifier, identity };
    if (tools?.length) {
      agent['tools'] = tools.map(tool => ({
        id: tool.toolId ?? tool.name,
        name: tool.name,
        type: tool.toolType ?? 'mcp',
        ...(tool.description ? { description: tool.description } : {}),
      }));
    }
    if (context.modelName) {
      agent['llmConfiguration'] = { modelName: context.modelName };
    }
    if (context.instructions) {
      agent['instructions'] = this.truncate(
        context.instructions,
        this.configProvider.getConfiguration().defenderRtpMaxContentCharacters,
      );
    }

    const callerIdentity: Record<string, string> = {
      tenantId: context.tenantId,
      appId: context.agentId,
      userAgent: `agent365-sdk-agent/${context.platformType.toLowerCase()}`,
    };
    if (context.userId) callerIdentity['appName'] = context.userId;

    return {
      environment: { agent },
      callerIdentity,
      sessionContext: { a365: { id: context.sessionId } },
      activities: [activity],
      evaluationPolicy: {
        type: 'EVALUATION_POLICY_TYPE_BLOCKING',
        threatScenarios: [{ type: 'THREAT_SCENARIO_TYPE_ALL' }],
      },
      timestamp: this.timestamp(),
    };
  }

  private async postSession(
    session: DefenderRtpAiSession,
    inspectionPoint: DefenderRtpInspectionPoint,
    correlationId: string,
    accessToken: string,
    configuration: ToolingConfiguration,
  ): Promise<DefenderRtpEvaluationResult> {
    const started = this.now();
    let body: string;
    try {
      body = JSON.stringify(session);
    } catch (error) {
      return this.failure(
        inspectionPoint,
        correlationId,
        configuration,
        'AISession is not JSON-serializable',
        null,
        this.now() - started,
        error,
      );
    }

    const timeoutSignal = AbortSignal.timeout(configuration.defenderRtpTimeoutMilliseconds);
    let response: Response;
    try {
      response = await this.fetchImplementation(configuration.defenderRtpEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-ms-correlation-id': correlationId,
        },
        body,
        signal: timeoutSignal,
      });
    } catch (error) {
      const errorName = this.isJsonObject(error) && typeof error['name'] === 'string'
        ? error['name']
        : undefined;
      return this.failure(
        inspectionPoint,
        correlationId,
        configuration,
        timeoutSignal.aborted || errorName === 'TimeoutError'
          ? 'request timeout'
          : 'request failed',
        null,
        this.now() - started,
        error,
      );
    }

    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch (error) {
      return this.failure(
        inspectionPoint,
        correlationId,
        configuration,
        'response body could not be read',
        response.status,
        this.now() - started,
        error,
      );
    }

    if (!response.ok) {
      return this.failure(
        inspectionPoint,
        correlationId,
        configuration,
        `http ${response.status}`,
        response.status,
        this.now() - started,
      );
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseBody);
    } catch (error) {
      return this.failure(
        inspectionPoint,
        correlationId,
        configuration,
        'non-JSON response',
        response.status,
        this.now() - started,
        error,
      );
    }

    if (!this.isJsonObject(payload) || typeof payload['blockAction'] !== 'boolean') {
      return this.failure(
        inspectionPoint,
        correlationId,
        configuration,
        'response contained no verdict',
        response.status,
        this.now() - started,
      );
    }

    const decision = this.parseDecision(payload);
    return {
      allowed: !decision.blockAction,
      evaluated: true,
      inspectionPoint,
      correlationId,
      decision,
      httpStatus: response.status,
      error: null,
      latencyMilliseconds: this.now() - started,
    };
  }

  private failure(
    inspectionPoint: DefenderRtpInspectionPoint,
    correlationId: string,
    configuration: ToolingConfiguration,
    error: string,
    httpStatus: number | null,
    latencyMilliseconds: number,
    cause?: unknown,
  ): DefenderRtpEvaluationResult {
    const block = configuration.defenderRtpFailClosed;
    return {
      allowed: !block,
      evaluated: false,
      inspectionPoint,
      correlationId,
      decision: {
        blockAction: block,
        reasonCode: null,
        reason: block
          ? 'Security validation is unavailable and this agent is configured to fail closed.'
          : null,
        diagnostics: null,
      },
      httpStatus,
      error: cause instanceof Error ? `${error}: ${cause.name}` : error,
      latencyMilliseconds,
    };
  }

  private parseDecision(payload: Record<string, unknown>): DefenderRtpDecision {
    const reasonCode = payload['reasonCode'];
    return {
      blockAction: payload['blockAction'] as boolean,
      reasonCode: typeof reasonCode === 'number' && Number.isInteger(reasonCode)
        ? reasonCode
        : null,
      reason: typeof payload['reason'] === 'string' ? payload['reason'] : null,
      diagnostics: typeof payload['diagnostics'] === 'string'
        ? payload['diagnostics']
        : null,
    };
  }

  private async tryGetAccessToken(
    authenticationContext: DefenderRtpAuthenticationContext,
    configuration: ToolingConfiguration,
  ): Promise<string> {
    try {
      const token = await this.getAccessToken(
        authenticationContext,
        configuration.defenderRtpAuthenticationScope,
        configuration.defenderRtpTimeoutMilliseconds,
      );
      Utility.ValidateAuthToken(token);
      return token;
    } catch (error) {
      if (error instanceof DefenderRtpValidationError) throw error;
      return '';
    }
  }

  private async getAccessToken(
    authenticationContext: DefenderRtpAuthenticationContext,
    scope: string,
    timeoutMilliseconds: number,
  ): Promise<string> {
    if (!authenticationContext || typeof authenticationContext !== 'object') {
      throw new DefenderRtpValidationError('authenticationContext is required.');
    }
    if ('accessToken' in authenticationContext) {
      return authenticationContext.accessToken;
    }
    if ('getAccessToken' in authenticationContext) {
      const tokenScope = authenticationContext.tokenScope || scope;
      this.validateRequiredString(tokenScope, 'authenticationContext.tokenScope');
      return await authenticationContext.getAccessToken(tokenScope);
    }
    if ('clientId' in authenticationContext) {
      this.validateRequiredString(
        authenticationContext.tenantId,
        'authenticationContext.tenantId',
      );
      this.validateRequiredString(
        authenticationContext.clientId,
        'authenticationContext.clientId',
      );
      this.validateRequiredString(
        authenticationContext.clientSecret,
        'authenticationContext.clientSecret',
      );
      const tokenScope = authenticationContext.tokenScope
        || scope
        || `api://${authenticationContext.clientId}/.default`;
      const key =
        `client:${authenticationContext.tenantId}:${authenticationContext.clientId}:${tokenScope}`;
      return await this.getOrAcquireCachedToken(
        key,
        () => this.postTokenRequest(
          `https://login.microsoftonline.com/${encodeURIComponent(authenticationContext.tenantId)}`
            + '/oauth2/v2.0/token',
          new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: authenticationContext.clientId,
            client_secret: authenticationContext.clientSecret,
            scope: tokenScope,
          }),
          timeoutMilliseconds,
        ),
      );
    }

    this.validateRequiredString(authenticationContext.tenantId, 'authenticationContext.tenantId');
    this.validateRequiredString(authenticationContext.agentId, 'authenticationContext.agentId');
    this.validateRequiredString(
      authenticationContext.blueprintClientId,
      'authenticationContext.blueprintClientId',
    );
    this.validateRequiredString(
      authenticationContext.blueprintClientSecret,
      'authenticationContext.blueprintClientSecret',
    );

    const tokenScope = authenticationContext.tokenScope ?? scope;
    this.validateRequiredString(tokenScope, 'authenticationContext.tokenScope');
    const key =
      `fmi:${authenticationContext.tenantId}:${authenticationContext.agentId}:${tokenScope}`;
    return await this.getOrAcquireCachedToken(
      key,
      () => this.acquireFmiToken(
        authenticationContext,
        tokenScope,
        timeoutMilliseconds,
      ),
    );
  }

  private async getOrAcquireCachedToken(
    key: string,
    acquire: () => Promise<string>,
  ): Promise<string> {
    const cached = this.tokenCache.get(key);
    if (cached
      && this.now() < cached.expiresAtMilliseconds - TOKEN_EXPIRY_BUFFER_MILLISECONDS) {
      this.tokenCache.delete(key);
      this.tokenCache.set(key, cached);
      return cached.token;
    }
    if (cached) this.tokenCache.delete(key);

    const inFlight = this.inFlightTokens.get(key);
    if (inFlight) {
      return await inFlight;
    }

    const promise = acquire();
    this.inFlightTokens.set(key, promise);
    try {
      const token = await promise;
      while (this.tokenCache.size >= MAX_TOKEN_CACHE_ENTRIES) {
        const oldestKey = this.tokenCache.keys().next().value as string | undefined;
        if (oldestKey === undefined) break;
        this.tokenCache.delete(oldestKey);
      }
      this.tokenCache.set(key, {
        key,
        token,
        expiresAtMilliseconds: this.getTokenExpirationMilliseconds(token),
      });
      return token;
    } finally {
      if (this.inFlightTokens.get(key) === promise) {
        this.inFlightTokens.delete(key);
      }
    }
  }

  private async acquireFmiToken(
    authenticationContext: {
      tenantId: string;
      agentId: string;
      blueprintClientId: string;
      blueprintClientSecret: string;
    },
    scope: string,
    timeoutMilliseconds: number,
  ): Promise<string> {
    const tokenEndpoint =
      `https://login.microsoftonline.com/${encodeURIComponent(authenticationContext.tenantId)}`
      + '/oauth2/v2.0/token';
    const assertion = await this.postTokenRequest(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: authenticationContext.blueprintClientId,
        client_secret: authenticationContext.blueprintClientSecret,
        scope: FMI_SCOPE,
        fmi_path: authenticationContext.agentId,
      }),
      timeoutMilliseconds,
    );
    return await this.postTokenRequest(
      tokenEndpoint,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: authenticationContext.agentId,
        client_assertion_type: CLIENT_ASSERTION_TYPE,
        client_assertion: assertion,
        scope,
      }),
      timeoutMilliseconds,
    );
  }

  private async postTokenRequest(
    tokenEndpoint: string,
    body: URLSearchParams,
    timeoutMilliseconds: number,
  ): Promise<string> {
    const response = await this.fetchImplementation(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
    if (!response.ok) {
      throw new Error(`Token request failed with HTTP ${response.status}.`);
    }
    const payload: unknown = await response.json();
    if (!this.isJsonObject(payload) || typeof payload['access_token'] !== 'string') {
      throw new Error('Token response did not include access_token.');
    }
    return payload['access_token'];
  }

  private getTokenExpirationMilliseconds(token: string): number {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Token is not a JWT.');
    }
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );
    if (!this.isJsonObject(payload) || typeof payload['exp'] !== 'number') {
      throw new Error('Token does not contain exp.');
    }
    return payload['exp'] * 1000;
  }

  private resolveContext(
    request: DefenderRtpAgentContext,
    turnContext?: TurnContext,
  ): ResolvedAgentContext {
    if (!request || typeof request !== 'object') {
      throw new DefenderRtpValidationError('request is required.');
    }
    const activity = turnContext?.activity;
    const agentId = request.agentId
      ?? activity?.getAgenticInstanceId?.()
      ?? activity?.recipient?.agenticAppId
      ?? '';
    const tenantId = request.tenantId
      ?? activity?.getAgenticTenantId?.()
      ?? activity?.recipient?.tenantId
      ?? activity?.conversation?.tenantId
      ?? '';
    const sessionId = request.sessionId
      ?? activity?.conversation?.id
      ?? `a365-${this.idFactory()}`;
    const userId = request.userId
      ?? activity?.from?.aadObjectId
      ?? activity?.from?.id
      ?? '';

    this.validateRequiredString(agentId, 'agentId');
    this.validateRequiredString(tenantId, 'tenantId');
    this.validateRequiredString(sessionId, 'sessionId');

    return {
      sessionId,
      requestId: request.requestId ?? activity?.id ?? '',
      agentId,
      tenantId,
      blueprintId: request.blueprintId ?? '',
      agentName: request.agentName ?? activity?.recipient?.name ?? 'agent365-agent',
      agentObjectId: request.agentObjectId ?? '',
      platformAgentId: request.platformAgentId ?? agentId,
      platformType: request.platformType ?? DEFAULT_PLATFORM_TYPE,
      userId,
      modelName: request.modelName ?? '',
      instructions: request.instructions ?? '',
    };
  }

  private validateMessages(request: DefenderRtpAgentEvaluationRequest): void {
    if (!request || !Array.isArray(request.messages)
      || request.messages.every(message => typeof message !== 'string' || !message)) {
      throw new DefenderRtpValidationError('messages must contain at least one non-empty string.');
    }
  }

  private validateToolRequest(request: DefenderRtpToolEvaluationRequest): void {
    if (!request?.tool || typeof request.tool !== 'object') {
      throw new DefenderRtpValidationError('tool is required.');
    }
    this.validateRequiredString(request.tool.name, 'tool.name');
    if (request.arguments !== undefined && !this.isJsonObject(request.arguments)) {
      throw new DefenderRtpValidationError('arguments must be a JSON object when supplied.');
    }
  }

  private buildMessages(role: string, messages: string[]): Array<Record<string, unknown>> {
    const maxCharacters = this.configProvider
      .getConfiguration()
      .defenderRtpMaxContentCharacters;
    const content = messages
      .filter(message => typeof message === 'string' && message.length > 0)
      .map(message => ({ text: this.truncate(message, maxCharacters) }));
    return content.length ? [{ role, content }] : [];
  }

  private normalizeJsonValue(value: unknown): unknown {
    if (value === undefined) return null;
    try {
      const serialized = JSON.stringify(value);
      return serialized === undefined ? String(value) : JSON.parse(serialized);
    } catch {
      return String(value);
    }
  }

  private clampStructure(value: unknown, maxCharacters: number): unknown {
    if (typeof value === 'string') return this.truncate(value, maxCharacters);
    if (Array.isArray(value)) {
      return value.map(item => this.clampStructure(item, maxCharacters));
    }
    if (this.isJsonObject(value)) {
      return Object.fromEntries(
        Object.entries(value)
          .map(([key, item]) => [key, this.clampStructure(item, maxCharacters)]),
      );
    }
    return value;
  }

  private truncate(value: string, maxCharacters: number): string {
    if (maxCharacters <= 0 || value.length <= maxCharacters) return value;
    const remaining = value.length - maxCharacters;
    return `${value.slice(0, maxCharacters)}...[truncated ${remaining} chars]`;
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  private throwIfBlocked(evaluation: DefenderRtpEvaluationResult | null): void {
    if (evaluation && !evaluation.allowed) {
      throw new DefenderRtpBlockedError(evaluation);
    }
  }

  private validateRequiredString(value: unknown, fieldName: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new DefenderRtpValidationError(`${fieldName} is required.`);
    }
  }

  private isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
