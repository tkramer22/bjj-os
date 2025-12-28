#!/usr/bin/env node

/**
 * Auto-increment app version for cache busting
 * Run this script before each deployment
 */

const fs = require('fs');
const path = require('path');

const versionFilePath = path.join(__dirname, '../client/src/lib/version.ts');

// Read current version file
const content = fs.readFileSync(versionFilePath, 'utf8');

// Extract current version
const versionMatch = content.match(/export const APP_VERSION = "(.+)";/);
if (!versionMatch) {
  console.error('Could not find APP_VERSION in version.ts');
  process.exit(1);
}

const currentVersion = versionMatch[1];
console.log(`Current version: ${currentVersion}`);

// Parse and increment version
const versionParts = currentVersion.split('.').map(Number);
versionParts[2]++; // Increment patch version

// Handle overflow (e.g., 1.0.99 -> 1.1.0)
if (versionParts[2] >= 100) {
  versionParts[2] = 0;
  versionParts[1]++;
}
if (versionParts[1] >= 100) {
  versionParts[1] = 0;
  versionParts[0]++;
}

const newVersion = versionParts.join('.');
console.log(`New version: ${newVersion}`);

// Update version file
const newContent = content.replace(
  /export const APP_VERSION = ".+";/,
  `export const APP_VERSION = "${newVersion}";`
);

fs.writeFileSync(versionFilePath, newContent, 'utf8');
console.log(`✅ Version updated to ${newVersion}`);
console.log('✅ Users will see hard reload on next visit');
