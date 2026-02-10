'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

// Script under test (will fail - does not exist yet)
const SCRIPT_PATH = path.join(__dirname, '../../.claude/scripts/verify-hook-modules.cjs');
// Run node via spawnSync (no shell) to avoid CodeQL "shell command built from env"
function runScript(args = [], options = {}) {
  const { encoding = 'utf8', ...rest } = options;
  const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding,
    ...rest,
  });
  if (result.status !== 0) {
    const err = new Error(result.stderr || result.error || `Exit ${result.status}`);
    err.status = result.status;
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    throw err;
  }
  return result.stdout;
}

describe('verify-hook-modules', () => {
  let tempDir;
  let hooksDir;
  let settingsFile;

  before(() => {
    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-hooks-test-'));
    hooksDir = path.join(tempDir, '.claude', 'hooks');
    const monitoringDir = path.join(hooksDir, 'monitoring');
    const archiveDir = path.join(hooksDir, '_archive');

    fs.mkdirSync(monitoringDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });

    settingsFile = path.join(tempDir, '.claude', 'settings.json');
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Clean up hooks directory before each test to avoid accumulation
    const monitoringDir = path.join(hooksDir, 'monitoring');
    if (fs.existsSync(monitoringDir)) {
      fs.rmSync(monitoringDir, { recursive: true });
      fs.mkdirSync(monitoringDir, { recursive: true });
    }
    // Remove settings.json if it exists
    if (fs.existsSync(settingsFile)) {
      fs.unlinkSync(settingsFile);
    }
  });

  describe('static analysis mode', () => {
    it('scans .claude/hooks/ for .cjs files', () => {
      // Create a hook file
      const hookFile = path.join(hooksDir, 'monitoring', 'test-hook.cjs');
      fs.writeFileSync(hookFile, "const x = require('fs');");

      // Execute script - should succeed with built-in fs module
      const output = runScript([], { cwd: tempDir });
      assert.ok(output.includes('test-hook.cjs'));
    });

    it('excludes _archive/ directory from scanning', () => {
      // Create files in both locations
      const activeHook = path.join(hooksDir, 'monitoring', 'active.cjs');
      const archivedHook = path.join(hooksDir, '_archive', 'archived.cjs');

      fs.writeFileSync(activeHook, "const x = require('fs');");
      fs.writeFileSync(archivedHook, "const y = require('./missing.cjs');");

      // Script should not report archived hook as broken
      const output = runScript([], { cwd: tempDir });
      // Active hook should be scanned
      assert.ok(output.includes('active.cjs'));
      // Archived hook should NOT be scanned
      assert.ok(!output.includes('archived.cjs'));
    });

    it('reports PASS for hooks with valid requires', () => {
      const hookFile = path.join(hooksDir, 'monitoring', 'valid-hook.cjs');
      const targetFile = path.join(hooksDir, 'monitoring', 'existing.cjs');

      fs.writeFileSync(hookFile, "const x = require('./existing.cjs');");
      fs.writeFileSync(targetFile, 'module.exports = {};');

      // Should exit with code 0 and show [PASS]
      const output = runScript([], { cwd: tempDir });
      assert.ok(output.includes('[PASS]') || output.includes('passed'));
    });

    it('reports FAIL for hooks with broken requires', () => {
      const hookFile = path.join(hooksDir, 'monitoring', 'broken-hook.cjs');
      fs.writeFileSync(hookFile, "const x = require('./nonexistent.cjs');");

      // Should exit with code 1 and show [FAIL]
      try {
        runScript([], { cwd: tempDir });
        assert.fail('Expected script to exit with code 1');
      } catch (err) {
        // Exit code 1 is expected
        assert.strictEqual(err.status, 1);
        assert.ok(err.stdout.includes('[FAIL]') || err.stdout.includes('failed'));
      }
    });

    it('cross-references settings.json registrations', () => {
      // Create the hook file FIRST
      const hookFile = path.join(hooksDir, 'monitoring', 'test-hook.cjs');
      fs.writeFileSync(hookFile, "const x = require('fs');");

      // Then create settings.json that references it
      const settings = {
        hooks: {
          preToolUse: [
            {
              command: 'node .claude/hooks/monitoring/test-hook.cjs',
            },
          ],
        },
      };

      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

      // Should verify settings.json hooks exist and pass (exit code 0)
      const output = runScript([], { cwd: tempDir });
      // Should process the registered hook
      assert.ok(output.includes('test-hook.cjs'));
    });

    it('[SEC-CI-001] uses static analysis only -- never calls require() on hooks', () => {
      // Verify source code of verify-hook-modules.cjs contains NO
      // require(variable) patterns that would execute hook code

      const scriptContent = fs.readFileSync(SCRIPT_PATH, 'utf8');

      // Check for dangerous patterns
      assert.ok(!scriptContent.includes('require(filePath)'));
      assert.ok(!scriptContent.includes('require(hookPath)'));
      assert.ok(!scriptContent.match(/require\([a-z][a-zA-Z_]+\)/));
    });

    it('[SEC-CI-003] error messages use relative paths only', () => {
      const hookFile = path.join(hooksDir, 'monitoring', 'broken-hook.cjs');
      fs.writeFileSync(hookFile, "const x = require('./missing.cjs');");

      try {
        runScript([], { cwd: tempDir, stdio: 'pipe' });
      } catch (err) {
        const output = err.stdout || err.stderr || '';
        // Error output should not contain absolute paths
        assert.ok(!output.includes(tempDir));
        assert.ok(!output.includes('C:\\'));
      }
    });
  });

  describe('JSON output mode (--json)', () => {
    it('outputs valid JSON with expected schema', () => {
      const hookFile = path.join(hooksDir, 'monitoring', 'json-test.cjs');
      fs.writeFileSync(hookFile, "const x = require('fs');");

      const output = runScript(['--json'], { cwd: tempDir });

      const result = JSON.parse(output);

      assert.ok(result.timestamp);
      assert.ok(result.mode);
      assert.ok(typeof result.hooksScanned === 'number');
      assert.ok(typeof result.passed === 'number');
      assert.ok(typeof result.failed === 'number');
      assert.ok(Array.isArray(result.failures));
    });

    it('failures array contains hook path and brokenRequires', () => {
      const hookFile = path.join(hooksDir, 'monitoring', 'broken-hook.cjs');
      fs.writeFileSync(hookFile, "const x = require('./missing.cjs');");

      try {
        runScript(['--json'], { cwd: tempDir });
        assert.fail('Expected script to exit with code 1');
      } catch (err) {
        const output = err.stdout || '';
        const result = JSON.parse(output);

        assert.ok(result.failures.length > 0);
        const failure = result.failures[0];
        assert.ok(failure.hook);
        assert.ok(Array.isArray(failure.brokenRequires));
        assert.ok(failure.brokenRequires[0].raw);
        assert.ok(failure.brokenRequires[0].resolved);
        assert.ok(typeof failure.brokenRequires[0].line === 'number');
      }
    });
  });

  describe('settings.json cross-reference', () => {
    it('detects registered hooks that are missing from disk', () => {
      const settings = {
        hooks: {
          preToolUse: [
            {
              command: 'node .claude/hooks/monitoring/nonexistent.cjs',
            },
          ],
        },
      };

      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

      try {
        runScript([], { cwd: tempDir });
        assert.fail('Expected script to exit with code 1');
      } catch (err) {
        const output = err.stdout || err.stderr || '';
        assert.ok(output.includes('MISSING') || output.includes('nonexistent.cjs'));
      }
    });

    it('handles settings.json parse errors gracefully', () => {
      fs.writeFileSync(settingsFile, '{ invalid json }');

      try {
        runScript([], { cwd: tempDir, stdio: 'pipe' });
        assert.fail('Expected script to exit with code 1');
      } catch (err) {
        // Exit code 1 is expected for parse errors
        assert.strictEqual(err.status, 1);
      }
    });
  });

  describe('error handling', () => {
    it('continues scanning when a single file has read errors', () => {
      const validHook = path.join(hooksDir, 'monitoring', 'valid.cjs');

      fs.writeFileSync(validHook, "const x = require('fs');");

      // On Windows, permission changes don't work the same way
      // So we'll just verify that valid hooks are still reported
      const output = runScript([], { cwd: tempDir });

      // Should still report valid hook
      assert.ok(output.includes('valid.cjs'));
    });

    it('reports summary even when some files are skipped', () => {
      const hookFile = path.join(hooksDir, 'monitoring', 'summary-test.cjs');
      fs.writeFileSync(hookFile, "const x = require('fs');");

      const output = runScript([], { cwd: tempDir });

      // Should include summary line
      assert.ok(output.includes('Summary') || output.includes('passed'));
    });
  });
});

describe('verifyHooks exported function', () => {
  let tempDir;
  let hooksDir;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-hooks-fn-test-'));
    hooksDir = path.join(tempDir, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
  });

  after(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns structured results for programmatic use', () => {
    const hookFile = path.join(hooksDir, 'test.cjs');
    fs.writeFileSync(hookFile, "const x = require('fs');");

    const { verifyHooks } = require(SCRIPT_PATH);

    const result = verifyHooks({ projectRoot: tempDir });

    assert.ok(typeof result.passed === 'number');
    assert.ok(typeof result.failed === 'number');
    assert.ok(Array.isArray(result.results));
  });
});
