const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { Glob } = require('glob');

/**
 * Test: All spawn/spawnSync calls in production code should have windowsHide: true
 *
 * This prevents Windows terminal flicker when agents spawn child processes.
 * windowsHide: true is a no-op on Unix, so it's safe everywhere.
 */
describe('windowsHide compliance', () => {
  it('all spawn calls in .claude/ should have windowsHide: true', async () => {
    const projectRoot = path.resolve(__dirname, '../../..');
    const claudeDir = path.join(projectRoot, '.claude');

    // Find all .cjs, .mjs, .js files in .claude directory
    const files = await new Glob('**/*.{cjs,mjs,js}', {
      cwd: claudeDir,
      absolute: true,
      ignore: ['**/node_modules/**', '**/_archive/**', '**/tmp/**'],
    }).walk();

    const violations = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const relPath = path.relative(projectRoot, file);

      // Find all spawn/spawnSync calls
      const spawnRegex = /spawn(?:Sync)?\s*\(\s*['"`][^'"`]+['"`]\s*,\s*[^,)]+\s*,\s*\{([^}]+)\}/g;
      let match;

      while ((match = spawnRegex.exec(content)) !== null) {
        const optionsBlock = match[1];

        // Check if windowsHide: true is present
        if (!optionsBlock.includes('windowsHide')) {
          const lineNumber = content.substring(0, match.index).split('\n').length;
          violations.push({
            file: relPath,
            line: lineNumber,
            snippet: match[0].substring(0, 100),
          });
        }
      }
    }

    // Report violations
    if (violations.length > 0) {
      const report = violations.map(v => `  ${v.file}:${v.line}\n    ${v.snippet}...`).join('\n');

      assert.fail(`Found ${violations.length} spawn calls without windowsHide: true:\n${report}`);
    }

    // Pass if no violations
    assert.ok(true, 'All spawn calls have windowsHide: true');
  });
});
