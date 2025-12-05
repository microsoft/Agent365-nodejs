// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Color definitions for package types
const packageTypeColors = {
  'Notifications': { fill: '#ffcdd2', stroke: '#c62828', color: '#280505' },
  'Observability': { fill: '#c8e6c9', stroke: '#2e7d32', color: '#142a14' },
  'Observability Extensions': { fill: '#e8f5e9', stroke: '#66bb6a', color: '#1f3d1f' },
  'Runtime': { fill: '#bbdefb', stroke: '#1565c0', color: '#0d1a26' },
  'Tooling': { fill: '#ffe0b2', stroke: '#e65100', color: '#331a00' },
  'Tooling Extensions': { fill: '#fff3e0', stroke: '#fb8c00', color: '#4d2600' }
};

// Package to type mapping
const packageToType = {
  'agents-a365-notifications': 'Notifications',
  'agents-a365-observability': 'Observability',
  'agents-a365-observability-extensions-openai': 'Observability Extensions',
  'agents-a365-observability-tokencache': 'Observability Extensions',
  'agents-a365-runtime': 'Runtime',
  'agents-a365-tooling': 'Tooling',
  'agents-a365-tooling-extensions-claude': 'Tooling Extensions',
  'agents-a365-tooling-extensions-langchain': 'Tooling Extensions',
  'agents-a365-tooling-extensions-openai': 'Tooling Extensions'
};

// Find all package directories matching the pattern
function findPackages() {
  const packagesDir = path.join(__dirname, 'packages');
  const packages = [];
  
  const dirs = fs.readdirSync(packagesDir, { withFileTypes: true });
  
  for (const dir of dirs) {
    if (dir.isDirectory() && dir.name.startsWith('agents-a365-')) {
      const packageJsonPath = path.join(packagesDir, dir.name, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        packages.push({
          name: dir.name,
          path: packageJsonPath
        });
      }
    }
  }
  
  return packages;
}

// Read and parse package.json
function readPackageJson(packagePath) {
  const content = fs.readFileSync(packagePath, 'utf-8');
  return JSON.parse(content);
}

// Extract dependencies related to our packages
function extractRelevantDependencies(packageJson, relevantPackageNames) {
  const deps = [];
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies
  };
  
  for (const [depName, version] of Object.entries(allDeps || {})) {
    // Check if this dependency is one of our packages
    if (relevantPackageNames.has(depName)) {
      deps.push(depName);
    }
  }
  
  return deps;
}

// Generate Mermaid diagram
function generateMermaidDiagram(packages) {
  let mermaid = '```mermaid\ngraph LR\n';
  
  // Create a map of package names to directory names
  const packageNameToDir = new Map();
  for (const pkg of packages) {
    packageNameToDir.set(pkg.packageName, pkg.name);
  }
  
  // Create nodes
  for (const pkg of packages) {
    const nodeId = pkg.name.replace(/-/g, '_');
    mermaid += `  ${nodeId}[${pkg.name}]\n`;
  }
  
  mermaid += '\n';
  
  // Create edges (dependencies)
  for (const pkg of packages) {
    const nodeId = pkg.name.replace(/-/g, '_');
    for (const dep of pkg.dependencies) {
      // Convert package name to directory name
      const depDirName = packageNameToDir.get(dep);
      if (depDirName) {
        const depId = depDirName.replace(/-/g, '_');
        mermaid += `  ${nodeId} --> ${depId}\n`;
      }
    }
  }
  
  mermaid += '\n';
  
  // Add styling
  for (const pkg of packages) {
    const nodeId = pkg.name.replace(/-/g, '_');
    const packageType = packageToType[pkg.name];
    if (packageType) {
      const colors = packageTypeColors[packageType];
      if (colors) {
        mermaid += `  style ${nodeId} fill:${colors.fill},stroke:${colors.stroke},color:${colors.color}\n`;
      }
    }
  }
  
  mermaid += '```\n';
  
  return mermaid;
}

// Main function
function main() {
  console.log('Finding packages...');
  const packageList = findPackages();
  console.log(`Found ${packageList.length} packages`);
  
  // Get all package names for filtering dependencies
  const relevantPackageNames = new Set(packageList.map(p => {
    const pkgJson = readPackageJson(p.path);
    return pkgJson.name;
  }));
  
  console.log('Analyzing dependencies...');
  const packagesWithDeps = packageList.map(pkg => {
    const packageJson = readPackageJson(pkg.path);
    const dependencies = extractRelevantDependencies(packageJson, relevantPackageNames);
    
    console.log(`  ${pkg.name}: ${dependencies.length} dependencies`);
    
    return {
      name: pkg.name,
      packageName: packageJson.name,
      dependencies
    };
  });
  
  console.log('Generating Mermaid diagram...');
  const diagram = generateMermaidDiagram(packagesWithDeps);
  
  // Add header and legend
  let markdown = '# Microsoft Agent 365 SDK Node.js Package Dependencies\n\n';
  markdown += 'This diagram shows the internal dependencies between Microsoft Agent 365 SDK Node.js packages.\n\n';
  markdown += diagram;
  markdown += '## Package Types\n\n';
  markdown += '- **Notifications** (Red): Notification and messaging extensions\n';
  markdown += '- **Observability** (Green): Telemetry and monitoring core\n';
  markdown += '- **Observability Extensions** (Light Green): Framework-specific observability integrations\n';
  markdown += '- **Runtime** (Blue): Core runtime components\n';
  markdown += '- **Tooling** (Orange): Agent tooling SDK core\n';
  markdown += '- **Tooling Extensions** (Light Orange): Framework-specific tooling integrations\n\n';
  
  const outputPath = path.join(__dirname, 'DEPENDENCIES.md');
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  
  console.log(`\nDiagram generated successfully: ${outputPath}`);
}

main();
