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

packages.forEach((pkg: string) => {
    try {
        require(`../packages/${pkg}/src/index`);
    } catch (error) {
        console.warn(`Warning: Could not load package ${pkg}:`, error);
    }
});

describe('All Packages Coverage', () => {
    it('should load all packages for coverage reporting', () => {
        // Packages are loaded dynamically above
        expect(packages.length).toBeGreaterThan(0);
    });
});
