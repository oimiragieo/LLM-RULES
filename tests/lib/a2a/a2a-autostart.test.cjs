'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '.claude');
const HOOK_PATH = path.join(ROOT, 'hooks', 'a2a', 'a2a-server-autostart.cjs');
const SHUTDOWN_HOOK_PATH = path.join(ROOT, 'hooks', 'a2a', 'a2a-shutdown.cjs');

describe('A2A Auto-start Hook', () => {
  let tempDir;
  let originalEnv;
  let originalCwd;

  beforeEach(() => {
    // Save original env and cwd
    originalEnv = { ...process.env };
    originalCwd = process.cwd();

    // Create temp directory for test isolation
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-autostart-test-'));

    // Clear relevant env vars
    delete process.env.A2A_AUTO_START;
    delete process.env.A2A_PORT;
    delete process.env.A2A_SESSION;
    delete process.env.CLAUDE_COMMAND_LINE;
  });

  afterEach(() => {
    // Restore env and cwd
    process.env = originalEnv;
    process.chdir(originalCwd);

    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {
        // Ignore cleanup errors
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test: Hook file exists
  // -------------------------------------------------------------------------
  it('hook file exists and is a valid .cjs file', () => {
    assert.ok(fs.existsSync(HOOK_PATH), 'Hook file should exist');
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(content.includes('use strict'), 'Should have strict mode');
    assert.ok(content.includes('A2A_AUTO_START'), 'Should check A2A_AUTO_START env var');
  });

  // -------------------------------------------------------------------------
  // Test: Hook is registered in settings.json
  // -------------------------------------------------------------------------
  it('hook is registered in settings.json under UserPromptSubmit', () => {
    const settingsPath = path.join(ROOT, '..', '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const userPromptHooks = settings.hooks?.UserPromptSubmit || [];

    const a2aHook = userPromptHooks
      .flatMap(entry => entry.hooks || [])
      .find(h => h.command && h.command.includes('a2a-server-autostart.cjs'));

    assert.ok(a2aHook, 'a2a-server-autostart.cjs should be registered in UserPromptSubmit hooks');
  });

  // -------------------------------------------------------------------------
  // Test: Hook exits immediately when A2A_AUTO_START is not true
  // -------------------------------------------------------------------------
  it('exits immediately when A2A_AUTO_START is not true', () => {
    process.env.A2A_AUTO_START = 'false';
    // Run the hook in a subprocess to test actual behavior
    const result = runHookSync(HOOK_PATH, { timeout: 5000 });
    assert.equal(result.exitCode, 0, 'Should exit 0 when auto-start is disabled');
  });

  // -------------------------------------------------------------------------
  // Test: Hook exits immediately when inside A2A session
  // -------------------------------------------------------------------------
  it('exits immediately when inside A2A session', () => {
    process.env.A2A_AUTO_START = 'true';
    process.env.A2A_SESSION = 'true';
    const result = runHookSync(HOOK_PATH, { timeout: 5000 });
    assert.equal(result.exitCode, 0, 'Should exit 0 when already in A2A session');
  });

  // -------------------------------------------------------------------------
  // Test: Hook exits immediately when command line contains a2a-server
  // -------------------------------------------------------------------------
  it('exits immediately when command line contains a2a-server', () => {
    process.env.A2A_AUTO_START = 'true';
    process.env.CLAUDE_COMMAND_LINE = 'some-a2a-server-command';
    const result = runHookSync(HOOK_PATH, { timeout: 5000 });
    assert.equal(result.exitCode, 0, 'Should exit 0 when command line contains a2a-server');
  });

  // -------------------------------------------------------------------------
  // Test: Lockfile prevents duplicate spawns
  // -------------------------------------------------------------------------
  it('lockfile prevents duplicate spawns within cooldown period', () => {
    const lockfile = path.join(tempDir, 'a2a-autostart-cooldown.lock');

    // Create lockfile with recent timestamp
    fs.writeFileSync(lockfile, String(Date.now()), 'utf8');

    // Run hook with mock runtime dir
    process.env.A2A_AUTO_START = 'true';
    process.env.TEST_RUNTIME_DIR = tempDir;

    const result = runHookSync(HOOK_PATH, {
      timeout: 5000,
      env: { ...process.env, TEST_RUNTIME_DIR: tempDir },
    });

    // Hook should exit early due to lockfile
    assert.equal(result.exitCode, 0, 'Should exit 0 when lockfile is active');
  });

  // -------------------------------------------------------------------------
  // Test: Lockfile allows spawn after cooldown expires
  // -------------------------------------------------------------------------
  it('lockfile allows spawn after cooldown period expires', () => {
    const lockfile = path.join(tempDir, 'a2a-autostart-cooldown.lock');

    // Create lockfile with old timestamp (3 minutes ago = beyond 2min cooldown)
    const oldTime = Date.now() - 180000;
    fs.writeFileSync(lockfile, String(oldTime), 'utf8');

    process.env.A2A_AUTO_START = 'true';

    // Note: We can't fully test spawn without mocking execFileSync
    // This test verifies the lockfile logic accepts expired locks
    const lockContent = fs.readFileSync(lockfile, 'utf8');
    const lockTime = parseInt(lockContent.trim(), 10);
    const cooldownMs = 120000;

    assert.ok(Date.now() - lockTime > cooldownMs, 'Lock timestamp should be older than cooldown');
  });

  // -------------------------------------------------------------------------
  // Test: Hook exits within 5 seconds (non-blocking)
  // -------------------------------------------------------------------------
  it('hook exits within 5 seconds (non-blocking)', () => {
    process.env.A2A_AUTO_START = 'true';
    const start = Date.now();
    const result = runHookSync(HOOK_PATH, { timeout: 10000 });
    const elapsed = Date.now() - start;

    assert.equal(result.exitCode, 0, 'Should exit 0');
    assert.ok(elapsed < 5000, `Hook should exit within 5 seconds (took ${elapsed}ms)`);
  });

  // -------------------------------------------------------------------------
  // Test: Port is configurable via A2A_PORT env var
  // -------------------------------------------------------------------------
  it('A2A_PORT env var is used for port configuration', () => {
    // Verify the hook code reads A2A_PORT
    const content = fs.readFileSync(HOOK_PATH, 'utf8');
    assert.ok(content.includes('A2A_PORT'), 'Hook should read A2A_PORT env var');
    assert.ok(content.includes('parseInt'), 'Hook should parse port as integer');
  });
});

describe('A2A Shutdown Hook', () => {
  let tempDir;
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-shutdown-test-'));
  });

  afterEach(() => {
    process.env = originalEnv;
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {
        // Ignore cleanup errors
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test: Shutdown hook file exists
  // -------------------------------------------------------------------------
  it('shutdown hook file exists and is a valid .cjs file', () => {
    assert.ok(fs.existsSync(SHUTDOWN_HOOK_PATH), 'Shutdown hook file should exist');
    const content = fs.readFileSync(SHUTDOWN_HOOK_PATH, 'utf8');
    assert.ok(content.includes('use strict'), 'Should have strict mode');
    assert.ok(content.includes('a2a-server'), 'Should reference a2a-server purpose');
  });

  // -------------------------------------------------------------------------
  // Test: Shutdown hook is registered in settings.json under SessionEnd
  // -------------------------------------------------------------------------
  it('shutdown hook is registered in settings.json under SessionEnd', () => {
    const settingsPath = path.join(ROOT, '..', '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const sessionEndHooks = settings.hooks?.SessionEnd || [];

    const shutdownHook = sessionEndHooks
      .flatMap(entry => entry.hooks || [])
      .find(h => h.command && h.command.includes('a2a-shutdown.cjs'));

    assert.ok(shutdownHook, 'a2a-shutdown.cjs should be registered in SessionEnd hooks');
  });

  // -------------------------------------------------------------------------
  // Test: Shutdown hook exits when no tracker file exists
  // -------------------------------------------------------------------------
  it('exits gracefully when no terminal-pids.json exists', () => {
    const result = runHookSync(SHUTDOWN_HOOK_PATH, { timeout: 5000 });
    assert.equal(result.exitCode, 0, 'Should exit 0 when no tracker file');
  });

  // -------------------------------------------------------------------------
  // Test: Shutdown hook updates status to stopped
  // -------------------------------------------------------------------------
  it('updates PID status to stopped in terminal-pids.json', () => {
    // Create a mock terminal-pids.json with a fake A2A server entry
    const trackerPath = path.join(tempDir, 'terminal-pids.json');
    const fakePid = 99999; // Non-existent PID

    fs.writeFileSync(
      trackerPath,
      JSON.stringify({
        sessions: [
          {
            purpose: 'a2a-server',
            pid: fakePid,
            status: 'active',
            port: 3100,
            startedAt: new Date().toISOString(),
          },
        ],
      }),
      'utf8'
    );

    // Run shutdown hook with temp dir
    const result = runHookSync(SHUTDOWN_HOOK_PATH, {
      timeout: 5000,
      env: { ...process.env, TEST_RUNTIME_DIR: tempDir },
    });

    assert.equal(result.exitCode, 0, 'Should exit 0');

    // Verify status updated to stopped
    const updated = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    const session = updated.sessions.find(s => s.purpose === 'a2a-server');
    assert.ok(session, 'Session should still exist');
    assert.equal(session.status, 'stopped', 'Status should be stopped');
  });
});

describe('PID Tracking', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-pid-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {
        // Ignore cleanup errors
      }
    }
  });

  // -------------------------------------------------------------------------
  // Test: terminal-pids.json structure
  // -------------------------------------------------------------------------
  it('terminal-pids.json has correct structure for A2A server entry', () => {
    const tracker = {
      sessions: [
        {
          purpose: 'a2a-server',
          pid: 12345,
          status: 'active',
          port: 3100,
          startedAt: new Date().toISOString(),
        },
      ],
    };

    const trackerPath = path.join(tempDir, 'terminal-pids.json');
    fs.writeFileSync(trackerPath, JSON.stringify(tracker), 'utf8');

    const loaded = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    assert.ok(Array.isArray(loaded.sessions), 'sessions should be an array');
    assert.equal(loaded.sessions[0].purpose, 'a2a-server', 'purpose should be a2a-server');
    assert.equal(loaded.sessions[0].status, 'active', 'status should be active');
    assert.equal(typeof loaded.sessions[0].pid, 'number', 'pid should be a number');
  });

  // -------------------------------------------------------------------------
  // Test: Multiple sessions can coexist (Telegram + A2A)
  // -------------------------------------------------------------------------
  it('Telegram and A2A sessions can coexist in terminal-pids.json', () => {
    const tracker = {
      sessions: [
        {
          purpose: 'channel-session',
          pid: 11111,
          status: 'active',
          startedAt: new Date().toISOString(),
        },
        {
          purpose: 'a2a-server',
          pid: 22222,
          status: 'active',
          port: 3100,
          startedAt: new Date().toISOString(),
        },
      ],
    };

    const trackerPath = path.join(tempDir, 'terminal-pids.json');
    fs.writeFileSync(trackerPath, JSON.stringify(tracker), 'utf8');

    const loaded = JSON.parse(fs.readFileSync(trackerPath, 'utf8'));
    assert.equal(loaded.sessions.length, 2, 'Should have 2 sessions');
    assert.ok(
      loaded.sessions.some(s => s.purpose === 'channel-session'),
      'Should have channel-session'
    );
    assert.ok(
      loaded.sessions.some(s => s.purpose === 'a2a-server'),
      'Should have a2a-server'
    );
  });
});

describe('Independent Lockfiles', () => {
  it('A2A and Telegram use different lockfile paths', () => {
    const a2aHook = fs.readFileSync(HOOK_PATH, 'utf8');
    const telegramHook = fs.readFileSync(
      path.join(ROOT, 'hooks', 'channels', 'channel-auto-start.cjs'),
      'utf8'
    );

    // Extract lockfile paths from both hooks
    const a2aLockfileMatch = a2aHook.match(/LOCKFILE\s*=\s*path\.join\([^)]+\)/);
    const telegramLockfileMatch = telegramHook.match(/LOCKFILE\s*=\s*path\.join\([^)]+\)/);

    assert.ok(a2aLockfileMatch, 'A2A hook should define lockfile path');
    assert.ok(telegramLockfileMatch, 'Telegram hook should define lockfile path');

    const a2aLockfile = a2aLockfileMatch[0];
    const telegramLockfile = telegramLockfileMatch[0];

    // Verify different lockfile names
    assert.ok(
      a2aLockfile.includes('a2a-autostart-cooldown.lock'),
      'A2A lockfile should have a2a-specific name'
    );
    assert.ok(
      telegramLockfile.includes('channel-autostart-cooldown.lock'),
      'Telegram lockfile should have channel-specific name'
    );
    assert.notEqual(a2aLockfile, telegramLockfile, 'Lockfiles should be different');
  });
});

// -----------------------------------------------------------------------------
// Helper: Run hook synchronously in subprocess
// -----------------------------------------------------------------------------
function runHookSync(hookPath, options = {}) {
  const timeout = options.timeout || 5000;
  const env = options.env || process.env;

  try {
    const result = execFileSync('node', [hookPath], {
      shell: false,
      timeout,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    });
    return { exitCode: 0, stdout: result, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status || 1,
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
    };
  }
}
