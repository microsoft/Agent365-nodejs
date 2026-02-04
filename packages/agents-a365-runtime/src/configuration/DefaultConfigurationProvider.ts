// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { IConfigurationProvider } from './IConfigurationProvider';
import { RuntimeConfiguration } from './RuntimeConfiguration';

/**
 * Default provider that returns environment-based configuration.
 * Use the static `instance` for shared access across the application.
 */
export class DefaultConfigurationProvider<T extends RuntimeConfiguration>
  implements IConfigurationProvider<T> {

  private readonly _configuration: T;

  constructor(factory: () => T) {
    this._configuration = factory();
  }

  getConfiguration(): T {
    return this._configuration;
  }
}

/**
 * Shared default provider for RuntimeConfiguration.
 */
export const defaultRuntimeConfigurationProvider =
  new DefaultConfigurationProvider(() => new RuntimeConfiguration());
