'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const LAUNCHER_PATH = path.join(
  PROJECT_ROOT,
  '.claude',
  'tools',
  'cli',
  'cron-session-launcher.cjs'
);
const TEST_ENV = { ...process.env, ANTHROPIC_API_KEY: 'test-key-123' };

test('cron-session-launcher', async t => {
  // Use a unique PID file path for tests by overriding the constant internally or running in dedicated dir?
  // Our script hardcodes PID_FILE to PROJECT_ROOT/.claude/context/runtime/cron-runner.pid.
  // This is a test, so we manipulate the environment and file carefully.
  const PID_FILE = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime', 'cron-runner.pid');

  // Cleanup any lingering lock from failed manual tests
  if (fs.existsSync(PID_FILE)) {
    try {
      fs.unlinkSync(PID_FILE);
    } catch (_e) {
      /* best-effort cleanup */
    }
  }

  await t.test('fails when ANTHROPIC_API_KEY is missing', () => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const res = spawnSync(process.execPath, [LAUNCHER_PATH], { env, encoding: 'utf8' });

    assert.strictEqual(res.status, 1, 'Should exit 1 on missing creds');
    assert.match(
      res.stderr,
      /ANTHROPIC_API_KEY environment variable is required/,
      'Should print fatal error'
    );
  });

  await t.test('fails when CRON_SUBPROCESS_MODE is invalid', () => {
    const res = spawnSync(process.execPath, [LAUNCHER_PATH], {
      env: { ...TEST_ENV, CRON_SUBPROCESS_MODE: 'invalid_mode' },
      encoding: 'utf8',
    });

    assert.strictEqual(res.status, 1, 'Should exit 1 on invalid mode');
    assert.match(res.stderr, /Invalid CRON_SUBPROCESS_MODE/, 'Should print invalid mode error');
  });

  await t.test('PID lock - O_EXCL race prevention (M4 test)', () => {
    // We simulate an existing lock by writing a dummy PID that definitely doesn't exist
    // process.kill(999999, 0) should throw, treating it as stale, allowing overwrite!
    // But wait, if we write the CURRENT process PID (process.pid), it's considered ALIVE.
    // Let's write process.pid to simulate a running instance.

    fs.writeFileSync(PID_FILE, String(process.pid));

    const res = spawnSync(process.execPath, [LAUNCHER_PATH], {
      env: TEST_ENV,
      encoding: 'utf8',
    });

    // The launcher should gracefully exit 0 because it sees an existing alive process
    assert.strictEqual(res.status, 0, 'Should exit 0 when an instance is already running');
    assert.match(
      res.stdout,
      /Found running cron-runner instance/,
      'Should log that instance is already running'
    );

    // The PID file should remain untouched
    const currentPid = fs.readFileSync(PID_FILE, 'utf8');
    assert.strictEqual(
      currentPid,
      String(process.pid),
      'Should not modify the lockfile owned by alive process'
    );

    // Clean up
    fs.unlinkSync(PID_FILE);
  });

  await t.test('PID lock - recovers from stale lock', () => {
    // Write a PID that doesn't exist (e.g., a huge number or 999999)
    fs.writeFileSync(PID_FILE, '999999');

    // We can't let it actually spawn Claude CLI because it would leave an orphaned background process in CI.
    // So we just test that the require'd module can acquire the lock natively.
    const { acquireLockSync, releaseLockSync } = require(LAUNCHER_PATH);

    assert.doesNotThrow(() => {
      acquireLockSync();
    }, 'acquireLockSync should recover from a dead process lock');

    const newPid = fs.readFileSync(PID_FILE, 'utf8');
    assert.strictEqual(
      newPid,
      String(process.pid),
      'Should have overwritten stale lock with current process PID'
    );

    // Clean up using the module's cleanup function
    releaseLockSync();
    assert.strictEqual(fs.existsSync(PID_FILE), false, 'Should have deleted the lockfile');
  });
});
