// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Encapsulates an error from an operation.
 */
export class OperationError {
  /**
   * Gets the exception associated with the error.
   */
  public readonly exception: Error;

  /**
   * Gets the message associated with the error.
   */
  public get message(): string {
    return this.exception.message;
  }

  /**
   * Initializes a new instance of the OperationError class.
   * @param exception The exception associated with the error.
   */
  constructor(exception: Error) {
    if (!exception) {
      throw new Error('exception is required');
    }
    this.exception = exception;
  }

  /**
   * Returns a string representation of the error.
   * @returns A string representation of the error.
   */
  public toString(): string {
    return this.exception.toString();
  }
}
