# PRD: x-ms-agentId Header for MCP Platform Calls

## Overview

Add an `x-ms-agentId` header to all outbound HTTP requests from the tooling package to the MCP platform. This header identifies the calling agent using the best available identifier.

## Problem Statement

The MCP platform needs to identify which agent is making tooling requests for:
- Logging and diagnostics
- Usage analytics

Currently, no consistent agent identifier is sent with MCP platform requests.

## Requirements

### Functional Requirements

1. All HTTP requests to the MCP platform SHALL include the `x-ms-agentId` header
2. The header value SHALL be determined using the following priority:
   1. **Agent Blueprint ID** (highest priority)
   2. **Entra Application ID** (fallback)
   3. **Node Application Name** (lowest priority fallback)
3. If no identifier is available, the header SHOULD be omitted (not sent with empty value)

### Non-Functional Requirements

1. No additional network calls to retrieve identifiers
2. Minimal performance impact on existing flows
3. Backward compatible - existing integrations continue to work

## Technical Design

### Affected Components

| Package | File | Change |
|---------|------|--------|
| `agents-a365-tooling` | `src/McpToolServerConfigurationService.ts` | Add overloaded `listToolServers()` signature (backward compatible) |
| `agents-a365-tooling` | `src/Utility.ts` | Add `resolveAgentId()` and include `x-ms-agentid` header |
| `agents-a365-runtime` | `src/utility.ts` | Add `getAgentIdFromToken()` (decodes once, checks `xms_par_app_azp` → `appid` → `azp`) |
| `agents-a365-runtime` | `src/utility.ts` | Add `getApplicationName()` helper (reads npm_package_name or package.json) |
| `agents-a365-tooling-extensions-*` | `src/McpToolRegistrationService.ts` | Simplify to use new `listToolServers()` signature (optional) |

### Identifier Retrieval Strategy

#### 1. Agent Blueprint ID (Highest Priority)

**Source**: `TurnContext.activity.from.agenticAppBlueprintId`

**Availability**: Only available in agentic request scenarios where a `TurnContext` is present and the request originates from another agent.

**Retrieval**:
```typescript
// In Utility.GetToolRequestHeaders()
const agentBlueprintId = turnContext?.activity?.from?.agenticAppBlueprintId;
```

**Format**: GUID (e.g., `12345678-1234-1234-1234-123456789abc`)

---

#### 2 & 3. Agent ID from Token (Second/Third Priority)

**Sources** (checked in order):
1. `xms_par_app_azp` claim - Agent Blueprint ID (parent application's Azure app ID)
2. `appid` or `azp` claim - Entra Application ID

**Availability**: Available when an `authToken` is provided to the tooling methods.

**Retrieval**: New utility function that decodes token once and checks claims in priority order:

```typescript
// packages/agents-a365-runtime/src/utility.ts
public static getAgentIdFromToken(token: string): string {
  try {
    const decoded = jwt.decode(token) as {
      xms_par_app_azp?: string;
      appid?: string;
      azp?: string;
    } | null;

    // Priority: xms_par_app_azp (blueprint ID) > appid > azp
    return decoded?.xms_par_app_azp || decoded?.appid || decoded?.azp || '';
  } catch {
    return '';
  }
}
```

**Format**: GUID (e.g., `12345678-1234-1234-1234-123456789abc`)

**Note**: This replaces both `GetAgentBlueprintIdFromToken()` and `GetAppIdFromToken()` for agent ID resolution. The existing `GetAppIdFromToken()` can remain for other use cases that specifically need the Entra app ID.

---

#### 4. Node Application Name (Lowest Priority Fallback)

**Source**: Application's package.json `name` field or `npm_package_name` environment variable

**Strategy** (approved):
1. Check `process.env.npm_package_name` (set automatically by npm/pnpm when running scripts)
2. Fall back to reading and caching the application's `package.json` name field
3. If neither available, omit the header

**Implementation for package.json reading** (eager initialization to avoid sync I/O during requests):
```typescript
// packages/agents-a365-runtime/src/utility.ts
// Eagerly initialized at module load time
private static cachedPackageName: string | null = Utility.initPackageName();

private static initPackageName(): string | null {
  try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.name || null;
  } catch {
    return null;
  }
}

public static getApplicationName(): string | undefined {
  // First try npm_package_name (set by npm/pnpm run)
  if (process.env.npm_package_name) {
    return process.env.npm_package_name;
  }

  // Fall back to cached package.json name (read at module load time)
  return this.cachedPackageName || undefined;
}
```

**Note**: The `package.json` read is performed eagerly at module load time to avoid sync I/O during request handling.

---

### Implementation

#### ToolOptions Interface (No Changes Needed)

```typescript
// packages/agents-a365-tooling/src/contracts.ts
export interface ToolOptions {
  orchestratorName?: string;
  // No new properties needed - agent ID is resolved from TurnContext and authToken
}
```

**Note**: The `agentBlueprintId` is now extracted directly from `TurnContext.activity.from.agenticAppBlueprintId`, eliminating the need for manual override in most cases.

#### Updated GetToolRequestHeaders

The `x-ms-agentid` header is only added when `authToken` is provided. This means `sendChatHistory()` (which passes `undefined` for authToken) will not include this header.

```typescript
// packages/agents-a365-tooling/src/Utility.ts
public static GetToolRequestHeaders(
  authToken?: string,
  turnContext?: TurnContext,
  options?: ToolOptions
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;

    // NEW: x-ms-agentid header with priority fallback (only when authToken present)
    const agentId = this.resolveAgentId(authToken, turnContext);
    if (agentId) {
      headers['x-ms-agentid'] = agentId;
    }
  }

  // ... existing channel ID and User-Agent logic ...

  return headers;
}

private static resolveAgentId(
  authToken: string,
  turnContext?: TurnContext
): string | undefined {
  // Priority 1: Agent Blueprint ID from TurnContext
  const blueprintId = turnContext?.activity?.from?.agenticAppBlueprintId;
  if (blueprintId) {
    return blueprintId;
  }

  // Priority 2 & 3: Agent ID from token (xms_par_app_azp > appid > azp)
  // Single decode, checks claims in priority order
  const agentId = RuntimeUtility.getAgentIdFromToken(authToken);
  if (agentId) {
    return agentId;
  }

  // Priority 4: Application name from npm_package_name or package.json
  return RuntimeUtility.getApplicationName();
}
```

**Note**: `resolveAgentId()` now requires `authToken` (not optional) since it's only called within the `if (authToken)` block.

#### Updated listToolServers() Method (Backward Compatible)

Use TypeScript function overloading to support both the legacy and new signatures. The new signature takes `TurnContext`, `Authorization`, and `authHandlerName`, with automatic token generation and agent identity resolution:

```typescript
// packages/agents-a365-tooling/src/McpToolServerConfigurationService.ts

/**
 * @deprecated Use the overload with TurnContext and Authorization parameters instead.
 * Return MCP server definitions for the given agent.
 * @param agenticAppId The agent's application ID.
 * @param authToken Bearer token for MCP server access.
 */
async listToolServers(
  agenticAppId: string,
  authToken: string
): Promise<MCPServerConfig[]>;

/**
 * @deprecated Use the overload with TurnContext and Authorization parameters instead.
 * Return MCP server definitions for the given agent.
 * @param agenticAppId The agent's application ID.
 * @param authToken Bearer token for MCP server access.
 * @param options Optional tool options.
 */
async listToolServers(
  agenticAppId: string,
  authToken: string,
  options?: ToolOptions
): Promise<MCPServerConfig[]>;

/**
 * Return MCP server definitions for the given agent.
 * This overload automatically resolves the agenticAppId from TurnContext and generates auth token if not provided.
 * @param turnContext The TurnContext of the current request.
 * @param authorization Authorization object for token exchange.
 * @param authHandlerName The name of the auth handler to use for token exchange.
 * @param authToken Optional bearer token. If not provided, will be auto-generated via token exchange.
 * @param options Optional tool options.
 */
async listToolServers(
  turnContext: TurnContext,
  authorization: Authorization,
  authHandlerName: string,
  authToken?: string,
  options?: ToolOptions
): Promise<MCPServerConfig[]>;

// Implementation handles both signatures
async listToolServers(
  agenticAppIdOrTurnContext: string | TurnContext,
  authTokenOrAuthorization: string | Authorization,
  optionsOrAuthHandlerName?: ToolOptions | string,
  authTokenOrOptions?: string | ToolOptions,
  options?: ToolOptions
): Promise<MCPServerConfig[]> {
  // Detect which signature is being used based on the type of the first parameter
  if (typeof agenticAppIdOrTurnContext === 'string') {
    // LEGACY PATH: listToolServers(agenticAppId, authToken, options?)
    const agenticAppId = agenticAppIdOrTurnContext;
    const authToken = authTokenOrAuthorization as string;
    const toolOptions = optionsOrAuthHandlerName as ToolOptions | undefined;

    return await (this.isDevScenario()
      ? this.getMCPServerConfigsFromManifest()
      : this.getMCPServerConfigsFromToolingGateway(agenticAppId, authToken, undefined, toolOptions));
  } else {
    // NEW PATH: listToolServers(turnContext, authorization, authHandlerName, authToken?, options?)
    const turnContext = agenticAppIdOrTurnContext;
    const authorization = authTokenOrAuthorization as Authorization;
    const authHandlerName = optionsOrAuthHandlerName as string;
    let authToken = authTokenOrOptions as string | undefined;
    const toolOptions = options;

    // Auto-generate token if not provided
    if (!authToken) {
      authToken = await AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext);
    }

    // Note: Token validation is performed inside getMCPServerConfigsFromToolingGateway()
    // to avoid duplicate validation (it's also called by the legacy path)

    // Resolve agenticAppId from TurnContext
    const agenticAppId = RuntimeUtility.ResolveAgentIdentity(turnContext, authToken);

    return await (this.isDevScenario()
      ? this.getMCPServerConfigsFromManifest()
      : this.getMCPServerConfigsFromToolingGateway(agenticAppId, authToken, turnContext, toolOptions));
  }
}
```

**Key points:**
- Legacy signatures (with `agenticAppId` as first parameter) continue to work but are marked `@deprecated`
- New signature takes `TurnContext`, `Authorization`, and `authHandlerName` as first three parameters
- If `authToken` is not provided, it's auto-generated via `AgenticAuthenticationService.GetAgenticUserToken()`
- `agenticAppId` is auto-resolved from TurnContext via `RuntimeUtility.ResolveAgentIdentity()`
- The `x-ms-agentid` header is populated from `turnContext.activity.from.agenticAppBlueprintId`

### Call Sites Summary

| Call Site | authToken | turnContext | Gets `x-ms-agentid`? |
|-----------|-----------|-------------|----------------------|
| `getMCPServerConfigsFromToolingGateway()` | ✅ | ✅ (new path) | ✅ Yes |
| `sendChatHistory()` | ❌ | ✅ | ❌ No (authToken required) |
| Extension packages (`addToolServersToAgent`, `getTools`) | ✅ | ✅ | ✅ Yes |

**Note**: The `x-ms-agentid` header is only added when `authToken` is present. `sendChatHistory()` passes `undefined` for authToken, so it won't include this header.

---

## Open Questions

### Q1: Node Application Name Strategy ✅ RESOLVED

**Decision**: Use both `process.env.npm_package_name` and reading from `package.json`, with npm_package_name as primary and package.json as fallback. Cache the package.json read to avoid repeated file I/O.

### Q2: Header Name Casing ✅ RESOLVED

**Decision**: Use `x-ms-agentid` (all lowercase, case insensitive).

HTTP headers are case-insensitive per RFC 7230, so the server will accept any casing. Using lowercase is the conventional choice.

### Q3: TurnContext Availability ✅ RESOLVED

**Decision**: Add an overloaded signature to `listToolServers()` that accepts `TurnContext`, `Authorization`, and `authHandlerName`, with automatic token generation and agent identity resolution.

**Legacy signatures (deprecated, still work)**:
```typescript
async listToolServers(agenticAppId: string, authToken: string): Promise<MCPServerConfig[]>
async listToolServers(agenticAppId: string, authToken: string, options?: ToolOptions): Promise<MCPServerConfig[]>
```

**New signature (recommended)**:
```typescript
async listToolServers(
  turnContext: TurnContext,
  authorization: Authorization,
  authHandlerName: string,
  authToken?: string,
  options?: ToolOptions
): Promise<MCPServerConfig[]>
```

**Behavior for new signature**:
- If `authToken` is not provided, auto-generate via `AgenticAuthenticationService.GetAgenticUserToken(authorization, authHandlerName, turnContext)`
- Resolve `agenticAppId` via `RuntimeUtility.ResolveAgentIdentity(turnContext, authToken)`
- Extract `agentBlueprintId` from `turnContext.activity.from.agenticAppBlueprintId` for `x-ms-agentid` header
- The `x-ms-agentid` header is populated using the priority: TurnContext > token claims > app name

**Note**: This is **backward compatible** - existing code using the legacy signatures continues to work unchanged, but will show a deprecation warning in IDEs

### Q4: Validation ✅ RESOLVED

**Decision**: No validation - pass through as-is. The values come from trusted sources (JWT tokens, TurnContext, package.json).

### Q5: Missing Identifier Behavior ✅ RESOLVED

**Decision**: Omit the header entirely if no identifier is available. Do not send empty or "unknown" values.

---

## Testing Strategy

### Unit Tests

1. Test `resolveAgentId()` with each priority level:
   - TurnContext with `agenticAppBlueprintId` → returns blueprint ID
   - No TurnContext blueprint ID, token with `xms_par_app_azp` → returns blueprint ID from token
   - No `xms_par_app_azp`, token with `appid` → returns Entra app ID
   - No `appid`, token with `azp` → returns azp claim
   - No token claims → returns application name from package.json
   - Nothing available → returns undefined
2. Test `getAgentIdFromToken()` checks claims in correct priority order (`xms_par_app_azp` > `appid` > `azp`)
3. Test `GetToolRequestHeaders()` includes `x-ms-agentid` when identifier available
4. Test `GetToolRequestHeaders()` omits header when no identifier available
5. Test `getApplicationName()` reads from `npm_package_name` first, then package.json
6. Test `getApplicationName()` caches package.json read

### Integration Tests

1. Verify header is sent in `listToolServers()` requests (new signature path)
2. Verify header is NOT sent in `sendChatHistory()` requests (no authToken)
3. Test auto-token generation when `authToken` not provided
4. Test with real TurnContext containing agent blueprint ID

---

## Breaking Changes

**None** - This implementation is fully backward compatible.

### listToolServers() Signature (Backward Compatible)

The method now supports multiple signatures via TypeScript overloading:

**Legacy signatures (deprecated but still work):**
```typescript
listToolServers(agenticAppId: string, authToken: string)
listToolServers(agenticAppId: string, authToken: string, options?: ToolOptions)
```

**New signature (recommended):**
```typescript
listToolServers(turnContext: TurnContext, authorization: Authorization, authHandlerName: string, authToken?: string, options?: ToolOptions)
```

### Migration Guide

**For existing consumers:**
- No changes required - existing code continues to work
- A deprecation warning will appear in IDE for the legacy signatures

**For new code (recommended):**
```typescript
// Use new signature with TurnContext and Authorization for automatic token generation
const servers = await configService.listToolServers(turnContext, authorization, 'graph');

// Or with explicit token:
const servers = await configService.listToolServers(turnContext, authorization, 'graph', authToken);

// With all options:
const servers = await configService.listToolServers(turnContext, authorization, 'graph', authToken, { orchestratorName: 'Claude' });
```

**Deprecation timeline:**
- Legacy signatures will be marked `@deprecated` but remain functional
- Consider removing legacy signatures in a future major version

---

## Rollout Plan

1. **Phase 1**: Update `listToolServers()` signature and add `x-ms-agentid` header
2. **Phase 2**: Simplify extension packages to leverage new signature (optional refactor)
3. **Phase 3**: Update documentation and samples

---

## Dependencies

- Runtime package for `GetAppIdFromToken()` utility (already exists)
- No new external dependencies required

---

## Success Metrics

1. 100% of MCP platform requests include `x-ms-agentId` header (when identifier available)
2. No increase in request latency
3. No breaking changes for existing consumers
