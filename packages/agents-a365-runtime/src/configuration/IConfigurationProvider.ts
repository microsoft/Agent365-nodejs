// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Generic interface for providing configuration.
 * Each package defines its own configuration type T.
 */
export interface IConfigurationProvider<T> {
  getConfiguration(): T;
}
