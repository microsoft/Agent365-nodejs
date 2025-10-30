import {
  TurnState,
  AgentApplication,
  AttachmentDownloader,
  MemoryStorage,
  TurnContext,
} from '@microsoft/agents-hosting';
import { Activity, ActivityTypes } from '@microsoft/agents-activity';
import {
  BaggageBuilder,
  InferenceScope,
  InvokeAgentDetails,
  InvokeAgentScope,
  ExecuteToolScope,
  TenantDetails,
  AgentDetails,
  ToolCallDetails,
  InferenceDetails,
  InferenceOperationType,
  ExecutionType,
} from '@microsoft/agents-a365-observability';
import { getObservabilityAuthenticationScope } from '@microsoft/agents-a365-runtime';

import tokenCache from './token-cache'; 
interface ConversationState {
  count: number;
}
type ApplicationTurnState = TurnState<ConversationState>;

const downloader = new AttachmentDownloader();

const storage = new MemoryStorage();

export const agentApplication = new AgentApplication<ApplicationTurnState>({
  authorization: {
        agentic: { } // We have the type and scopes set in the .env file
      },
  storage,
  fileDownloaders: [downloader],
});

agentApplication.onActivity(
  ActivityTypes.Message,
  async (context: TurnContext, state: ApplicationTurnState) => {
    // Increment count state
    let count = state.conversation.count ?? 0;
    state.conversation.count = ++count;

    // Extract agent and tenant details from context
    const agentInfo = createAgentDetails(context);
    const tenantInfo = createTenantDetails(context);

    // Create BaggageBuilder scope
    const baggageScope = new BaggageBuilder()
      .tenantId(tenantInfo.tenantId)
      .agentId(agentInfo.agentId)
      .correlationId("7ff6dca0-917c-4bb0-b31a-794e533d8aad")
      .agentName(agentInfo.agentName)
      .conversationId(context.activity.conversation?.id)
      .build();

    // Run the rest of the logic within the baggage scope
    await baggageScope.run(async () => {
      const invokeAgentDetails: InvokeAgentDetails = {
        agentId: agentInfo.agentId,
        agentName: agentInfo.agentName,
        conversationId: context.activity.conversation?.id,
        request: {
          content: context.activity.text || 'Unknown text',
          executionType: ExecutionType.HumanToAgent,
          sessionId: context.activity.conversation?.id,
        }
      };

      const tenantDetails: TenantDetails = {
        tenantId: tenantInfo.tenantId,
      };
      
    const invokeAgentScope = InvokeAgentScope.start(invokeAgentDetails, tenantDetails);

    await invokeAgentScope.withActiveSpanAsync(async () => {
      // Record input message
      invokeAgentScope.recordInputMessages([context.activity.text ?? 'Unknown text']);
      
      await context.sendActivity(`Preparing a response to your query (message #${state.conversation.count})...`);

      await context.sendActivity('typing...');


        // Cache the agentic token for observability token resolver
      // const aauToken = await agentApplication.authorization.exchangeToken(context, ['https://api.powerplatform.com/.default'],'agentic')
      const aauToken = await agentApplication.authorization.exchangeToken(context,'agentic', {
        scopes: getObservabilityAuthenticationScope() 
      } )
      const cacheKey = createAgenticTokenCacheKey(agentInfo.agentId, tenantInfo.tenantId);
      tokenCache.set(cacheKey, aauToken?.token || '');

      await context.sendActivity(`(Agentic) You said: ${context.activity.text}, user token length=${aauToken.token?.length ?? 0}`);

      const llmResponse = await performInference(
        context.activity.text ?? 'Unknown text',
        context
      );

      await context.sendActivity(`LLM Response: ${llmResponse}`);

      await context.sendActivity('Now performing a tool call...');

      await context.sendActivity('typing');

      const toolResponse = await performToolCall(context);

      await context.sendActivity(`Tool Response: ${toolResponse}`);
      
      // Record output messages
      invokeAgentScope.recordOutputMessages([
        `LLM Response: ${llmResponse}`,
        `Tool Response: ${toolResponse}`
      ]);
    });

    invokeAgentScope.dispose();
    }); // Close the baggage scope run
  }
);

// Sample LLM/AI model inference function
async function performInference(prompt: string, context: TurnContext): Promise<string> {
  // Create the inference (child) scope while the invoke span is active
  const agentInfo = createAgentDetails(context);
  const tenantInfo = createTenantDetails(context);
  
  const agentDetails: AgentDetails = {
    agentId: agentInfo.agentId,
    agentName: agentInfo.agentName,
    conversationId: context.activity.conversation?.id,
  };

  const tenantDetails: TenantDetails = {
    tenantId: tenantInfo.tenantId,
  };

  const inferenceDetails: InferenceDetails = {
    operationName: InferenceOperationType.CHAT,
    model: 'gpt-4',
    providerName: 'openai',
    inputTokens: 45,
    outputTokens: 78,
    responseId: `resp-${Date.now()}`,
    finishReasons: ['stop']
  };

  const scope = InferenceScope.start(inferenceDetails, agentDetails, tenantDetails);

  try {
    // Activate the inference span for the inference work
    const result = await scope.withActiveSpanAsync(async () => {
      // Simulate LLM inference call (this runs with the inference span active,
      // and the invoke-agent span will be the parent)
      await new Promise((resolve) => setTimeout(resolve, 4000));

      const response = `Based on my analysis of "${prompt}", I recommend checking policy documents XYZ and ensuring proper data handling procedures.`;

      // Record the inference details using granular methods
      scope.recordInputMessages([`Analyze the following compliance query: ${prompt}`]);
      scope.recordOutputMessages([response]);
      scope.recordInputTokens(52);  // Updated token count
      scope.recordOutputTokens(85); // Updated token count
      scope.recordResponseId(`resp-${Date.now()}`);
      scope.recordFinishReasons(['stop']);

      return response;
    });

    return result;
  } catch (error) {
    // Record error on the inference scope and rethrow so the caller can handle it
    scope.recordError(error as Error);
    throw error;
  } finally {
    // Always end the inference span
    scope.dispose();
  }
}

// Helper functions to extract agent and tenant details from context
function createAgentDetails(context: TurnContext): { agentId: string; agentName?: string } {
  // Debug: Log the activity recipient to see what's available
  console.log('🔍 Activity recipient:', JSON.stringify(context.activity.recipient, null, 2));
  
  // Extract agent ID from activity recipient - use agenticAppId (camelCase, not underscore)
  const agentId = (context.activity.recipient as any)?.agenticAppId 
    || process.env.AGENT_ID 
    || 'sample-agent';
  
  console.log(`🎯 Agent ID: ${agentId} (from ${(context.activity.recipient as any)?.agenticAppId ? 'activity.recipient.agenticAppId' : 'environment/fallback'})`);
  
  return {
    agentId: agentId,
    agentName: (context.activity.recipient as any)?.name || process.env.AGENT_NAME || 'Basic Agent Sample',
  };
}

function createTenantDetails(context: TurnContext): { tenantId: string } {
  // First try to extract tenant ID from activity recipient - use tenantId (camelCase)
  let tenantId = (context.activity.recipient as any)?.tenantId;
  
  // Fall back to environment variable if not found in activity
  if (!tenantId) {
    tenantId = process.env.connections__serviceConnection__settings__tenantId || 'sample-tenant';
  }
  
  console.log(`🏢 Tenant ID: ${tenantId} (from ${(context.activity.recipient as any)?.tenantId ? 'activity.recipient.tenantId' : 'environment/fallback'})`);
  
  return {
    tenantId: tenantId,
  };
}

export function createAgenticTokenCacheKey(agentId: string, tenantId?: string): string {
  return tenantId ? `agentic-token-${agentId}-${tenantId}` : `agentic-token-${agentId}`;
}

async function performToolCall(context: TurnContext): Promise<string> {
  // Simulate tool call using ExecuteToolScope
  const agentInfo = createAgentDetails(context);
  const tenantInfo = createTenantDetails(context);
  
  const toolDetails: ToolCallDetails = {
    toolName: 'send-email',
    arguments: JSON.stringify({ recipient: 'user@example.com', subject: 'Hello', body: 'Test email' }),
    toolCallId: `tool-${Date.now()}`,
    description: 'Sends an email to the specified recipient',
    toolType: 'function'
  };

  const agentDetails: AgentDetails = {
    agentId: agentInfo.agentId,
    agentName: agentInfo.agentName,
    conversationId: context.activity.conversation?.id,
  };

  const tenantDetails: TenantDetails = {
    tenantId: tenantInfo.tenantId,
  };

  const scope = ExecuteToolScope.start(toolDetails, agentDetails, tenantDetails);

  try {
    const result = await scope.withActiveSpanAsync(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const response = 'Email sent successfully to user@example.com';
      
      // Record the tool execution response
      scope.recordResponse(response);
      
      return response;
    });

    return result;
  } catch (error) {
    scope.recordError(error as Error);
    throw error;
  } finally {
    scope.dispose();
  }
}
