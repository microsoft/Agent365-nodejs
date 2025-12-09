// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Copies LICENSE.md and CHANGELOG.md to the specified target directory
 * @param {string} targetDir - The directory to copy files to
 */
function copyFiles(targetDir) {
  if (!targetDir) {
    console.error('Error: Target directory not provided');
    console.log('Usage: node copyFiles.js <target-directory>');
    process.exit(1);
  }

  const rootDir = __dirname;
  const filesToCopy = ['LICENSE.md', 'CHANGELOG.md'];

  // Ensure target directory exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    console.log(`Created directory: ${targetDir}`);
  }

  // Copy each file
  filesToCopy.forEach(file => {
    const sourcePath = path.join(rootDir, file);
    const destPath = path.resolve(targetDir, file);

    if (!fs.existsSync(sourcePath)) {
      console.error(`Error: Source file not found: ${sourcePath}`);
      process.exit(1);
    }

    try {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied ${file}`);
      console.log(`  From: ${sourcePath}`);
      console.log(`  To:   ${destPath}`);
    } catch (error) {
      console.error(`Error copying ${file}:`, error.message);
      process.exit(1);
    }
  });

  console.log('All files copied successfully!');
}

// Get target directory from command line arguments
const targetDir = process.argv[2];
copyFiles(targetDir);
