// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * This test ensures all packages are loaded for coverage instrumentation.
 * Packages without dedicated tests will show their actual coverage (likely 0%).
 */

const fs = require('fs');
const path = require('path');

// Dynamically load all packages for coverage instrumentation
const packagesDir = path.join(__dirname, '../packages');
const packages = fs.readdirSync(packagesDir).filter((dir: string) => {
    const fullPath = path.join(packagesDir, dir);
    return fs.statSync(fullPath).isDirectory();
});

// Temporarily skip packages that cause Jest test failures
// TODO: Investigate and enable tooling packages in coverage collection
// Error: "A dynamic import callback was invoked without --experimental-vm-modules"
const skipPackages = [
    'agents-a365-tooling',
    'agents-a365-tooling-extensions-claude',
    'agents-a365-tooling-extensions-langchain',
    'agents-a365-tooling-extensions-openai',
];

packages.forEach((pkg: string) => {
    if (skipPackages.includes(pkg)) {
        return; // Skip packages with dynamic import issues
    }
    try {
        require(`../packages/${pkg}/src/index`);
    } catch (error: any) {
        // Silently ignore loading errors - package will not appear in coverage
        console.warn(`Warning: Could not load package ${pkg}: ${error?.message || error}`);
    }
});

describe('All Packages Coverage', () => {
    it('should load all packages for coverage reporting', () => {
        // Packages are loaded dynamically above
        expect(packages.length).toBeGreaterThan(0);
    });
});
