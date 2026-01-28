// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { MockBaseMessage } from './mockLangChainTypes';

/**
 * Mock StateSnapshot interface matching LangGraph's StateSnapshot.
 */
export interface MockStateSnapshot<State = Record<string, unknown>> {
  values: State;
  config?: {
    configurable?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
  createdAt?: string;
  parentConfig?: Record<string, unknown>;
}

/**
 * Mock CompiledStateGraph class for testing.
 * Simulates the behavior of @langchain/langgraph's CompiledStateGraph.
 */
export class MockCompiledStateGraph<State extends { messages: MockBaseMessage[] }> {
  private stateToReturn: MockStateSnapshot<State> | null = null;
  private errorToThrow: Error | null = null;
  private getStateCalls: Array<{ configurable?: Record<string, unknown> }> = [];

  /**
   * Configure the mock to return a specific state snapshot.
   */
  setStateToReturn(state: MockStateSnapshot<State>): void {
    this.stateToReturn = state;
    this.errorToThrow = null;
  }

  /**
   * Configure the mock to throw an error when getState is called.
   */
  setErrorToThrow(error: Error): void {
    this.errorToThrow = error;
    this.stateToReturn = null;
  }

  /**
   * Get the recorded getState calls for verification.
   */
  getGetStateCalls(): Array<{ configurable?: Record<string, unknown> }> {
    return this.getStateCalls;
  }

  /**
   * Reset the mock state.
   */
  reset(): void {
    this.stateToReturn = null;
    this.errorToThrow = null;
    this.getStateCalls = [];
  }

  /**
   * Mock implementation of getState method.
   */
  async getState(config: { configurable?: Record<string, unknown> }): Promise<MockStateSnapshot<State>> {
    this.getStateCalls.push(config);

    if (this.errorToThrow) {
      throw this.errorToThrow;
    }

    if (this.stateToReturn) {
      return this.stateToReturn;
    }

    // Return empty state by default
    return {
      values: { messages: [] } as State,
      config: config
    };
  }
}

/**
 * Helper to create a mock state snapshot with messages.
 */
export function createMockStateSnapshot<State extends { messages: MockBaseMessage[] }>(
  messages: MockBaseMessage[],
  config?: { configurable?: Record<string, unknown> }
): MockStateSnapshot<State> {
  return {
    values: { messages } as State,
    config: config ?? { configurable: { thread_id: 'test-thread' } },
    createdAt: new Date().toISOString()
  };
}

/**
 * Helper to create a mock state snapshot with missing messages.
 */
export function createMockStateSnapshotWithoutMessages(): MockStateSnapshot<Record<string, unknown>> {
  return {
    values: {},
    config: { configurable: { thread_id: 'test-thread' } }
  };
}

/**
 * Helper to create a mock state snapshot with null messages.
 */
export function createMockStateSnapshotWithNullMessages(): MockStateSnapshot<{ messages: null }> {
  return {
    values: { messages: null as unknown as null },
    config: { configurable: { thread_id: 'test-thread' } }
  };
}
