import {
  Builder,
  ObservabilityManager
} from '@microsoft/agents-a365-observability';

import { createAgenticTokenCacheKey } from './agent';
import tokenCache from './token-cache';
import { ClusterCategory } from '@microsoft/agents-a365-runtime';

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
  return 'dev' as ClusterCategory; // Safe fallback
};

export const a365Observability = ObservabilityManager.configure(
  (builder: Builder) =>
    builder            
      .withService('TypeScript Sample Agent', '1.0.0')
      //.withTokenResolver(tokenResolver)
      .withClusterCategory(getClusterCategory())
);


