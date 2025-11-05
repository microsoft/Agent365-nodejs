// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Automated version management script for Agent365-nodejs monorepo
 * 
 * Usage:
 *   node setVersion.js                    # Write versions to disk (for CI/packaging)
 *   node setVersion.js --dry-run          # Calculate versions without writing (for local builds)
 *   node setVersion.js --local            # Alias for --dry-run
 * 
 * Flags:
 *   --dry-run, -d    Calculate versions but don't write to package.json files
 *   --local, -l      Same as --dry-run (for local development)
 *   --help, -h       Show this help message
 * 
 * Examples:
 *   # For CI/CD pipelines (writes to disk):
 *   npm run build && node setVersion.js && npm pack
 * 
 *   # For local development (dry-run):
 *   node setVersion.js --local
 */

import * as nbgv from 'nerdbank-gitversioning'
import fs from 'fs'

// Parse command line arguments
const args = process.argv.slice(2)
const showHelp = args.includes('--help') || args.includes('-h')

if (showHelp) {
  console.log(`
📦 setVersion.js - Automated Version Management

Usage:
  node setVersion.js [options]

Options:
  --dry-run, -d     Calculate versions without writing to disk (for local builds)
  --local, -l       Alias for --dry-run
  --help, -h        Show this help message

Examples:
  # Calculate version for local development (no file changes):
  node setVersion.js --dry-run

  # Update versions for CI/packaging:
  node setVersion.js

Description:
  This script uses Nerdbank.GitVersioning to calculate semantic versions based on
  git history and synchronize all packages in the monorepo. In dry-run mode, it
  shows what versions would be set without modifying any files.
`)
  process.exit(0)
}

const dryRun = args.includes('--dry-run') || args.includes('-d')
const localBuild = args.includes('--local') || args.includes('-l')

// In local build mode, we don't write version changes to disk
const skipWrite = dryRun || localBuild

if (skipWrite) {
  console.log('🔍 Running in DRY-RUN mode - versions will be calculated but NOT written to disk')
  console.log('   This prevents package.json changes from appearing in git status')
}

const updateLocalDeps = (folder, version) => {
  const packageJsonPath = `${folder}/package.json`
  const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
  const packageJson = JSON.parse(packageJsonContent)
  packageJson.version = version
  const dependencies = packageJson.dependencies
  if (dependencies) {
    Object.keys(dependencies).forEach(dep => {
      if (dep.startsWith('@microsoft/agents-a365')) {
        packageJson.dependencies[dep] = version
      }
    })
  }
  
  if (!skipWrite) {
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
  }
}

const setPackageVersionAndBuildNumber = async versionInfo => {
  console.log('##vso[task.setvariable variable=CUSTOM_VERSION;]' + versionInfo.npmPackageVersion)
  console.log(`📦 Calculated version: ${versionInfo.npmPackageVersion}`)
  
  // Update root package.json
  if (!skipWrite) {
    const rootPackageJsonPath = './package.json'
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'))
    rootPackageJson.version = versionInfo.npmPackageVersion
    fs.writeFileSync(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2) + '\n')
    console.log(`✅ Updated root package.json`)
  } else {
    console.log(`⏭️  Skipped updating root package.json (dry-run mode)`)
  }
  
  const files = await fs.promises.readdir('packages', { withFileTypes: true })
  
  const folders = files
    .filter(file => file.isDirectory() && file.name !== 'node_modules')
    .map(folder => `${folder.parentPath}/${folder.name}`)

  for (const f of folders) {
    const action = skipWrite ? '⏭️  Would update' : '✅ Updating'
    console.log(`${action} version in ${f}`)
    updateLocalDeps(f, versionInfo.npmPackageVersion)
  }
  
  if (skipWrite) {
    console.log('\n💡 To write versions to disk (for CI/packaging), run without --dry-run flag')
  } else {
    console.log(`\n✨ All packages updated to version: ${versionInfo.npmPackageVersion}`)
  }
}

const handleError = err => {
  console.error('Failed to update the package version number. nerdbank-gitversion failed: ' + err)
  process.exit(1)
}

console.log('🔍 Getting version from git history...')
const v = await nbgv.getVersion('.')
try {
  await setPackageVersionAndBuildNumber(v)
} catch (err) {
  handleError(err)
}
