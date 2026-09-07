// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { AgenticAuthenticationService, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import type { TurnContext } from '@microsoft/agents-hosting';
import { ToolingConfiguration, defaultToolingConfigurationProvider } from '../configuration';
import { Utility } from '../Utility';
import {
  PurviewDlpActivity,
  PurviewDlpAgentContext,
  PurviewDlpAuthenticationContext,
  PurviewDlpDecision,
  PurviewDlpEvaluationRequest,
  PurviewDlpEvaluationResult,
} from './contracts';

const FMI_SCOPE = 'api://AzureADTokenExchange/.default';
const CLIENT_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const TOKEN_EXPIRY_BUFFER_MILLISECONDS = 5 * 60 * 1000;
const MAX_TOKEN_CACHE_ENTRIES = 100;
const DEFAULT_AGENT_NAME = 'agent365-agent';

// Distinctive marker printed by the LOCAL tarball build so it is obvious at runtime that the
// locally packed @microsoft/agents-a365-tooling is in use (the published package does not emit it).
const LOCAL_BUILD_MARKER = '[a365-tooling:LOCAL-TARBALL-BUILD]';

interface ResolvedAgentContext {
  agentId: string;
  tenantId: string;
  blueprintId: string;
  applicationId: string;
  agentName: string;
  sessionId: string;
  requestId: string;
  sponsorUserId: string;
}

interface ResolvedToken {
  token: string;
  path: string;
}

interface CachedToken {
  key: string;
  token: string;
  expiresAtMilliseconds: number;
}

export interface PurviewDlpClientOptions {
  configProvider?: IConfigurationProvider<ToolingConfiguration>;
  fetchImplementation?: typeof fetch;
  idFactory?: () => string;
  now?: () => number;
}

export class PurviewDlpError extends Error {
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
 * The inspected content was blocked by a Purview DLP policy or fail-closed policy.
 */
export class PurviewDlpBlockedError extends PurviewDlpError {
  constructor(public readonly evaluation: PurviewDlpEvaluationResult) {
    const subject = evaluation.activity === 'uploadText' ? 'The prompt' : 'The response';
    const reason = evaluation.evaluated
      ? 'It was blocked by a Microsoft Purview data loss prevention policy.'
      : 'Data loss prevention validation is unavailable and fail-closed mode is enabled.';
    super(
      `${subject} was blocked by Microsoft Purview. ${reason} `
      + `Correlation ID: ${evaluation.correlationId}`,
    );
  }
}

export class PurviewDlpValidationError extends PurviewDlpError {}

/**
 * Opt-in client for Microsoft Purview data loss prevention (DLP) and audit.
 *
 * Each evaluation posts the agent's content to the Microsoft Graph `processContent` endpoint, which
 * applies matching Purview DLP policies and writes the corresponding Purview audit event. The
 * delegated (agentic user) path evaluates as `/me`; the app-only path evaluates as
 * `/users/{sponsorUserId}`.
 */
export class PurviewDlpClient {
  private readonly configProvider: IConfigurationProvider<ToolingConfiguration>;
  private readonly fetchImplementation: typeof fetch;
  private readonly idFactory: () => string;
  private readonly now: () => number;
  private readonly tokenCache = new Map<string, CachedToken>();
  private readonly inFlightTokens = new Map<string, Promise<string>>();

  constructor(options: PurviewDlpClientOptions = {}) {
    this.configProvider = options.configProvider ?? defaultToolingConfigurationProvider;
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? Date.now;
    console.info(
      `${LOCAL_BUILD_MARKER} PurviewDlpClient loaded from the LOCAL tarball build of `
      + '@microsoft/agents-a365-tooling (0.0.0-placeholder). '
      + 'If you see this line, the agent is running the local SDK, not the published package.',
    );
  }

  public async evaluatePrompt(
    request: PurviewDlpEvaluationRequest,
    authenticationContext: PurviewDlpAuthenticationContext,
  ): Promise<PurviewDlpEvaluationResult | null> {
    const configuration = this.configProvider.getConfiguration();
    if (!configuration.isPurviewDlpEnabled) return null;
    this.validateMessages(request);
    const context = this.resolveContext(request, this.turnContextFrom(authenticationContext));
    const result = await this.evaluate(
      context,
      authenticationContext,
      'uploadText',
      0,
      this.buildText(request.messages),
      configuration,
    );
    this.logEvaluation(result);
    return result;
  }

  public async evaluateResponse(
    request: PurviewDlpEvaluationRequest,
    authenticationContext: PurviewDlpAuthenticationContext,
  ): Promise<PurviewDlpEvaluationResult | null> {
    const configuration = this.configProvider.getConfiguration();
    if (!configuration.isPurviewDlpEnabled) return null;
    this.validateMessages(request);
    const context = this.resolveContext(request, this.turnContextFrom(authenticationContext));
    const result = await this.evaluate(
      context,
      authenticationContext,
      'downloadText',
      1,
      this.buildText(request.messages),
      configuration,
    );
    this.logEvaluation(result);
    return result;
  }

  public async enforcePrompt(
    request: PurviewDlpEvaluationRequest,
    authenticationContext: PurviewDlpAuthenticationContext,
  ): Promise<PurviewDlpEvaluationResult | null> {
    const evaluation = await this.evaluatePrompt(request, authenticationContext);
    this.throwIfBlocked(evaluation);
    return evaluation;
  }

  public async enforceResponse(
    request: PurviewDlpEvaluationRequest,
    authenticationContext: PurviewDlpAuthenticationContext,
  ): Promise<PurviewDlpEvaluationResult | null> {
    const evaluation = await this.evaluateResponse(request, authenticationContext);
    this.throwIfBlocked(evaluation);
    return evaluation;
  }

  /**
   * Applies the prompt gate, runs the response generator, then applies the response gate.
   *
   * The prompt request is evaluated first (throwing when blocked). The generated response text is
   * then evaluated when it is non-empty. Returns the generated response when both gates allow it.
   */
  public async guardTurn(
    request: PurviewDlpEvaluationRequest,
    authenticationContext: PurviewDlpAuthenticationContext,
    generateResponse: () => string | Promise<string>,
  ): Promise<string> {
    if (typeof generateResponse !== 'function') {
      throw new PurviewDlpValidationError('generateResponse must be a function.');
    }

    const configuration = this.configProvider.getConfiguration();
    if (!configuration.isPurviewDlpEnabled) {
      return await generateResponse();
    }

    await this.enforcePrompt(request, authenticationContext);
    const response = await generateResponse();
    if (typeof response === 'string' && response.trim().length > 0) {
      await this.enforceResponse({ ...request, messages: [response] }, authenticationContext);
    }
    return response;
  }

  private async evaluate(
    context: ResolvedAgentContext,
    authenticationContext: PurviewDlpAuthenticationContext,
    activity: PurviewDlpActivity,
    sequenceNumber: number,
    text: string,
    configuration: ToolingConfiguration,
  ): Promise<PurviewDlpEvaluationResult> {
    const started = this.now();
    let resolved: ResolvedToken;
    try {
      resolved = await this.getAccessTokenAndPath(
        authenticationContext,
        context,
        configuration.purviewDlpAuthenticationScope,
        configuration.purviewDlpTimeoutMilliseconds,
      );
      Utility.ValidateAuthToken(resolved.token);
    } catch (error) {
      if (error instanceof PurviewDlpValidationError) throw error;
      return this.failure(
        activity,
        context.sessionId,
        configuration,
        'entra token unavailable',
        null,
        this.now() - started,
        error,
      );
    }

    const body = this.buildBody(context, activity, sequenceNumber, text, configuration);
    return await this.postContent(
      body,
      resolved.path,
      activity,
      context.sessionId,
      resolved.token,
      configuration,
    );
  }

  private buildBody(
    context: ResolvedAgentContext,
    activity: PurviewDlpActivity,
    sequenceNumber: number,
    text: string,
    configuration: ToolingConfiguration,
  ): Record<string, unknown> {
    const { data, isTruncated } = this.clampContent(
      text,
      configuration.purviewDlpMaxContentCharacters,
    );
    const timestamp = this.timestamp();

    return {
      contentToProcess: {
        contentEntries: [
          {
            '@odata.type': 'microsoft.graph.processConversationMetadata',
            identifier: this.idFactory(),
            content: {
              '@odata.type': 'microsoft.graph.textContent',
              data,
            },
            agents: [
              {
                '@odata.type': 'microsoft.graph.aiAgentInfo',
                blueprintId: context.blueprintId || context.applicationId,
                identifier: context.agentId || context.applicationId,
                name: context.agentName,
                version: '1.0',
              },
            ],
            // A non-empty name is required; omitting it returns a permanent BadRequest that Graph
            // reports as a 200 with zero policy actions (indistinguishable from a clean allow).
            name: `${context.agentName} ${activity}`,
            correlationId: context.sessionId,
            sequenceNumber,
            isTruncated,
            createdDateTime: timestamp,
            modifiedDateTime: timestamp,
            contentCategory: 'ai',
          },
        ],
        activityMetadata: { activity },
        integratedAppMetadata: { name: context.agentName, version: '1.0' },
        protectedAppMetadata: {
          name: context.agentName,
          version: '1.0',
          applicationLocation: {
            '@odata.type': 'microsoft.graph.policyLocationApplication',
            value: context.applicationId,
          },
        },
      },
    };
  }

  private async postContent(
    body: Record<string, unknown>,
    path: string,
    activity: PurviewDlpActivity,
    correlationId: string,
    accessToken: string,
    configuration: ToolingConfiguration,
  ): Promise<PurviewDlpEvaluationResult> {
    const started = this.now();
    let serialized: string;
    try {
      serialized = JSON.stringify(body);
    } catch (error) {
      return this.failure(
        activity,
        correlationId,
        configuration,
        'content is not JSON-serializable',
        null,
        this.now() - started,
        error,
      );
    }

    const url = `${configuration.purviewDlpGraphBaseUrl}${path}/dataSecurityAndGovernance/processContent`;
    const timeoutSignal = AbortSignal.timeout(configuration.purviewDlpTimeoutMilliseconds);
    let response: Response;
    try {
      response = await this.fetchImplementation(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Client-Request-Id': correlationId,
        },
        body: serialized,
        signal: timeoutSignal,
      });
    } catch (error) {
      const errorName = this.isJsonObject(error) && typeof error['name'] === 'string'
        ? error['name']
        : undefined;
      return this.failure(
        activity,
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

    // Accepted with no inline decision => allowed.
    if (response.status === 202 || response.status === 204) {
      return {
        allowed: true,
        evaluated: true,
        activity,
        correlationId,
        decision: { blockAction: false, restrictionAction: null, actionCount: 0 },
        protectionScopeState: null,
        httpStatus: response.status,
        error: null,
        latencyMilliseconds: this.now() - started,
      };
    }

    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch (error) {
      return this.failure(
        activity,
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
        activity,
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
        activity,
        correlationId,
        configuration,
        'non-JSON response',
        response.status,
        this.now() - started,
        error,
      );
    }

    if (!this.isJsonObject(payload)) {
      return this.failure(
        activity,
        correlationId,
        configuration,
        'response contained no verdict',
        response.status,
        this.now() - started,
      );
    }

    // A permanent BadRequest is reported inline as processingErrors: the content was NOT evaluated,
    // so treat it as a failure (subject to the fail mode) rather than a silent allow.
    const processingErrors = Array.isArray(payload['processingErrors'])
      ? payload['processingErrors']
      : [];
    if (processingErrors.length > 0) {
      return this.failure(
        activity,
        correlationId,
        configuration,
        `processing errors: ${processingErrors.length}`,
        response.status,
        this.now() - started,
      );
    }

    const decision = this.parseDecision(payload);
    const protectionScopeState = typeof payload['protectionScopeState'] === 'string'
      ? payload['protectionScopeState']
      : null;
    return {
      allowed: !decision.blockAction,
      evaluated: true,
      activity,
      correlationId,
      decision,
      protectionScopeState,
      httpStatus: response.status,
      error: null,
      latencyMilliseconds: this.now() - started,
    };
  }

  private failure(
    activity: PurviewDlpActivity,
    correlationId: string,
    configuration: ToolingConfiguration,
    error: string,
    httpStatus: number | null,
    latencyMilliseconds: number,
    cause?: unknown,
  ): PurviewDlpEvaluationResult {
    const block = configuration.purviewDlpFailClosed;
    return {
      allowed: !block,
      evaluated: false,
      activity,
      correlationId,
      decision: {
        blockAction: block,
        restrictionAction: null,
        actionCount: 0,
      },
      protectionScopeState: null,
      httpStatus,
      error: cause instanceof Error ? `${error}: ${cause.name}` : error,
      latencyMilliseconds,
    };
  }

  private parseDecision(payload: Record<string, unknown>): PurviewDlpDecision {
    const actions = Array.isArray(payload['policyActions']) ? payload['policyActions'] : [];
    const blockingAction = actions.find(
      action => this.isJsonObject(action)
        && String(action['restrictionAction'] ?? '').toLowerCase() === 'block',
    );
    return {
      blockAction: blockingAction !== undefined,
      restrictionAction: this.isJsonObject(blockingAction)
        && typeof blockingAction['restrictionAction'] === 'string'
        ? blockingAction['restrictionAction']
        : null,
      actionCount: actions.length,
    };
  }

  private async getAccessTokenAndPath(
    authenticationContext: PurviewDlpAuthenticationContext,
    context: ResolvedAgentContext,
    scope: string,
    timeoutMilliseconds: number,
  ): Promise<ResolvedToken> {
    if (!authenticationContext || typeof authenticationContext !== 'object') {
      throw new PurviewDlpValidationError('authenticationContext is required.');
    }

    if ('authorization' in authenticationContext) {
      this.validateRequiredString(
        authenticationContext.authHandlerName,
        'authenticationContext.authHandlerName',
      );
      if (!authenticationContext.turnContext) {
        throw new PurviewDlpValidationError('authenticationContext.turnContext is required.');
      }
      const token = await AgenticAuthenticationService.GetAgenticUserToken(
        authenticationContext.authorization,
        authenticationContext.authHandlerName,
        authenticationContext.turnContext,
        [scope],
      );
      return { token, path: '/me' };
    }

    if ('accessToken' in authenticationContext) {
      const sponsor = authenticationContext.sponsorUserId ?? context.sponsorUserId;
      return { token: authenticationContext.accessToken, path: this.pathForSponsor(sponsor) };
    }

    if ('getAccessToken' in authenticationContext) {
      const tokenScope = authenticationContext.tokenScope || scope;
      this.validateRequiredString(tokenScope, 'authenticationContext.tokenScope');
      const sponsor = authenticationContext.sponsorUserId ?? context.sponsorUserId;
      return {
        token: await authenticationContext.getAccessToken(tokenScope),
        path: this.pathForSponsor(sponsor),
      };
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
      const sponsor = authenticationContext.sponsorUserId ?? context.sponsorUserId;
      this.validateRequiredString(sponsor, 'authenticationContext.sponsorUserId');
      const tokenScope = authenticationContext.tokenScope
        || scope
        || `api://${authenticationContext.clientId}/.default`;
      const key =
        `client:${authenticationContext.tenantId}:${authenticationContext.clientId}:${tokenScope}`;
      const token = await this.getOrAcquireCachedToken(
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
      return { token, path: this.pathForSponsor(sponsor, true) };
    }

    this.validateRequiredString(
      authenticationContext.tenantId,
      'authenticationContext.tenantId',
    );
    this.validateRequiredString(
      authenticationContext.agentId,
      'authenticationContext.agentId',
    );
    this.validateRequiredString(
      authenticationContext.blueprintClientId,
      'authenticationContext.blueprintClientId',
    );
    this.validateRequiredString(
      authenticationContext.blueprintClientSecret,
      'authenticationContext.blueprintClientSecret',
    );
    const sponsor = authenticationContext.sponsorUserId ?? context.sponsorUserId;
    this.validateRequiredString(sponsor, 'authenticationContext.sponsorUserId');
    const tokenScope = authenticationContext.tokenScope ?? scope;
    this.validateRequiredString(tokenScope, 'authenticationContext.tokenScope');
    const key =
      `fmi:${authenticationContext.tenantId}:${authenticationContext.agentId}:${tokenScope}`;
    const token = await this.getOrAcquireCachedToken(
      key,
      () => this.acquireFmiToken(authenticationContext, tokenScope, timeoutMilliseconds),
    );
    return { token, path: this.pathForSponsor(sponsor, true) };
  }

  private pathForSponsor(sponsorUserId: string, appOnly = false): string {
    if (sponsorUserId) {
      return `/users/${encodeURIComponent(sponsorUserId)}`;
    }
    if (appOnly) {
      throw new PurviewDlpValidationError('authenticationContext.sponsorUserId is required.');
    }
    return '/me';
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
    request: PurviewDlpAgentContext,
    turnContext?: TurnContext,
  ): ResolvedAgentContext {
    if (!request || typeof request !== 'object') {
      throw new PurviewDlpValidationError('request is required.');
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
    const blueprintId = request.blueprintId ?? '';
    const applicationId = request.applicationId ?? (blueprintId || agentId);

    this.validateRequiredString(applicationId, 'applicationId');

    return {
      agentId,
      tenantId,
      blueprintId,
      applicationId,
      agentName: request.agentName ?? activity?.recipient?.name ?? DEFAULT_AGENT_NAME,
      sessionId,
      requestId: request.requestId ?? activity?.id ?? '',
      sponsorUserId: request.sponsorUserId ?? '',
    };
  }

  private turnContextFrom(
    authenticationContext: PurviewDlpAuthenticationContext,
  ): TurnContext | undefined {
    if (authenticationContext
      && typeof authenticationContext === 'object'
      && 'turnContext' in authenticationContext) {
      return authenticationContext.turnContext;
    }
    return undefined;
  }

  private validateMessages(request: PurviewDlpEvaluationRequest): void {
    if (!request || !Array.isArray(request.messages)
      || request.messages.every(message => typeof message !== 'string' || !message)) {
      throw new PurviewDlpValidationError('messages must contain at least one non-empty string.');
    }
  }

  private buildText(messages: string[]): string {
    return messages
      .filter(message => typeof message === 'string' && message.length > 0)
      .join('\n');
  }

  private clampContent(
    text: string,
    maxCharacters: number,
  ): { data: string; isTruncated: boolean } {
    if (maxCharacters <= 0 || text.length <= maxCharacters) {
      return { data: text, isTruncated: false };
    }
    return { data: text.slice(0, maxCharacters), isTruncated: true };
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  private logEvaluation(result: PurviewDlpEvaluationResult): void {
    console.info(
      `${LOCAL_BUILD_MARKER} Purview ${result.activity} -> ${result.allowed ? 'ALLOW' : 'BLOCK'} `
      + `(evaluated=${result.evaluated}, http=${result.httpStatus ?? 'n/a'}, `
      + `policyActions=${result.decision.actionCount}, correlationId=${result.correlationId}`
      + `${result.error ? `, error=${result.error}` : ''})`,
    );
  }

  private throwIfBlocked(evaluation: PurviewDlpEvaluationResult | null): void {
    if (evaluation && !evaluation.allowed) {
      throw new PurviewDlpBlockedError(evaluation);
    }
  }

  private validateRequiredString(value: unknown, fieldName: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new PurviewDlpValidationError(`${fieldName} is required.`);
    }
  }

  private isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
