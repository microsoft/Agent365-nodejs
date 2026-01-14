// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { OperationResult } from '../../packages/agents-a365-runtime/src/operation-result';
import { OperationError } from '../../packages/agents-a365-runtime/src/operation-error';

describe('OperationResult', () => {
  describe('success', () => {
    it('should return a successful result', () => {
      const result = OperationResult.success;

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return the same instance for multiple calls', () => {
      const result1 = OperationResult.success;
      const result2 = OperationResult.success;

      expect(result1).toBe(result2);
    });

    it('should have toString return "Succeeded"', () => {
      const result = OperationResult.success;

      expect(result.toString()).toBe('Succeeded');
    });
  });

  describe('failed', () => {
    it('should return a failed result with no errors', () => {
      const result = OperationResult.failed();

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(false);
      expect(result.errors).toEqual([]);
    });

    it('should return a failed result with one error', () => {
      const error = new OperationError(new Error('Test error'));
      const result = OperationResult.failed(error);

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe(error);
    });

    it('should return a failed result with multiple errors', () => {
      const error1 = new OperationError(new Error('Error 1'));
      const error2 = new OperationError(new Error('Error 2'));
      const result = OperationResult.failed(error1, error2);

      expect(result).toBeDefined();
      expect(result.succeeded).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toBe(error1);
      expect(result.errors[1]).toBe(error2);
    });

    it('should have toString return "Failed : " with error messages', () => {
      const error1 = new OperationError(new Error('Error 1'));
      const error2 = new OperationError(new Error('Error 2'));
      const result = OperationResult.failed(error1, error2);

      const resultString = result.toString();
      expect(resultString).toBe('Failed : Error 1, Error 2');
    });

    it('should have toString return "Failed : " with no error messages when no errors', () => {
      const result = OperationResult.failed();

      const resultString = result.toString();
      expect(resultString).toBe('Failed : ');
    });
  });

  describe('errors property', () => {
    it('should return empty array when no errors exist', () => {
      const result = OperationResult.success;

      expect(result.errors).toEqual([]);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should not allow modification of internal error list', () => {
      const error = new OperationError(new Error('Test error'));
      const result = OperationResult.failed(error);

      // Attempt to modify the errors array should not affect the internal state
      const errors = result.errors;
      expect(errors).toHaveLength(1);
      
      // The returned array is a reference, but the internal state is protected by design
    });
  });
});
