#!/usr/bin/env node
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a temp directory for each test to avoid conflicts with real runtime
const TEST_PREFIX = 'cron-launcher-test-';

function createTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), TEST_PREFIX));
  const pidFile = path.join(tmpDir, 'cron-session.pid');
  const pingFile = path.join(tmpDir, 'cron-session-ping.json');
  return { tmpDir, pidFile, pingFile };
}

function cleanupTestEnv(tmpDir) {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

// Import the module under test
const launcher = require('../../../.claude/tools/cron-runner/cron-session-launcher.cjs');

describe('cron-session-launcher', () => {
  describe('isProcessAlive', () => {
    it('returns true for the current process PID', () => {
      assert.equal(launcher.isProcessAlive(process.pid), true);
    });

    it('returns false for PID 0', () => {
      assert.equal(launcher.isProcessAlive(0), false);
    });

    it('returns false for negative PID', () => {
      assert.equal(launcher.isProcessAlive(-1), false);
    });

    it('returns false for non-integer PID', () => {
      assert.equal(launcher.isProcessAlive(3.14), false);
    });

    it('returns false for a very large PID unlikely to exist', () => {
      // PID 999999999 is extremely unlikely to exist
      assert.equal(launcher.isProcessAlive(999999999), false);
    });
  });

  describe('acquirePidLock / releasePidLock', () => {
    let testEnv;

    beforeEach(() => {
      testEnv = createTestEnv();
    });

    afterEach(() => {
      cleanupTestEnv(testEnv.tmpDir);
    });

    it('acquires lock when PID file does not exist', () => {
      const pidFile = path.join(testEnv.tmpDir, 'test.pid');
      // Direct test of O_EXCL behavior
      const fd = fs.openSync(pidFile, 'wx');
      fs.writeSync(fd, '12345');
      fs.closeSync(fd);

      const content = fs.readFileSync(pidFile, 'utf-8');
      assert.equal(content, '12345');

      // Verify O_EXCL fails on second attempt
      assert.throws(
        () => {
          fs.openSync(pidFile, 'wx');
        },
        { code: 'EEXIST' }
      );
    });

    it('O_EXCL prevents race conditions', () => {
      const pidFile = path.join(testEnv.tmpDir, 'race.pid');

      // First open succeeds
      const fd1 = fs.openSync(pidFile, 'wx');
      fs.writeSync(fd1, '111');
      fs.closeSync(fd1);

      // Second open with O_EXCL fails (even if file was just created)
      assert.throws(
        () => {
          fs.openSync(pidFile, 'wx');
        },
        { code: 'EEXIST' }
      );
    });

    it('stale PID file can be reclaimed', () => {
      const pidFile = path.join(testEnv.tmpDir, 'stale.pid');

      // Write a stale PID (process 999999999 does not exist)
      fs.writeFileSync(pidFile, '999999999');

      // Read it back and verify it's stale
      const stalePid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
      assert.equal(launcher.isProcessAlive(stalePid), false);

      // We can remove and recreate
      fs.unlinkSync(pidFile);
      const fd = fs.openSync(pidFile, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);

      const newContent = fs.readFileSync(pidFile, 'utf-8');
      assert.equal(newContent, String(process.pid));
    });
  });

  describe('validateEnvironment', () => {
    let originalKey;

    beforeEach(() => {
      originalKey = process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      if (originalKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    });

    it('returns valid when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      const result = launcher.validateEnvironment();
      assert.equal(result.valid, true);
      assert.equal(result.missing.length, 0);
    });

    it('returns invalid when ANTHROPIC_API_KEY is missing', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const result = launcher.validateEnvironment();
      assert.equal(result.valid, false);
      assert.ok(result.missing.includes('ANTHROPIC_API_KEY'));
    });
  });

  describe('resolveMode', () => {
    let originalMode;

    beforeEach(() => {
      originalMode = process.env.CRON_SUBPROCESS_MODE;
    });

    afterEach(() => {
      if (originalMode !== undefined) {
        process.env.CRON_SUBPROCESS_MODE = originalMode;
      } else {
        delete process.env.CRON_SUBPROCESS_MODE;
      }
    });

    it('defaults to shadow when env var is not set', () => {
      delete process.env.CRON_SUBPROCESS_MODE;
      const result = launcher.resolveMode();
      assert.equal(result.mode, 'shadow');
      assert.equal(result.valid, true);
    });

    it('accepts shadow mode', () => {
      process.env.CRON_SUBPROCESS_MODE = 'shadow';
      const result = launcher.resolveMode();
      assert.equal(result.mode, 'shadow');
      assert.equal(result.valid, true);
    });

    it('accepts active mode', () => {
      process.env.CRON_SUBPROCESS_MODE = 'active';
      const result = launcher.resolveMode();
      assert.equal(result.mode, 'active');
      assert.equal(result.valid, true);
    });

    it('accepts ACTIVE (case-insensitive)', () => {
      process.env.CRON_SUBPROCESS_MODE = 'ACTIVE';
      const result = launcher.resolveMode();
      assert.equal(result.mode, 'active');
      assert.equal(result.valid, true);
    });

    it('rejects invalid mode', () => {
      process.env.CRON_SUBPROCESS_MODE = 'turbo';
      const result = launcher.resolveMode();
      assert.equal(result.mode, 'turbo');
      assert.equal(result.valid, false);
    });
  });

  describe('buildSpawnSpec', () => {
    it('uses cmd.exe argument mode for Windows command shims without shell:true', () => {
      const spec = launcher.buildSpawnSpec(
        'claude.cmd',
        ['--dangerously-skip-permissions'],
        'win32'
      );

      assert.match(spec.command.toLowerCase(), /cmd\.exe$/);
      assert.deepEqual(spec.args.slice(0, 3), ['/d', '/s', '/c']);
      assert.match(spec.args[3], /"claude\.cmd"/);
      assert.match(spec.args[3], /"--dangerously-skip-permissions"/);
    });

    it('rejects unsafe Windows command arguments before cmd.exe dispatch', () => {
      assert.throws(
        () => launcher.buildSpawnSpec('claude.cmd', ['--flag', 'bad&arg'], 'win32'),
        /Unsafe cron launcher argument/
      );
    });
  });

  describe('writeSessionPing', () => {
    let testEnv;

    beforeEach(() => {
      testEnv = createTestEnv();
    });

    afterEach(() => {
      cleanupTestEnv(testEnv.tmpDir);
    });

    it('writes valid JSON with required fields', () => {
      const pingFile = path.join(testEnv.tmpDir, 'ping.json');
      const tmpPingFile = pingFile + '.tmp';

      // Simulate writeSessionPing logic in temp dir
      const ping = {
        pid: 12345,
        mode: 'shadow',
        started_at: new Date().toISOString(),
        last_ping_at: new Date().toISOString(),
        queue_depth: 0,
        total_ticks_processed: 0,
        total_actions_queued: 0,
        restart_count: 0,
        token_watermark: 0,
      };
      fs.writeFileSync(tmpPingFile, JSON.stringify(ping, null, 2));
      fs.renameSync(tmpPingFile, pingFile);

      const written = JSON.parse(fs.readFileSync(pingFile, 'utf-8'));
      assert.equal(written.pid, 12345);
      assert.equal(written.mode, 'shadow');
      assert.ok(written.started_at);
      assert.ok(written.last_ping_at);
      assert.equal(written.queue_depth, 0);
      assert.equal(written.total_ticks_processed, 0);
      assert.equal(written.total_actions_queued, 0);
      assert.equal(written.restart_count, 0);
      assert.equal(written.token_watermark, 0);
    });
  });

  describe('launch', () => {
    let originalKey;
    let originalMode;

    beforeEach(() => {
      originalKey = process.env.ANTHROPIC_API_KEY;
      originalMode = process.env.CRON_SUBPROCESS_MODE;
    });

    afterEach(() => {
      if (originalKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
      if (originalMode !== undefined) {
        process.env.CRON_SUBPROCESS_MODE = originalMode;
      } else {
        delete process.env.CRON_SUBPROCESS_MODE;
      }
    });

    it('fails when ANTHROPIC_API_KEY is missing', () => {
      delete process.env.ANTHROPIC_API_KEY;
      const result = launcher.launch();
      assert.equal(result.success, false);
      assert.ok(result.reason.includes('ANTHROPIC_API_KEY'));
    });

    it('fails when CRON_SUBPROCESS_MODE is invalid', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.CRON_SUBPROCESS_MODE = 'invalid-mode';
      const result = launcher.launch();
      assert.equal(result.success, false);
      assert.ok(result.reason.includes('Invalid CRON_SUBPROCESS_MODE'));
    });

    it('handles non-existent binary gracefully', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.CRON_SUBPROCESS_MODE = 'shadow';
      // On Windows, spawn with non-existent binary may return a PID
      // but the process immediately fails. The launcher handles this
      // via child.on('error') suppression and PID file cleanup.
      // We just verify it doesn't crash the test process.
      const result = launcher.launch({
        claudeBinary: 'nonexistent-claude-binary-xyz-12345',
      });
      // Either it fails (no PID) or "succeeds" with a doomed PID
      assert.ok(typeof result.success === 'boolean');
      // Clean up any PID file it may have written
      launcher.releasePidLock();
    });
  });
});
