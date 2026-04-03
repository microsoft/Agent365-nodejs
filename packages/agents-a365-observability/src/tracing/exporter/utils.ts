// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { ClusterCategory, IConfigurationProvider } from '@microsoft/agents-a365-runtime';
import { OpenTelemetryConstants } from '../constants';
import logger from '../../utils/logging';
import { ExporterEventNames } from './ExporterEventNames';
import {
  ObservabilityConfiguration,
  defaultObservabilityConfigurationProvider,
  PerRequestSpanProcessorConfiguration,
  defaultPerRequestSpanProcessorConfigurationProvider
} from '../../configuration';
import { getPerRequestProcessorInternalOverrides } from '../../internal/PerRequestProcessorInternalOverrides';

/**
 * Convert trace ID to hex string format
 */
export function hexTraceId(value: string | number): string {
  if (typeof value === 'number') {
    // Convert integer to 32 hex chars (128-bit)
    return value.toString(16).padStart(32, '0');
  }
  // Handle hex string input - ensure it's 32 hex characters
  return value.replace(/^0x/, '').padStart(32, '0');
}

/**
 * Convert span ID to hex string format
 */
export function hexSpanId(value: string | number): string {
  if (typeof value === 'number') {
    // Convert integer to 16 hex chars (64-bit)
    return value.toString(16).padStart(16, '0');
  }
  // Handle hex string input - ensure it's 16 hex characters
  return value.replace(/^0x/, '').padStart(16, '0');
}

/**
 * Convert any value to string, handling null/undefined
 */
export function asStr(v: unknown): string | undefined {
  if (v === null || v === undefined) {
    return undefined;
  }
  const s = String(v);
  return s.trim() ? s : undefined;
}

/**
 * Get span kind name from SpanKind enum
 */
export function kindName(kind: SpanKind): string {
  switch (kind) {
  case SpanKind.INTERNAL:
    return 'INTERNAL';
  case SpanKind.SERVER:
    return 'SERVER';
  case SpanKind.CLIENT:
    return 'CLIENT';
  case SpanKind.PRODUCER:
    return 'PRODUCER';
  case SpanKind.CONSUMER:
    return 'CONSUMER';
  default:
    return 'UNSPECIFIED';
  }
}

/**
 * Get status name from SpanStatusCode enum
 */
export function statusName(code: SpanStatusCode): string {
  switch (code) {
  case SpanStatusCode.UNSET:
    return 'UNSET';
  case SpanStatusCode.OK:
    return 'OK';
  case SpanStatusCode.ERROR:
    return 'ERROR';
  default:
    return 'UNSET';
  }
}

/**
 * Partition spans by (tenantId, agentId) identity pairs
 */
export function partitionByIdentity(
  spans: ReadableSpan[]
): Map<string, ReadableSpan[]> {
  const groups = new Map<string, ReadableSpan[]>();

  let skippedCount = 0;
  for (const span of spans) {
    const attrs = span.attributes || {};
    const tenant = asStr(attrs[OpenTelemetryConstants.TENANT_ID_KEY]);
    const agent = asStr(attrs[OpenTelemetryConstants.GEN_AI_AGENT_ID_KEY]);

    if (!tenant || !agent) {
      skippedCount++;
      continue;
    }

    const key = `${tenant}:${agent}`;
    const existing = groups.get(key) || [];
    existing.push(span);
    groups.set(key, existing);
  }

  if(skippedCount > 0) {
    logger.event(ExporterEventNames.EXPORT_PARTITION_SPAN_MISSING_IDENTITY, false, 0, `${skippedCount} spans are skipped due to missing tenant or agent ID`);
  }

  logger.info(`[Agent365Exporter] Partitioned into ${groups.size} identity groups (${skippedCount} spans skipped)`);
  return groups;
}

/**
 * Check if Agent 365 exporter is enabled via environment variable
 * @param configProvider Optional configuration provider. Defaults to defaultObservabilityConfigurationProvider if not specified.
 */
export function isAgent365ExporterEnabled(
  configProvider?: IConfigurationProvider<ObservabilityConfiguration>
): boolean {
  const provider = configProvider ?? defaultObservabilityConfigurationProvider;
  const enabled = provider.getConfiguration().isObservabilityExporterEnabled;
  logger.info(`[Agent365Exporter] Agent 365 exporter enabled: ${enabled}`);
  return enabled;
}

/**
 * Check if per-request export is enabled.
 * Precedence: internal overrides > configuration provider > environment variable.
 * When enabled, the PerRequestSpanProcessor is used instead of BatchSpanProcessor.
 * The token is passed via OTel Context (async local storage) at export time.
 * @param configProvider Optional configuration provider. Defaults to defaultPerRequestSpanProcessorConfigurationProvider if not specified.
 */
export function isPerRequestExportEnabled(
  configProvider?: IConfigurationProvider<PerRequestSpanProcessorConfiguration>
): boolean {
  const overrides = getPerRequestProcessorInternalOverrides();
  const overrideValue = overrides?.isPerRequestExportEnabled?.();
  if (typeof overrideValue === 'boolean') {
    logger.info(`[Agent365Exporter] Per-request export enabled (internal override): ${overrideValue}`);
    return overrideValue;
  }

  const provider = configProvider ?? defaultPerRequestSpanProcessorConfigurationProvider;
  const enabled = provider.getConfiguration().isPerRequestExportEnabled;
  logger.info(`[Agent365Exporter] Per-request export enabled: ${enabled}`);
  return enabled;
}

/**
 * Resolve the Agent365 service endpoint base URI for a given cluster category.
 * When an explicit override is not configured, this determines the default base URI.
 */
export function resolveAgent365Endpoint(clusterCategory: ClusterCategory): string {
  switch (clusterCategory) {
  case 'prod':
  default:
    return 'https://agent365.svc.cloud.microsoft';
  }
}

/**
 * Get Agent365 Observability domain override.
 * Internal development and test clusters can override this by setting the
 * `A365_OBSERVABILITY_DOMAIN_OVERRIDE` environment variable. When set to a
 * non-empty value, that value is used as the base URI regardless of cluster category. Otherwise, null is returned.
 * @param configProvider Optional configuration provider. Defaults to defaultObservabilityConfigurationProvider if not specified.
 */
export function getAgent365ObservabilityDomainOverride(
  configProvider?: IConfigurationProvider<ObservabilityConfiguration>
): string | null {
  const provider = configProvider ?? defaultObservabilityConfigurationProvider;
  return provider.getConfiguration().observabilityDomainOverride;
}


/**
 * Parse identity key back to tenant and agent IDs
 */
export function parseIdentityKey(key: string): { tenantId: string; agentId: string } {
  const [tenantId, agentId] = key.split(':');
  return { tenantId, agentId };
}

// ---------------------------------------------------------------------------
// Span truncation
// ---------------------------------------------------------------------------

/** Maximum allowed span size in bytes (250KB). @internal */
export const MAX_SPAN_SIZE_BYTES = 250 * 1024;

/** Blob content over this threshold is replaced with a sentinel. */
const BLOB_SHRINK_THRESHOLD = 50 * 1024;

const BLOB_SENTINEL = '[blob truncated]';
const JSON_SENTINEL = '[truncated]';
const TRUNCATED_SUFFIX = '… [truncated]';
const TRUNCATED_SUFFIX_BYTES = Buffer.byteLength(TRUNCATED_SUFFIX, 'utf8');

const MESSAGE_ATTR_KEYS = new Set([
  OpenTelemetryConstants.GEN_AI_INPUT_MESSAGES_KEY,
  OpenTelemetryConstants.GEN_AI_OUTPUT_MESSAGES_KEY,
]);

interface OTLPSpanLike {
  attributes: Record<string, unknown> | null;
}

interface ShrinkAction {
  estimatedSavedBytes: number;
  apply(): void;
  revert(): void;
  category: 'binary' | 'regular';
}

/**
 * Trim a string by a target UTF-8 byte budget while preserving whole code points.
 */
function trimString(value: string, bytesToShed: number): string {
  const currentBytes = Buffer.byteLength(value, 'utf8');
  const targetTotalBytes = Math.max(TRUNCATED_SUFFIX_BYTES, currentBytes - Math.max(1, bytesToShed));
  const targetContentBytes = targetTotalBytes - TRUNCATED_SUFFIX_BYTES;
  if (targetContentBytes <= 0) {
    return TRUNCATED_SUFFIX;
  }

  const codePoints = Array.from(value);
  let consumedBytes = 0;
  let keepCount = 0;

  for (const codePoint of codePoints) {
    const codePointBytes = Buffer.byteLength(codePoint, 'utf8');
    if (consumedBytes + codePointBytes > targetContentBytes) {
      break;
    }
    consumedBytes += codePointBytes;
    keepCount++;
  }

  return codePoints.slice(0, keepCount).join('') + TRUNCATED_SUFFIX;
}

function getSerializedSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function createBinaryShrinkAction(part: Record<string, unknown>): ShrinkAction | undefined {
  const partType = part.type as string;

  if (partType === 'blob' && typeof part.content === 'string') {
    const contentSize = Buffer.byteLength(part.content, 'utf8');
    if (contentSize <= 0 || part.content === BLOB_SENTINEL) {
      return undefined;
    }

    const originalContent = part.content;

    return {
      estimatedSavedBytes: contentSize - Buffer.byteLength(BLOB_SENTINEL, 'utf8'),
      category: 'binary',
      revert() {
        part.content = originalContent;
      },
      apply() {
        part.content = BLOB_SENTINEL;
      }
    };
  }

  return undefined;
}

/**
 * Collect all shrink candidates from message parts and direct string attributes.
 * When a message attribute contains non-JSON content it falls through to regular
 * string trimming.
 */
function collectShrinkActions(
  attributes: Record<string, unknown>,
  parsedMessages: Map<string, { version: string; messages: Array<{ parts: Array<Record<string, unknown>> }> }>,
  options: {
    includeRegular: boolean;
    includeBinary: boolean;
    minBinaryPayloadBytes?: number;
  },
): ShrinkAction[] {
  const actions: ShrinkAction[] = [];

  for (const key of Object.keys(attributes)) {
    let handledAsMessage = false;

    if (MESSAGE_ATTR_KEYS.has(key)) {
      // Parse and cache the message wrapper if not already done
      if (!parsedMessages.has(key) && typeof attributes[key] === 'string') {
        try {
          const parsed = JSON.parse(attributes[key] as string);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.messages)) {
            parsedMessages.set(key, parsed);
          }
        } catch {
          // Not valid JSON — will fall through to string trim
        }
      }

      if (parsedMessages.has(key)) {
        handledAsMessage = true;
        const wrapper = parsedMessages.get(key)!;
        for (const message of wrapper.messages) {
          if (!Array.isArray(message.parts)) continue;
          for (const part of message.parts) {
            const partType = part.type as string;

            if (options.includeBinary) {
              const binaryAction = createBinaryShrinkAction(part);
              if (binaryAction && binaryAction.estimatedSavedBytes > 0) {
                const originalPayloadSize = binaryAction.estimatedSavedBytes
                  + Buffer.byteLength(BLOB_SENTINEL, 'utf8');
                if (options.minBinaryPayloadBytes === undefined || originalPayloadSize > options.minBinaryPayloadBytes) {
                  actions.push(binaryAction);
                }
              }
            }

            if (!options.includeRegular) {
              continue;
            }

            // Tool/server JSON payload fields → sentinel (one-shot)
            const jsonField =
              partType === 'tool_call' ? 'arguments'
                : partType === 'tool_call_response' ? 'response'
                  : partType === 'server_tool_call' ? 'server_tool_call'
                    : partType === 'server_tool_call_response' ? 'server_tool_call_response'
                      : undefined;

            if (jsonField && part[jsonField] !== undefined && part[jsonField] !== JSON_SENTINEL) {
              let fieldSize: number;
              try { fieldSize = Buffer.byteLength(JSON.stringify(part[jsonField]), 'utf8'); }
              catch { fieldSize = 0; }
              if (fieldSize > 0) {
                const originalValue = part[jsonField];
                actions.push({
                  estimatedSavedBytes: fieldSize - Buffer.byteLength(JSON.stringify(JSON_SENTINEL), 'utf8'),
                  category: 'regular',
                  revert() { part[jsonField!] = originalValue; },
                  apply() { part[jsonField!] = JSON_SENTINEL; }
                });
              }
              continue;
            }

            // Text/reasoning content → trim (re-shrinkable)
            if ((partType === 'text' || partType === 'reasoning') && typeof part.content === 'string') {
              const contentSize = Buffer.byteLength(part.content, 'utf8');
              const minSize = TRUNCATED_SUFFIX_BYTES;
              if (contentSize > minSize) {
                const originalContent = part.content;
                actions.push({
                  estimatedSavedBytes: contentSize - minSize,
                  category: 'regular',
                  revert() {
                    part.content = originalContent;
                  },
                  apply() {
                    const cur = Buffer.byteLength(part.content as string, 'utf8');
                    if (cur > minSize) part.content = trimString(part.content as string, cur - minSize);
                  }
                });
              }
            }
          }
        }
      }
    }

    // Non-message string attribute, OR message key with non-JSON content → trim
    if (!handledAsMessage && typeof attributes[key] === 'string') {
      if (!options.includeRegular) {
        continue;
      }

      const value = attributes[key] as string;
      const valueSize = Buffer.byteLength(value, 'utf8');
      const minSize = TRUNCATED_SUFFIX_BYTES;
      if (valueSize > minSize) {
        const originalValue = value;
        actions.push({
          estimatedSavedBytes: valueSize - minSize,
          category: 'regular',
          revert() {
            attributes[key] = originalValue;
          },
          apply() {
            const cur = Buffer.byteLength(attributes[key] as string, 'utf8');
            if (cur > minSize) attributes[key] = trimString(attributes[key] as string, cur - minSize);
          }
        });
      }
    }
  }

  return actions;
}

function flushParsedMessages(
  attributes: Record<string, unknown>,
  parsedMessages: Map<string, { version: string; messages: Array<{ parts: Array<Record<string, unknown>> }> }>,
): void {
  for (const [key, wrapper] of parsedMessages) {
    try {
      attributes[key] = JSON.stringify(wrapper);
    } catch {
      // Leave the previous string value intact if serialization fails.
    }
  }
}

function runShrinkPhase(
  span: OTLPSpanLike,
  attributes: Record<string, unknown>,
  parsedMessages: Map<string, { version: string; messages: Array<{ parts: Array<Record<string, unknown>> }> }>,
  currentSize: number,
  options: {
    includeRegular: boolean;
    includeBinary: boolean;
  },
): number {
  let nextSize = currentSize;

  while (nextSize > MAX_SPAN_SIZE_BYTES) {
    const nextAction = collectShrinkActions(attributes, parsedMessages, options)
      .sort((left, right) => right.estimatedSavedBytes - left.estimatedSavedBytes)[0];

    if (!nextAction) {
      break;
    }

    const previousSize = nextSize;
    nextAction.apply();
    flushParsedMessages(attributes, parsedMessages);
    nextSize = getSerializedSize(span);

    if (nextSize >= previousSize) {
      break;
    }
  }

  return nextSize;
}

/**
 * Truncate span attributes if the serialized span exceeds MAX_SPAN_SIZE_BYTES.
 *
 * Phase 1: shrink all blob payloads larger than 50 KB.
 * Phase 2: iteratively shrink regular fields by size priority, remeasuring after each step.
 * Phase 3: if still oversized, iteratively shrink any remaining blob payloads to fit.
 */
export function truncateSpan<T extends OTLPSpanLike>(spanDict: T): T {
  try {
    let currentSize = getSerializedSize(spanDict);
    if (currentSize <= MAX_SPAN_SIZE_BYTES) return spanDict;

    logger.warn(
      `[Agent365Exporter] Span size (${currentSize} bytes) exceeds limit (${MAX_SPAN_SIZE_BYTES} bytes). Shrinking attributes.`
    );

    const truncated = { ...spanDict };
    if (truncated.attributes) truncated.attributes = { ...truncated.attributes };
    const attributes = truncated.attributes;
    if (!attributes) return truncated;

    const parsedMessages = new Map<string, { version: string; messages: Array<{ parts: Array<Record<string, unknown>> }> }>();

    const mandatoryBinaryActions = collectShrinkActions(attributes, parsedMessages, {
      includeRegular: false,
      includeBinary: true,
      minBinaryPayloadBytes: BLOB_SHRINK_THRESHOLD,
    }).sort((a, b) => b.estimatedSavedBytes - a.estimatedSavedBytes);

    for (const action of mandatoryBinaryActions) {
      action.apply();
    }

    if (mandatoryBinaryActions.length > 0) {
      flushParsedMessages(attributes, parsedMessages);
      currentSize = getSerializedSize(truncated);
      if (currentSize <= MAX_SPAN_SIZE_BYTES) {
        return truncated;
      }
    }

    currentSize = runShrinkPhase(truncated, attributes, parsedMessages, currentSize, {
        includeRegular: true,
        includeBinary: false,
    });

    currentSize = runShrinkPhase(truncated, attributes, parsedMessages, currentSize, {
        includeRegular: false,
        includeBinary: true,
    });

    if (currentSize > MAX_SPAN_SIZE_BYTES) {
      logger.warn(
        `[Agent365Exporter] Span still ${currentSize} bytes after exhausting all shrink actions (limit: ${MAX_SPAN_SIZE_BYTES}).`
      );
    }

    return truncated;
  } catch (e) {
    logger.error(`[Agent365Exporter] Error during span truncation: ${e}`);
    return spanDict;
  }
}
