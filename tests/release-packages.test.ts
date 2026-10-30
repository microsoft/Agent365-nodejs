// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

function packageFixture(name: string, files: Record<string, string>, extraFiles: Record<string, string> = {}) {
  const dir = path.join(fixture, name);
  mkdirSync(path.join(dir, 'package'), { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, 'package', file), content);
  }
  for (const [file, content] of Object.entries(extraFiles)) {
    writeFileSync(path.join(dir, file), content);
  }
  execFileSync('tar', [
    '-czf', path.join(fixture, `${name}.tgz`), '-C', dir, '--', 'package', ...Object.keys(extraFiles),
  ]);
}

function maintainedPackageFixtures(extraFiles: Record<string, string> = {}) {
  for (const suffix of [
    'notifications', 'runtime', 'tooling', 'tooling-extensions-claude',
    'tooling-extensions-langchain', 'tooling-extensions-openai',
  ]) {
    packageFixture(suffix, {
      'package.json': JSON.stringify({
        name: `@microsoft/agents-a365-${suffix}`, version: '1.0.0',
        main: 'index.js', module: 'index.js', types: 'index.d.ts',
        dependencies: { external: '^1.0.0', alias: 'npm:external@^1.0.0' },
      }),
      'index.js': 'exports.maintained = true;',
      'index.d.ts': 'export declare const maintained: boolean;',
      'CHANGELOG.md': 'Historical: @microsoft/agents-a365-observability',
    }, extraFiles);
  }
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

it.each(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap(
  section => ['catalog:', 'workspace:*'].map(specification => [section, specification]),
))('rejects unresolved %s specification %s', (section, specification) => {
  packageFixture('runtime', {
    'package.json': JSON.stringify({
      name: '@microsoft/agents-a365-runtime', version: '1.0.0',
      [section]: { external: specification },
    }),
  });
  const result = spawnSync(process.execPath, [script, '--verify', fixture], { encoding: 'utf8' });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Unresolved dependency specification/);
});

it('rejects npm packaging before creating output or running build commands', () => {
  const destination = path.join(fixture, 'release');
  const result = spawnSync(process.execPath, [script, destination], {
    encoding: 'utf8',
    env: {
      ...process.env,
      npm_execpath: path.join(fixture, 'npm-cli.js'),
      npm_config_user_agent: 'npm/10.9.2 node/v22.14.0',
    },
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(/Run packaging through pnpm run pack/);
  expect(existsSync(destination)).toBe(false);
});

it('accepts exactly six clean packages with complete entry points', () => {
  maintainedPackageFixtures();
  const result = spawnSync(process.execPath, [script, '--verify', fixture], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toHaveLength(6);
});

it('treats option-shaped archive member names as literal filenames', () => {
  maintainedPackageFixtures({ '--not-a-tar-option.js': 'exports.maintained = true;' });
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

it('does not start root release packaging from recursive workspace pack scripts', () => {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli || !process.env.npm_config_user_agent?.startsWith('pnpm/')) {
    throw new Error('Run release tests through pnpm test.');
  }
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const workspaces: string[] = manifest.workspaces.filter((workspace: string) =>
    workspace.startsWith('packages/'));
  const marker = path.join(fixture, 'release-started');
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({
    private: true, scripts: { pack: 'node pack.cjs' },
  }));
  writeFileSync(path.join(fixture, 'pack.cjs'),
    "require('node:fs').writeFileSync('release-started', 'true');");
  writeFileSync(path.join(fixture, 'pnpm-workspace.yaml'),
    `packages:\n${workspaces.map(workspace => `  - ${JSON.stringify(workspace)}`).join('\n')}\n`);
  for (const workspace of workspaces) {
    const source = JSON.parse(readFileSync(path.join(root, workspace, 'package.json'), 'utf8'));
    const directory = path.join(fixture, workspace);
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
      name: source.name, version: source.version, scripts: source.scripts,
    }));
  }
  const result = spawnSync(process.execPath,
    [pnpmCli, '--include-workspace-root=false', '-r', '--if-present', 'run', 'pack'], {
      cwd: fixture, encoding: 'utf8', timeout: 30000,
    });
  expect(result.error).toBeUndefined();
  expect(existsSync(marker)).toBe(false);
  expect(result.status).toBe(0);
});
