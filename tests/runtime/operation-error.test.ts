// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { OperationError } from '../../packages/agents-a365-runtime/src/operation-error';

describe('OperationError', () => {
  it('should create an instance with an exception', () => {
    const error = new Error('Test error');
    const operationError = new OperationError(error);

    expect(operationError).toBeDefined();
    expect(operationError.exception).toBe(error);
    expect(operationError.message).toBe('Test error');
  });

  it('should throw if exception is null', () => {
    expect(() => new OperationError(null as unknown as Error)).toThrow('exception is required');
  });

  it('should throw if exception is undefined', () => {
    expect(() => new OperationError(undefined as unknown as Error)).toThrow('exception is required');
  });

  it('should return exception string from toString', () => {
    const error = new Error('Test error message');
    const operationError = new OperationError(error);

    const result = operationError.toString();
    expect(result).toContain('Test error message');
  });

  it('should preserve exception type information', () => {
    class CustomError extends Error {
      code: string;
      constructor(message: string, code: string) {
        super(message);
        this.code = code;
      }
    }

    const customError = new CustomError('Custom error', 'ERR_CUSTOM');
    const operationError = new OperationError(customError);

    expect(operationError.exception).toBeInstanceOf(CustomError);
    expect((operationError.exception as CustomError).code).toBe('ERR_CUSTOM');
  });
});
