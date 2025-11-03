// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as nbgv from 'nerdbank-gitversioning'
import fs from 'fs'

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
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
}

const setPackageVersionAndBuildNumber = async versionInfo => {
  console.log('##vso[task.setvariable variable=CUSTOM_VERSION;]' + versionInfo.npmPackageVersion)
  console.log(`Setting package version to: ${versionInfo.npmPackageVersion}`)
  await nbgv.setPackageVersion('.')
  fs.readdir('packages', { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error('Failed to read the packages directory: ' + err)
      return
    }

    const folders = files
      .filter(file => file.isDirectory())
      .map(folder => `${folder.parentPath}/${folder.name}`)

    for (const f of folders) {
      console.log(`Setting version number in ${f}`)
      updateLocalDeps(f, versionInfo.npmPackageVersion)
    }
  })
}

const handleError = err => console.error('Failed to update the package version number. nerdbank-gitversion failed: ' + err)

const v = await nbgv.getVersion('.')
try {
  setPackageVersionAndBuildNumber(v)
} catch (err) {
  handleError(err)
}
