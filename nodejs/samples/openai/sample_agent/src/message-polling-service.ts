// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TurnContext } from '@microsoft/agents-hosting';

/**
 * MessagePollingService demonstrates a pattern for polling and processing messages.
 * This service can be used to periodically check for new messages or updates
 * and process them asynchronously.
 */
export class MessagePollingService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private pollIntervalMs: number;
  private messageQueue: Array<{ context: TurnContext; timestamp: Date }> = [];

  constructor(pollIntervalMs: number = 5000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /**
   * Starts the polling service.
   * @param onMessage - Callback function to process messages
   */
  start(onMessage: (context: TurnContext) => Promise<void>): void {
    if (this.isRunning) {
      console.warn('Polling service is already running');
      return;
    }

    console.log(`Starting message polling service (interval: ${this.pollIntervalMs}ms)`);
    this.isRunning = true;

    this.pollingInterval = setInterval(async () => {
      await this.poll(onMessage);
    }, this.pollIntervalMs);
  }

  /**
   * Stops the polling service.
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('Polling service is not running');
      return;
    }

    console.log('Stopping message polling service');
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isRunning = false;
  }

  /**
   * Adds a message to the queue for processing.
   * @param context - The turn context to queue
   */
  queueMessage(context: TurnContext): void {
    this.messageQueue.push({
      context,
      timestamp: new Date(),
    });
    console.log(`Message queued (queue size: ${this.messageQueue.length})`);
  }

  /**
   * Gets the current queue size.
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  /**
   * Clears all messages from the queue.
   */
  clearQueue(): void {
    this.messageQueue = [];
    console.log('Message queue cleared');
  }

  /**
   * Internal polling method that processes queued messages.
   */
  private async poll(onMessage: (context: TurnContext) => Promise<void>): Promise<void> {
    if (this.messageQueue.length === 0) {
      return;
    }

    console.log(`Processing ${this.messageQueue.length} queued message(s)`);

    // Process messages in order
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      if (item) {
        try {
          await onMessage(item.context);
          console.log(`Message processed (queued at: ${item.timestamp.toISOString()})`);
        } catch (error) {
          console.error('Error processing queued message:', error);
          // Optionally re-queue the message or handle the error
        }
      }
    }
  }

  /**
   * Checks if the service is currently running.
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Gets statistics about the polling service.
   */
  getStats(): { isRunning: boolean; queueSize: number; pollInterval: number } {
    return {
      isRunning: this.isRunning,
      queueSize: this.messageQueue.length,
      pollInterval: this.pollIntervalMs,
    };
  }
}
