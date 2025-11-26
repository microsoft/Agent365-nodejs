// ------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------------------------

import {
  Builder,
  ObservabilityManager,
  Agent365ExporterOptions
} from '@microsoft/agents-a365-observability';
import { createAgenticTokenCacheKey } from './agent';
import tokenCache from './token-cache';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';
import { AgenticTokenCacheInstance } from '@microsoft/agents-a365-observability-hosting';

// Configure observability with token resolver (like Python's token_resolver function)  
const tokenResolver = (agentId: string, tenantId: string): string | null => {
  try {    
    // Use cached agentic token from agent authentication with shared cache key method
    const cacheKey = createAgenticTokenCacheKey(agentId, tenantId);
    const cachedToken = tokenCache.get(cacheKey);
    
    if (cachedToken) {      
      return cachedToken;
    } else {      
      return null;
    }
  } catch (error) {
    console.error(`❌ Error resolving token for agent ${agentId}, tenant ${tenantId}:`, error);
    return null;
  }
};

const getClusterCategory = (): ClusterCategory => {
  const category = process.env.CLUSTER_CATEGORY;  
  if (category) {
    return category as ClusterCategory;
  }
  return 'prod' as ClusterCategory; // Safe fallback
};

// Configure observability builder (conditionally adding token resolver based on env flag)
export const a365Observability = ObservabilityManager.configure((builder: Builder) => {
  const exporterOptions = new Agent365ExporterOptions();
  exporterOptions.maxQueueSize = 10; // customized per request

  builder
    .withService('TypeScript Sample Agent', '1.0.0')
    .withClusterCategory(getClusterCategory())
    .withExporterOptions(exporterOptions);
  // Opt-in custom token resolver via env flag `Use_Custom_Resolver=true`
  if (process.env.Use_Custom_Resolver === 'true') {
    builder.withTokenResolver(tokenResolver);
  }
  else {
    // use resolver from observability token cache package
    builder.withTokenResolver((agentId: string, tenantId: string) => AgenticTokenCacheInstance.getObservabilityToken(agentId, tenantId));
  }
});


