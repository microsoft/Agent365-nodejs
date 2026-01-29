// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type * as CallbackManagerModule from "@langchain/core/callbacks/manager";
import { trace, Tracer } from "@opentelemetry/api";
import {
  InstrumentationBase,
  InstrumentationConfig,
  InstrumentationModuleDefinition,
  isWrapped
} from "@opentelemetry/instrumentation";
import { logger, ObservabilityManager } from "@microsoft/agents-a365-observability";
import { LangChainTracer } from "./tracer";

export interface LangChainInstrumentationConfig extends InstrumentationConfig {
  enabled?: boolean;
  tracerName?: string;
  tracerVersion?: string;
}

type CallbackManagerModuleType = typeof CallbackManagerModule;

let isPatched = false;

export class LangChainTraceInstrumentor extends InstrumentationBase<LangChainInstrumentationConfig> {
  private static _instance: LangChainTraceInstrumentor | null = null;
  private _hasBeenEnabled = false;
  protected otelTracer: Tracer;

  constructor(config: LangChainInstrumentationConfig = {}) {
    if (LangChainTraceInstrumentor._instance !== null) {
      throw new Error("LangChainTraceInstrumentor can only be instantiated once.");
    }

    if (!ObservabilityManager.getInstance()) {
      throw new Error(
        "ObservabilityManager is not configured yet. "
        + "Please configure ObservabilityManager before initializing this instrumentor."
      );
    }

    super("agent365-langchain-instrumentor", "1.0.0", {
      enabled: false,
      ...config
    });

    this.otelTracer = trace.getTracer(
      this._config.tracerName ?? "agent365-langchain",
      this._config.tracerVersion
    );

    LangChainTraceInstrumentor._instance = this;
  }

  static getInstance(): LangChainTraceInstrumentor | null {
    return LangChainTraceInstrumentor._instance;
  }

  static resetInstance(): void {
    LangChainTraceInstrumentor._instance = null;
    isPatched = false;
  }

  protected init(): InstrumentationModuleDefinition {
    return {
      name: "@langchain/core/callbacks/manager",
      supportedVersions: [">=0.2.0"],
      files: [],
      patch: this.patch.bind(this),
      unpatch: this.unpatch.bind(this)
    };
  }

  private unpatch(moduleExports: Record<string, unknown>): void {
    const CallbackManager = moduleExports?.CallbackManager as typeof CallbackManagerModule.CallbackManager;
    if (!CallbackManager || !isWrapped(CallbackManager._configureSync)) {
      return;
    }

    this._unwrap(CallbackManager, "_configureSync");
    isPatched = false;
    logger.info("[LangChainTraceInstrumentor] Unpatched OTEL LangChain instrumentation");
  }

  patch(module: CallbackManagerModuleType): CallbackManagerModuleType {
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
        ...args: Parameters<typeof CallbackManager["_configureSync"]>
      ) {
        args[0] = addTracerToHandlers(instrumentor.otelTracer, args[0]);
        logger.info("[LangChainTraceInstrumentor] _configureSync wrapped to add LangChainTracer");
        return original.apply(this, args);
      };
    });

    logger.info("[LangChainTraceInstrumentor] Patched OTEL LangChain instrumentation");
    isPatched = true;
    return module;
  }

  manuallyInstrument(module: CallbackManagerModuleType): void {
    logger.info("Manually instrumenting CallbackManagerModule");
    this.patch(module);
  }

  public instrumentationDependencies(): readonly string[] {
    return ["@langchain/core >= 0.2.0"] as const;
  }

  public override enable(): void {
    if (this._hasBeenEnabled) {
      return;
    }
    this._hasBeenEnabled = true;
    logger.info("[LangChainTraceInstrumentor] Enabled LangChain instrumentation");
    super.enable();
  }

  public override disable(): void {
    this._hasBeenEnabled = false;
    logger.info("[LangChainTraceInstrumentor] Disabled LangChain instrumentation");
    super.disable();
  }
}

function addTracerToHandlers(
  tracer: Tracer,
  handlers: CallbackManagerModule.Callbacks | undefined
): CallbackManagerModule.Callbacks {
  if (handlers == null) {
    return [new LangChainTracer(tracer)];
  }

  if (Array.isArray(handlers)) {
    if (!handlers.some((h) => h instanceof LangChainTracer)) {
      handlers.push(new LangChainTracer(tracer));
    }
    return handlers;
  }

  if (!handlers.inheritableHandlers.some((h) => h instanceof LangChainTracer)) {
    handlers.addHandler(new LangChainTracer(tracer), true);
  }
  return handlers;
}
