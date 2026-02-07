/**
 * Security Tests for prompt-assembler.cjs
 * Tests SEC-TMPL-001: Path Traversal in getPresetRuleSnippet()
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import the function under test
const { getPresetRuleSnippet, _clearCache } = require('../../../.claude/lib/spawn/prompt-assembler.cjs');

test('SEC-TMPL-001: getPresetRuleSnippet path traversal tests', async (t) => {
  let tmpDir;
  let presetConfigPath;

  await t.beforeEach(() => {
    // Clear cache so loadPresets() loads from temp directory
    _clearCache();

    // Create temporary test directory
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-security-test-'));

    // Create a safe file inside project
    const safeDir = path.join(tmpDir, 'rules');
    fs.mkdirSync(safeDir, { recursive: true });
    fs.writeFileSync(path.join(safeDir, 'safe.txt'), 'Safe content');

    // Create a sensitive file outside project (simulating /etc/passwd)
    const outsideFile = path.join(os.tmpdir(), 'sensitive-data.txt');
    fs.writeFileSync(outsideFile, 'SENSITIVE DATA - SHOULD NOT BE ACCESSIBLE');

    // Create preset config
    presetConfigPath = path.join(tmpDir, '.claude', 'config', 'presets.json');
    fs.mkdirSync(path.dirname(presetConfigPath), { recursive: true });
  });

  await t.afterEach(() => {
    // Cleanup
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    const outsideFile = path.join(os.tmpdir(), 'sensitive-data.txt');
    if (fs.existsSync(outsideFile)) {
      fs.unlinkSync(outsideFile);
    }
  });

  await t.test('should reject path traversal with ../../ pattern', () => {
    // Setup preset with path traversal attempt
    const presetsConfig = {
      presets: {
        malicious: {
          ruleSnippetPath: '../../../../../../tmp/sensitive-data.txt'
        }
      }
    };
    fs.writeFileSync(presetConfigPath, JSON.stringify(presetsConfig));

    // Test: should return empty string (blocked)
    const result = getPresetRuleSnippet('malicious', tmpDir);

    assert.strictEqual(result, '', 'Path traversal should be blocked and return empty string');
  });

  await t.test('should reject absolute path outside project', () => {
    const absolutePath = path.join(os.tmpdir(), 'sensitive-data.txt');
    const presetsConfig = {
      presets: {
        absolute: {
          ruleSnippetPath: absolutePath
        }
      }
    };
    fs.writeFileSync(presetConfigPath, JSON.stringify(presetsConfig));

    // Test: should return empty string (blocked)
    const result = getPresetRuleSnippet('absolute', tmpDir);

    assert.strictEqual(result, '', 'Absolute path outside project should be blocked');
  });

  await t.test('should allow valid path inside project', () => {
    const presetsConfig = {
      presets: {
        safe: {
          ruleSnippetPath: 'rules/safe.txt'
        }
      }
    };
    fs.writeFileSync(presetConfigPath, JSON.stringify(presetsConfig));

    // Test: should return file content
    const result = getPresetRuleSnippet('safe', tmpDir);

    assert.strictEqual(result, 'Safe content', 'Valid path inside project should work');
  });

  await t.test('should allow path with .. that resolves inside project', () => {
    // Create nested structure
    const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'a', 'valid.txt'), 'Valid file');

    const presetsConfig = {
      presets: {
        relative: {
          // This resolves to tmpDir/a/valid.txt (inside project)
          ruleSnippetPath: 'a/b/../valid.txt'
        }
      }
    };
    fs.writeFileSync(presetConfigPath, JSON.stringify(presetsConfig));

    // Test: should return file content (safe relative path)
    const result = getPresetRuleSnippet('relative', tmpDir);

    assert.strictEqual(result, 'Valid file', 'Safe relative path should work');
  });
});
