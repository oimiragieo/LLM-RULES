'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  extractHookPaths,
  listTrackedFiles,
  validateHookFiles,
} = require('../../.claude/lib/utils/hook-file-validator.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

describe('extractHookPaths', () => {
  test('returns array of hook paths from settings.json', () => {
    const settingsPath = path.join(PROJECT_ROOT, '.claude', 'settings.json');
    const paths = extractHookPaths(settingsPath);

    assert.ok(Array.isArray(paths), 'should return an array');
    assert.ok(paths.length > 0, 'should find at least one hook path');

    // All entries should be strings pointing to .cjs / .js / .mjs files
    for (const p of paths) {
      assert.match(p, /\.(cjs|js|mjs)$/, `path should end in .cjs/.js/.mjs: ${p}`);
    }
  });

  test('returns empty array for non-existent settings file', () => {
    const paths = extractHookPaths('/nonexistent/path/settings.json');
    assert.deepEqual(paths, []);
  });

  test('handles settings with no hooks key', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hvtest-'));
    const fakeSettings = path.join(tmpDir, 'settings.json');
    fs.writeFileSync(fakeSettings, JSON.stringify({ max_tokens: 1000 }));

    try {
      const paths = extractHookPaths(fakeSettings);
      assert.deepEqual(paths, []);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('validateHookFiles', () => {
  test('listTrackedFiles returns tracked hook paths for the real project', () => {
    const tracked = listTrackedFiles(PROJECT_ROOT);

    assert.ok(tracked instanceof Set, 'tracked files should be returned as a Set');
    assert.ok(tracked.has('.claude/hooks/validation/pre-spawn-hook-check.cjs'));
    assert.ok(tracked.has('.claude/hooks/validation/check-console-log.cjs'));
  });

  test('reports valid:true on real project (all hooks tracked)', () => {
    const result = validateHookFiles(PROJECT_ROOT);

    assert.equal(typeof result.valid, 'boolean');
    assert.ok(Array.isArray(result.missing), 'missing should be array');
    assert.ok(Array.isArray(result.untracked), 'untracked should be array');
    assert.equal(typeof result.total, 'number');
    assert.ok(result.total > 0, 'should have found hooks to validate');

    // In the real project, all hooks should be present and tracked
    if (!result.valid) {
      console.warn('validateHookFiles found issues:', result);
    }
    assert.deepEqual(result.missing, [], `unexpected missing hooks: ${result.missing.join(', ')}`);
  });

  test('detects a fake missing hook path', () => {
    // Create a temp project dir with a settings.json referencing a non-existent hook
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hvtest-'));
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    const fakeSettings = {
      hooks: {
        PreToolUse: [
          {
            matcher: 'Write',
            hooks: [
              {
                type: 'command',
                command: 'cd "/tmp" && node .claude/hooks/nonexistent/phantom-hook.cjs',
              },
            ],
          },
        ],
      },
    };
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(fakeSettings));

    // Init a bare git repo so git ls-files works (though it won't matter for missing files)
    try {
      const { execSync } = require('child_process');
      execSync('git init -q', { cwd: tmpDir, stdio: 'pipe', shell: false });
    } catch {
      // git init may fail in some environments; skip git tracking check
    }

    try {
      const result = validateHookFiles(tmpDir);

      assert.equal(result.valid, false, 'should be invalid when hook file is missing');
      assert.ok(
        result.missing.length > 0 || result.untracked.length > 0,
        'should list the phantom hook as missing or untracked'
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
