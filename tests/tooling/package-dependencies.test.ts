// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('tooling runtime dependencies', () => {
  it('declares axios directly rather than relying on workspace hoisting', () => {
    const manifest = JSON.parse(readFileSync(
      join(__dirname, '../../packages/agents-a365-tooling/package.json'), 'utf8',
    ));

    expect(manifest.dependencies).toHaveProperty('axios', 'catalog:');
  });
});
