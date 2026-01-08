// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { OperationError } from './operation-error';

/**
 * Represents the result of an operation.
 */
export class OperationResult {
  private static readonly _success = new OperationResult(true);
  private readonly _errors: OperationError[];

  /**
   * Gets a flag indicating whether the operation succeeded.
   */
  public readonly succeeded: boolean;

  /**
   * Gets an array of OperationError instances indicating errors that occurred during the operation.
   */
  public get errors(): OperationError[] {
    return this._errors || [];
  }

  /**
   * Private constructor for OperationResult.
   * @param succeeded Whether the operation succeeded.
   * @param errors Optional array of errors.
   */
  private constructor(succeeded: boolean, errors?: OperationError[]) {
    this.succeeded = succeeded;
    this._errors = errors || [];
  }

  /**
   * Returns an OperationResult indicating a successful operation.
   */
  public static get success(): OperationResult {
    return OperationResult._success;
  }

  /**
   * Creates an OperationResult indicating a failed operation, with a list of errors if applicable.
   * @param errors An optional array of OperationError which caused the operation to fail.
   * @returns An OperationResult indicating a failed operation, with a list of errors if applicable.
   */
  public static failed(...errors: OperationError[]): OperationResult {
    return new OperationResult(false, errors.length > 0 ? errors : []);
  }

  /**
   * Converts the value of the current OperationResult object to its equivalent string representation.
   * @returns A string representation of the current OperationResult object.
   * @remarks
   * If the operation was successful the toString() will return "Succeeded" otherwise it will return
   * "Failed : " followed by a comma delimited list of error messages from its errors collection, if any.
   */
  public toString(): string {
    if (this.succeeded) {
      return 'Succeeded';
    }
    
    const errorMessages = this.errors.map(e => e.message).join(', ');
    return `Failed : ${errorMessages}`;
  }
}
