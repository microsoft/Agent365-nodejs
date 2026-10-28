// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const script = path.resolve(__dirname, '../packPackages.js');
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(path.join(tmpdir(), 'a365-release-test-'));
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function packageFixture(name: string, files: Record<string, string>) {
  const dir = path.join(fixture, name);
  mkdirSync(path.join(dir, 'package'), { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, 'package', file), content);
  }
  execFileSync('tar', ['-czf', path.join(fixture, `${name}.tgz`), '-C', dir, 'package']);
}

it('rejects a retired package even when its tarball has an innocent filename', () => {
  packageFixture('runtime', {
    'package.json': JSON.stringify({ name: '@microsoft/agents-a365-observability', version: '1.0.0' }),
  });
  const result = spawnSync(process.execPath, [script, '--verify', fixture], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Unexpected package/);
});

it('rejects bundled retired implementations in an allowed package', () => {
  packageFixture('runtime', {
    'package.json': JSON.stringify({ name: '@microsoft/agents-a365-runtime', version: '1.0.0' }),
    'index.js': 'class ObservabilityManager {}',
  });
  const result = spawnSync(process.execPath, [script, '--verify', fixture], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Retired implementation/);
});

it.each(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])(
  'rejects retired dependencies in %s', section => {
    packageFixture('runtime', {
      'package.json': JSON.stringify({
        name: '@microsoft/agents-a365-runtime',
        version: '1.0.0',
        [section]: { '@microsoft/agents-a365-observability-hosting': '1.0.0' },
      }),
    });
    const result = spawnSync(process.execPath, [script, '--verify', fixture], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/Retired dependency/);
  });

it('accepts exactly six clean packages with complete entry points', () => {
  for (const suffix of [
    'notifications', 'runtime', 'tooling', 'tooling-extensions-claude',
    'tooling-extensions-langchain', 'tooling-extensions-openai',
  ]) {
    packageFixture(suffix, {
      'package.json': JSON.stringify({
        name: `@microsoft/agents-a365-${suffix}`, version: '1.0.0',
        main: 'index.js', module: 'index.js', types: 'index.d.ts',
      }),
      'index.js': 'exports.maintained = true;',
      'index.d.ts': 'export declare const maintained: boolean;',
      'CHANGELOG.md': 'Historical: @microsoft/agents-a365-observability',
    });
  }
  const result = spawnSync(process.execPath, [script, '--verify', fixture], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toHaveLength(6);
});

it('rejects an incomplete release even if the remaining tarball is valid', () => {
  packageFixture('runtime', {
    'package.json': JSON.stringify({
      name: '@microsoft/agents-a365-runtime', version: '1.0.0',
      main: 'index.js', module: 'index.js', types: 'index.d.ts',
    }),
    'index.js': 'exports.maintained = true;',
    'index.d.ts': 'export declare const maintained: boolean;',
  });
  const result = spawnSync(process.execPath, [script, '--verify', fixture], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Expected exactly 6 maintained packages/);
});

it('keeps release selection explicit rather than collecting cached wildcard tarballs', () => {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  expect(manifest.workspaces.filter((workspace: string) => workspace.startsWith('packages/')))
    .toHaveLength(6);
  expect(manifest.workspaces.some((workspace: string) => workspace.includes('*'))).toBe(false);
});
