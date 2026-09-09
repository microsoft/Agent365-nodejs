# Automatic Invocation Identity

Automatic invocation identity enrichment resolves the caller and target identities for a hosted agent turn and adds them to every OpenTelemetry span created in that turn.

## Enable the feature

The feature is opt-in:

```typescript
new ObservabilityHostingManager().configure(adapter, {
  enableInvocationIdentity: true,
});
```

Omitting `enableInvocationIdentity` and setting it to `false` are equivalent. Resolver options do not enable the feature. Baggage and output logging remain separately controlled:

```typescript
new ObservabilityHostingManager().configure(adapter, {
  enableInvocationIdentity: true,
  enableBaggage: true,
  enableOutputLogging: true,
});
```

Set `enableInvocationIdentity: false` to roll back without changing legacy baggage, output logging, or scope-helper behavior.

## Trust boundary

The hosting middleware assumes the standard `authorizeJWT` hosting path and therefore defaults `turnContextIdentityTrustSource` to `StandardAuthorizeJwt`. The middleware only reads `TurnContext.identity` and Activity identity fields when the identity is a nonempty object and is not the anonymous development identity.

Custom hosts must disable that assumption and provide an already-validated principal:

```typescript
new ObservabilityHostingManager().configure(adapter, {
  enableInvocationIdentity: true,
  turnContextIdentityTrustSource: TurnContextIdentityTrustSource.None,
  resolveValidatedPrincipal: async (turnContext) => {
    return validatePrincipalFromCustomHost(turnContext);
  },
});
```

The resolver never decodes the raw authorization token. It does not use `sub`, email, UPN, `from.id`, channel IDs, or the target agent as a caller identity.

## Classification

Validated claims use the following classification:

| Evidence | Role and caller identity |
| --- | --- |
| `idtyp=user`, valid `oid`, delegated `scp`, no Agent ID marker | Human; `oid` becomes `user.id` |
| Above with `xms_sub_fct` containing `13` | Agent; `oid` becomes `microsoft.a365.caller.agent.user.id` |
| User token with `xms_act_fct` containing `11` or `xms_par_app_azp` | Agent/OBO; `oid` remains the human and the parent app becomes the caller blueprint |
| `idtyp=app`, nonempty `roles`, and an Agent ID marker | Agent; the parent app becomes the caller blueprint |
| Ordinary service application | No trusted caller classification |

Trusted Activity roles are normalized by removing whitespace, `_`, and `-`, then lowercasing:

| Activity role | Classification |
| --- | --- |
| `user` | Human |
| `bot`, `skill`, `agent`, `agenticAppInstance`, `agenticUser` | Agent |
| Missing or unsupported | Unknown |
| Event activity | Unknown unless explicitly configured |

`ContinueConversation` is not automatically classified as Event. Configure `invocationRole: InvocationRole.Event` for a known autonomous event.

## Precedence

Role precedence:

1. Explicit `invocationRole`
2. Application or hosting validated principal
3. Trusted non-Event Activity role
4. Unknown

Caller-field precedence is application principal, hosting principal, then Activity. Target-field precedence is the current trusted Activity followed by configured target fallback.

Conflicts are reported through `onIdentityConflict`. The callback receives the field, normalized values, and the winning and losing resolution sources.

## A2A, OBO, and agent-user identity

- Direct human calls use `user.id`.
- An OBO call preserves both `user.id` and the immediate caller-agent blueprint.
- An agent-user call uses `microsoft.a365.caller.agent.user.id`, never `user.id`.
- App-only callers use caller instance or blueprint attributes when available.
- Event calls carry target execution identity and do not fabricate a caller.

Manual `CallerDetails` remain an escape hatch. Explicit nonblank scope values override automatically resolved values.

## Context and baggage

Resolved identity is stored in a private process-local OpenTelemetry context key. It is not added to W3C baggage.

When local identity exists, baggage cannot provide or overwrite these fields:

- `microsoft.a365.invocation.role`
- `microsoft.tenant.id`
- `gen_ai.agent.id`
- `microsoft.agent.user.id`
- `microsoft.a365.agent.blueprint.id`
- `user.id`
- `microsoft.a365.caller.agent.id`
- `microsoft.a365.caller.agent.user.id`
- `microsoft.a365.caller.agent.blueprint.id`

Display metadata continues to use legacy behavior.

## Validation and diagnostics

All identity join IDs must be non-nil UUIDs and are normalized to lowercase. Strict validation can be enabled with `strictIdentityValidation: true`. Without strict validation, missing identity warns and the turn continues.

Identity-enriched `invoke_agent` spans warn for:

- `missing_human_identity`
- `missing_agent_identity`
- `unknown_invocation_role`
- `missing_event_execution_identity`

Warnings use `console.warn` so they remain visible when the SDK log level is `none`. Repeated warnings are deduplicated by tenant, target agent, and reason.

## Backend normalization

The telemetry backend should compute:

```text
effectivePrincipalId =
  user.id
  ?? microsoft.a365.caller.agent.user.id
  ?? microsoft.a365.caller.agent.id
  ?? microsoft.a365.caller.agent.blueprint.id
  ?? (invocation.role == Event
        ? microsoft.agent.user.id
          ?? gen_ai.agent.id
          ?? microsoft.a365.agent.blueprint.id
        : undefined)
```

The backend must retain `principalType` and `principalSource`. Event target fallback uses `principalSource=target-agent`. This backend normalization is not implemented by the Node.js SDK.
