// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type * as CallbackManagerModule from "@langchain/core/callbacks/manager";
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
  isWrapped
} from '@opentelemetry/instrumentation';
import { ObservabilityManager, logger } from '@microsoft/agents-a365-observability';
import { trace, Tracer } from "@opentelemetry/api";
import { LangChainTracer } from "./tracer";


export interface LangChainInstrumentationConfig extends InstrumentationConfig {
  enabled?: boolean;
  tracerName?: string;
  tracerVersion?: string;
  /**
   * When true, suppresses gen_ai.input.messages attributes for chain invocation.
   * Defaults to false.
   */
  suppressInvokeInput?: boolean;
}
type CallbackManagerModuleType = typeof CallbackManagerModule;

let isPatched = false;
export class LangChainTraceInstrumentor extends InstrumentationBase<LangChainInstrumentationConfig> {
  private _hasBeenEnabled = false;
  protected otelTracer: Tracer;

  constructor(config: LangChainInstrumentationConfig = {}) {
    if (!ObservabilityManager.getInstance()) {
      throw new Error(
        'ObservabilityManager is not configured yet. Please configure ObservabilityManager before initializing this instrumentor.'
      );
    }

    const configWithDefaults = {
      enabled: false,
      ...config
    };

    super(
      'agent365-langchain-instrumentor',
      '1.0.0',
      configWithDefaults
    );

    const tracerName = this._config.tracerName ?? 'agent365-langchain';
    const tracerVersion = this._config.tracerVersion;

    this.otelTracer = trace.getTracer(tracerName, tracerVersion);
    trace.getTracerProvider();
  }
  
  protected init(): InstrumentationModuleDefinition {
    return {
      name: '@langchain/core/callbacks/manager',
      supportedVersions: ['>=0.2.0'],
      files: [],
      patch: this.patch.bind(this),
      unpatch: (moduleExports: Record<string, unknown>) => {
        const CallbackManager = moduleExports?.CallbackManager as typeof CallbackManagerModule.CallbackManager;
        if (!CallbackManager) {
          return;
        }
        
        if (isWrapped(CallbackManager._configureSync)) {
          this._unwrap(CallbackManager, "_configureSync");
          logger.info('[LangChainTraceInstrumentor] unpatch OTEL LangChain instrumentation');
        }
      }
    };
  }

  patch(module: CallbackManagerModuleType) {
    if (isPatched) {
          return module;
        }

        const { CallbackManager } = module as CallbackManagerModuleType;
        if (!CallbackManager || !("_configureSync" in CallbackManager)) {
          return module;
        }

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const instrumentor = this;
        this._wrap(CallbackManager, "_configureSync", (original) => {
          return function (
            this: CallbackManagerModuleType,
            ...args: Parameters<
              typeof CallbackManager["_configureSync"]
            >
          ) {
            const inheritableHandlers = args[0];
                 
            const newInheritableHandlers = addTracerToHandlers(
              instrumentor.otelTracer,
              inheritableHandlers,
            );
            args[0] = newInheritableHandlers;
            logger.info('[LangChainTraceInstrumentor] _configureSync is wrapped to add LangChainTracer');
            return original.apply(this, args);
          };
        });

        logger.info('[LangChainTraceInstrumentor] Patch OTEL LangChain instrumentation');
        isPatched = true;
        return module;
  }

  manuallyInstrument(module: CallbackManagerModuleType) {
    logger.info(`Manually instrumenting CallbackManagerModule`);
    this.patch(module);
  }
  public instrumentationDependencies(): readonly string[] {
    return ['@langchain/core >= 0.2.0'] as const;
  }

  public override enable(): void {
    if (this._hasBeenEnabled) {
      return;
    }
    this._hasBeenEnabled = true;

    logger.info('[LangChainTraceInstrumentor] Enabling LangChain instrumentation');

    // Let OpenTelemetry patch the module when it's required/imported
    super.enable();
  }

  public override disable(): void {
    this._hasBeenEnabled = false;
     logger.info('[LangChainTraceInstrumentor] Disabling LangChain instrumentation');
    super.disable();
  }
}

export function addTracerToHandlers(tracer: Tracer, handlers: CallbackManagerModule.Callbacks | undefined) :  CallbackManagerModule.Callbacks{
 if (handlers == null) {
    return [new LangChainTracer(tracer)];
  }
  
  if (Array.isArray(handlers)) {
    const alreadyAdded = handlers.some(
      (handler) => handler instanceof LangChainTracer
    );

    if (alreadyAdded) {
      return handlers;
    }
    handlers.push(new LangChainTracer(tracer));
    return handlers;
  }

   if(handlers.inheritableHandlers.some(
      (handler) => handler instanceof LangChainTracer,
    )) {
    return handlers;
  }

  handlers.addHandler(new LangChainTracer(tracer), true);
  return handlers;
}
