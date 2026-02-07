/**
 * Test: Verify NO package.json script references a missing file
 *
 * This test prevents "phantom scripts" - package.json entries pointing to files that don't exist.
 *
 * @file tests/tools/phantom-scripts.test.cjs
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

test('package.json scripts should not reference missing files', () => {
  // Read package.json
  const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const { scripts } = packageJson;
  const phantomScripts = [];

  // Pattern to extract file paths from node commands
  const nodePattern = /node\s+([^\s]+)/g;

  for (const [scriptName, scriptCommand] of Object.entries(scripts)) {
    // Skip scripts that don't invoke node
    if (!scriptCommand.includes('node ')) {
      continue;
    }

    // Extract all file paths from this script command
    let match;
    while ((match = nodePattern.exec(scriptCommand)) !== null) {
      const filePath = match[1];

      // Skip node flags
      if (filePath.startsWith('--') || filePath.startsWith('-')) {
        continue;
      }

      // Resolve path relative to project root
      const absolutePath = path.resolve(PROJECT_ROOT, filePath);

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        phantomScripts.push({
          script: scriptName,
          command: scriptCommand,
          missingFile: filePath,
        });
      }
    }

    // Reset regex state for next iteration
    nodePattern.lastIndex = 0;
  }

  // Assert no phantom scripts exist
  if (phantomScripts.length > 0) {
    const errorMessage = `Found ${phantomScripts.length} phantom script(s) referencing missing files:\n\n` +
      phantomScripts.map(p =>
        `  - Script: "${p.script}"\n` +
        `    Missing file: ${p.missingFile}\n` +
        `    Command: ${p.command}`
      ).join('\n\n');

    assert.fail(errorMessage);
  }

  assert.ok(true, 'All package.json scripts reference existing files');
});
