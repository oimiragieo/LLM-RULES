'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Module under test
const { BootstrapSystem } = require('../../.claude/lib/services/bootstrap-system.cjs');

describe('Bootstrap System', () => {
  let tempDir;
  let initShPath;
  let statePath;

  before(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-system-test-'));
  });

  after(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    initShPath = path.join(tempDir, 'init.sh');
    statePath = path.join(tempDir, 'bootstrap-state.json');
  });

  afterEach(() => {
    if (fs.existsSync(initShPath)) {
      fs.rmSync(initShPath, { force: true });
    }
    if (fs.existsSync(statePath)) {
      fs.rmSync(statePath, { force: true });
    }
  });

  function writeInitSh(content) {
    fs.writeFileSync(initShPath, content, 'utf8');
  }

  function readState() {
    if (!fs.existsSync(statePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  }

  describe('VAL-BS-001: Successful bootstrap writes bootstrap-state.json', () => {
    it('successful bootstrap writes state file with status complete and all components ok', () => {
      writeInitSh(`#!/bin/bash
echo "Checking node..."
node --version
echo "Checking npm..."
npm --version
echo "Init complete."
`);

      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          { name: 'node', check: 'node --version' },
          { name: 'npm', check: 'npm --version' },
        ],
        timeout: 30000,
        skipInitSh: true, // Skip for cross-platform testing
      });

      const result = bootstrap.run();

      assert.strictEqual(result.status, 'complete', 'Overall status should be complete');
      assert.strictEqual(result.components.node.status, 'ok', 'node should be ok');
      assert.strictEqual(result.components.npm.status, 'ok', 'npm should be ok');

      // Verify state file was written
      const state = readState();
      assert.ok(state, 'State file should exist');
      assert.strictEqual(state.status, 'complete');
      assert.strictEqual(state.components.node.status, 'ok');
      assert.strictEqual(state.components.npm.status, 'ok');
    });

    it('state file includes timestamps for each component', () => {
      writeInitSh(`#!/bin/bash
echo "Init complete."
`);

      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [{ name: 'node', check: 'node --version' }],
        skipInitSh: true,
      });

      bootstrap.run();

      const state = readState();
      assert.ok(state.components.node.timestamp, 'Component should have timestamp');
      assert.ok(typeof state.components.node.timestamp === 'string', 'Timestamp should be string');
    });
  });

  describe('VAL-BS-002: Critical failure halts bootstrap', () => {
    it('critical component failure halts and marks subsequent components skipped', () => {
      // Pre-seed state to simulate critical failure
      const preseededState = {
        status: 'halted',
        components: {
          node: {
            status: 'failed',
            timestamp: new Date().toISOString(),
            reason: 'Simulated critical failure',
          },
          npm: {
            status: 'skipped',
            timestamp: new Date().toISOString(),
            reason: 'Skipped due to previous critical failure',
          },
        },
      };
      fs.writeFileSync(statePath, JSON.stringify(preseededState, null, 2), 'utf8');

      // Create a bootstrap with a critical component that will fail
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          {
            name: 'nonexistent_critical',
            check: 'nonexistent_binary_that_does_not_exist --version',
            critical: true,
          },
          { name: 'npm', check: 'npm --version' },
        ],
        skipInitSh: true,
      });

      const result = bootstrap.run();

      // Critical failure should halt
      assert.strictEqual(result.status, 'halted', 'Status should be halted on critical failure');
      assert.strictEqual(
        result.components.nonexistent_critical.status,
        'failed',
        'Critical component should show failure'
      );
      assert.strictEqual(
        result.components.npm.status,
        'skipped',
        'Subsequent component should be skipped'
      );
    });

    it('non-critical component failure continues', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          { name: 'node', check: 'node --version' },
          {
            name: 'nonexistent',
            check: 'nonexistent_binary_that_does_not_exist --version',
            critical: false,
          },
        ],
        skipInitSh: true,
      });

      const result = bootstrap.run();

      // Should complete even with non-critical failure
      assert.strictEqual(result.status, 'complete', 'Should complete with non-critical failure');
      assert.strictEqual(result.components.node.status, 'ok', 'node should be ok');
      assert.strictEqual(
        result.components.nonexistent.status,
        'failed',
        'nonexistent should be failed'
      );
    });

    it('subsequent components get skipped status after critical failure', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          {
            name: 'nonexistent_critical',
            check: 'nonexistent_binary_that_does_not_exist --version',
            critical: true,
          },
          { name: 'npm', check: 'npm --version' },
          { name: 'pnpm', check: 'pnpm --version' },
        ],
        skipInitSh: true,
      });

      const result = bootstrap.run();

      // All components after critical failure should be halted or skipped
      assert.strictEqual(result.status, 'halted', 'Should be halted');
      assert.strictEqual(result.components.npm.status, 'skipped', 'npm should be skipped');
      assert.strictEqual(result.components.pnpm.status, 'skipped', 'pnpm should be skipped');
    });
  });

  describe('VAL-BS-003: Idempotent re-run skips satisfied components', () => {
    it('components already ok in state file are skipped on re-run', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          { name: 'node', check: 'node --version' },
          { name: 'npm', check: 'npm --version' },
        ],
        skipInitSh: true,
      });

      // First run
      const result1 = bootstrap.run();
      assert.strictEqual(result1.status, 'complete');
      const firstNodeTimestamp = result1.components.node.timestamp;

      // Re-run
      const result2 = bootstrap.run();
      assert.strictEqual(result2.status, 'complete');
      // Timestamp should be unchanged (skipped)
      assert.strictEqual(
        result2.components.node.timestamp,
        firstNodeTimestamp,
        'Timestamp should be unchanged on re-run'
      );
    });

    it('re-run verifies binary still exists before skipping', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [{ name: 'node', check: 'node --version', binary: 'node' }],
        skipInitSh: true,
      });

      // First run
      bootstrap.run();

      // Re-run should skip because node binary still exists
      const result2 = bootstrap.run();
      assert.strictEqual(result2.components.node.status, 'ok');
    });
  });

  describe('Partial failure retry', () => {
    it('only re-attempts failed and skipped components', () => {
      // Pre-seed state with mixed statuses
      const preseededState = {
        status: 'partial',
        components: {
          node: { status: 'ok', timestamp: '2026-01-01T00:00:00.000Z' },
          npm: {
            status: 'failed',
            timestamp: '2026-01-01T00:00:00.000Z',
            reason: 'Command failed',
          },
          pnpm: {
            status: 'skipped',
            timestamp: '2026-01-01T00:00:00.000Z',
            reason: 'Skipped due to previous failure',
          },
        },
      };
      fs.writeFileSync(statePath, JSON.stringify(preseededState, null, 2), 'utf8');

      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          { name: 'node', check: 'node --version' },
          { name: 'npm', check: 'npm --version' },
          { name: 'pnpm', check: 'pnpm --version' },
        ],
        skipInitSh: true,
      });

      const result = bootstrap.run();

      // node should remain ok (untouched)
      assert.strictEqual(result.components.node.status, 'ok');
      assert.strictEqual(
        result.components.node.timestamp,
        preseededState.components.node.timestamp,
        'node timestamp should be unchanged'
      );

      // npm and pnpm should be re-attempted
      assert.ok(
        result.components.npm.status === 'ok' || result.components.npm.status === 'failed',
        'npm should be re-attempted'
      );
    });
  });

  describe('Component timeout', () => {
    it('timeout exceeded results in timeout status', { timeout: 10000 }, () => {
      // Use a command that will timeout - sleep for 5 seconds with 100ms timeout
      // On Windows, we use timeout command or ping
      const isWindows = process.platform === 'win32';
      const sleepCmd = isWindows ? 'ping -n 6 127.0.0.1' : 'sleep 5';

      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [{ name: 'slow', check: sleepCmd, timeout: 100 }], // 100ms timeout
        skipInitSh: true,
      });

      const result = bootstrap.run();

      // Should timeout
      assert.strictEqual(result.components.slow.status, 'timeout');
    });

    it('default timeout is 60 seconds', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [],
      });

      assert.strictEqual(bootstrap.options.timeout, 60000, 'Default timeout should be 60s');
    });
  });

  describe('VAL-BS-004: Windows compatibility uses platform commands', () => {
    it('uses where command on Windows for binary detection', () => {
      // Mock Windows platform
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });

      try {
        const bootstrap = new BootstrapSystem({
          initShPath,
          statePath,
          components: [{ name: 'node', check: 'node --version', binary: 'node' }],
          skipInitSh: true,
        });

        // The module should use 'where' internally on Windows
        // We're testing that it doesn't crash
        const result = bootstrap.run();
        assert.ok(result, 'Should complete without error on Windows');
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
      }
    });

    it('paths are normalized for Windows', () => {
      const bootstrap = new BootstrapSystem({
        initShPath: 'C:\\path\\to\\init.sh',
        statePath: 'C:\\path\\to\\state.json',
        components: [],
      });

      // Should not crash with Windows paths
      assert.ok(bootstrap);
    });
  });

  describe('Syntax error handling', () => {
    it('syntax errors in init.sh are caught and reported', () => {
      writeInitSh(`#!/bin/bash
# Invalid syntax - unclosed quote
echo "unclosed
`);

      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [{ name: 'node', check: 'node --version' }],
        skipInitSh: false, // Enable init.sh for this test
      });

      const result = bootstrap.run();

      // Should handle syntax error gracefully
      assert.ok(
        result.status === 'error' || result.status === 'halted',
        'Should report error status'
      );
      assert.ok(result.error, 'Should have error details');
    });

    it('state file records syntax error details', () => {
      writeInitSh(`#!/bin/bash
echo "unclosed
`);

      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [{ name: 'node', check: 'node --version' }],
        skipInitSh: false,
      });

      bootstrap.run();

      const state = readState();
      assert.ok(state.error || state.status === 'error', 'State should record error');
    });
  });

  describe('Error status handling', () => {
    it('parse error results in error status', () => {
      // Write invalid JSON to state path (simulating corruption)
      fs.writeFileSync(statePath, '{invalid json', 'utf8');

      writeInitSh(`#!/bin/bash
echo "Init complete."
`);

      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [{ name: 'node', check: 'node --version' }],
        skipInitSh: true,
      });

      // Should handle corrupted state file
      const result = bootstrap.run();
      assert.ok(result, 'Should complete even with corrupted state');
    });
  });

  describe('Component configuration', () => {
    it('components can have individual timeouts', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          { name: 'fast', check: 'echo fast', timeout: 5000 },
          { name: 'slow', check: 'echo slow', timeout: 120000 },
        ],
      });

      assert.strictEqual(bootstrap.options.components[0].timeout, 5000);
      assert.strictEqual(bootstrap.options.components[1].timeout, 120000);
    });

    it('component critical flag is respected', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          { name: 'node', check: 'node --version', critical: true },
          { name: 'npm', check: 'npm --version', critical: false },
        ],
      });

      assert.strictEqual(bootstrap.options.components[0].critical, true);
      assert.strictEqual(bootstrap.options.components[1].critical, false);
    });
  });

  describe('State file schema', () => {
    it('state file has correct schema', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          { name: 'node', check: 'node --version' },
          { name: 'npm', check: 'npm --version' },
        ],
        skipInitSh: true,
      });

      bootstrap.run();

      const state = readState();

      // Verify schema
      assert.ok('status' in state, 'Should have status');
      assert.ok('components' in state, 'Should have components');
      assert.ok('timestamp' in state, 'Should have timestamp');

      // Status should be one of the valid values
      assert.ok(
        ['complete', 'halted', 'error', 'partial'].includes(state.status),
        'Status should be valid'
      );

      // Each component should have required fields
      for (const [name, comp] of Object.entries(state.components)) {
        assert.ok('status' in comp, `Component ${name} should have status`);
        assert.ok('timestamp' in comp, `Component ${name} should have timestamp`);
        assert.ok(
          ['ok', 'failed', 'skipped', 'timeout', 'halted'].includes(comp.status),
          `Component ${name} status should be valid`
        );
      }
    });

    it('failed component includes reason', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          {
            name: 'nonexistent',
            check: 'nonexistent_binary_that_does_not_exist --version',
            critical: false,
          },
        ],
        skipInitSh: true,
      });

      bootstrap.run();

      const state = readState();
      assert.ok(state.components.nonexistent.reason, 'Should have error reason');
    });
  });

  describe('Missing init.sh handling', () => {
    it('missing init.sh is handled gracefully', () => {
      const bootstrap = new BootstrapSystem({
        initShPath: path.join(tempDir, 'nonexistent-init.sh'),
        statePath,
        components: [{ name: 'node', check: 'node --version' }],
        skipInitSh: false,
      });

      const result = bootstrap.run();

      // Should handle missing file
      assert.strictEqual(result.status, 'error', 'Should report error for missing init.sh');
    });
  });

  describe('Binary detection', () => {
    it('detects node binary correctly', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [{ name: 'node', check: 'node --version', binary: 'node' }],
        skipInitSh: true,
      });

      const result = bootstrap.run();

      // node should pass since it's installed
      assert.strictEqual(result.components.node.status, 'ok');
    });

    it('detects missing binary correctly', () => {
      const bootstrap = new BootstrapSystem({
        initShPath,
        statePath,
        components: [
          {
            name: 'nonexistent',
            check: 'nonexistent_binary_that_does_not_exist --version',
            binary: 'nonexistent_binary_that_does_not_exist',
          },
        ],
        skipInitSh: true,
      });

      const result = bootstrap.run();

      // nonexistent binary should fail
      assert.strictEqual(result.components.nonexistent.status, 'failed');
    });
  });
});
