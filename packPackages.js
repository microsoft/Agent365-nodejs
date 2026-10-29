// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const workspaces = rootManifest.workspaces.filter(dir => dir.startsWith('packages/'));
const allowedNames = new Set([
  '@microsoft/agents-a365-notifications',
  '@microsoft/agents-a365-runtime',
  '@microsoft/agents-a365-tooling',
  '@microsoft/agents-a365-tooling-extensions-claude',
  '@microsoft/agents-a365-tooling-extensions-langchain',
  '@microsoft/agents-a365-tooling-extensions-openai',
]);
const retiredDependency = /^@microsoft\/agents-a365-observability(?:$|-)/;
const retiredCode = /@microsoft\/agents-a365-observability|ObservabilityManager|ObservabilityBuilder|PerRequestSpanProcessor|LangChainTraceInstrumentor|OpenAIAgentsTraceInstrumentor|OpenAIAgentsTraceProcessor|Agent365Exporter|BaggageMiddleware|OutputLoggingMiddleware/;

function assertManifest(manifest, requireResolvedDependencies = false) {
  if (!allowedNames.has(manifest.name)) {
    throw new Error(`Unexpected package: ${manifest.name}`);
  }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, specification] of Object.entries(manifest[section] ?? {})) {
      if (retiredDependency.test(name)) {
        throw new Error(`Retired dependency: ${manifest.name} -> ${name} (${section})`);
      }
      if (requireResolvedDependencies && /^(?:catalog|workspace):/.test(specification)) {
        throw new Error(`Unresolved dependency specification: ${manifest.name} -> ${name} (${section}): ${specification}`);
      }
    }
  }
}

function verify(directory) {
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.tgz')).sort();
  const packages = [];
  const seen = new Set();
  for (const file of files) {
    const tarball = path.join(directory, file);
    const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split(/\r?\n/);
    if (!entries.includes('package/package.json')) {
      throw new Error(`Missing package manifest: ${file}`);
    }
    const readEntry = entry => execFileSync('tar', ['-xOzf', tarball, '--', entry], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const manifest = JSON.parse(readEntry('package/package.json'));
    assertManifest(manifest, true);
    if (seen.has(manifest.name)) {
      throw new Error(`Duplicate package: ${manifest.name}`);
    }
    seen.add(manifest.name);
    for (const entry of entries) {
      if (/observability/i.test(entry)) {
        throw new Error(`Retired implementation path: ${file}: ${entry}`);
      }
      if (/\.(?:[cm]?js|tsx?|json|map)$/.test(entry) && retiredCode.test(readEntry(entry))) {
        throw new Error(`Retired implementation: ${file}: ${entry}`);
      }
    }
    for (const entry of [manifest.main, manifest.module, manifest.types]) {
      if (!entry || !entries.includes(`package/${entry.replace(/^\.\//, '')}`)) {
        throw new Error(`Missing entry point in ${file}: ${entry}`);
      }
    }
    packages.push({
      name: manifest.name,
      version: manifest.version,
      tarball: file,
      sha256: createHash('sha256').update(fs.readFileSync(tarball)).digest('hex'),
    });
  }
  if (seen.size !== allowedNames.size) {
    throw new Error(`Expected exactly ${allowedNames.size} maintained packages; found ${seen.size}`);
  }
  return packages;
}

// Use pnpm's JS entry point rather than shell execution (also works on Windows).
function pnpm(args, cwd = root) {
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd, stdio: 'inherit' });
}

function pack(destination) {
  if (!process.env.npm_execpath || !process.env.npm_config_user_agent?.startsWith('pnpm/')) {
    throw new Error('Run packaging through pnpm run pack, not npm or node directly.');
  }
  if (workspaces.length !== allowedNames.size || workspaces.some(dir => dir.includes('*'))) {
    throw new Error('Release workspaces must list exactly the six maintained package directories.');
  }
  const names = new Set();
  for (const dir of workspaces) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
    assertManifest(manifest);
    names.add(manifest.name);
  }
  if (names.size !== allowedNames.size) {
    throw new Error('Release workspaces contain duplicate or missing packages.');
  }
  for (const dir of fs.readdirSync(path.join(root, 'packages'))) {
    if (dir.startsWith('agents-a365-observability')) {
      throw new Error(`Retired package directory still exists: packages/${dir}. Remove reviewed stale artifacts first.`);
    }
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.mkdirSync(destination); // Fail on reuse: cached tarballs must never enter a new release.
  pnpm(['run', 'clean']);
  pnpm(['run', 'build']);
  for (const dir of workspaces) {
    const cwd = path.join(root, dir);
    execFileSync(process.execPath, [path.join(root, 'copyFiles.js'), cwd], { cwd, stdio: 'inherit' });
    pnpm(['pack', '--pack-destination', destination], cwd);
  }
  const packages = verify(destination);
  fs.writeFileSync(path.join(destination, 'packages.json'), JSON.stringify(packages, null, 2) + '\n');
  console.log(`Verified ${packages.length} release packages in ${destination}`);
}

try {
  if (process.argv[2] === '--verify') {
    const packages = verify(path.resolve(process.argv[3]));
    console.log(JSON.stringify(packages, null, 2));
  } else {
    pack(path.resolve(process.argv[2] ?? path.join(root, 'artifacts', `packages-${randomUUID()}`)));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
