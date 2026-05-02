const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const {
  enterDrainMode,
  isDraining,
  exitDrainMode,
  getDrainState,
} = require('../../.claude/lib/context/drain-state.cjs');

test('drain-state > enterDrainMode writes drain-state.json with sessionId and deadline', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-drain-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 }, tmpDir);

  const drainPath = path.join(tmpDir, 'drain-state.json');
  assert.ok(fs.existsSync(drainPath), 'drain-state.json should exist');

  const content = JSON.parse(fs.readFileSync(drainPath, 'utf8'));
  assert.strictEqual(content.sessionId, 'abc');
  assert.ok(content.activatedAt, 'activatedAt should be set');
  assert.ok(content.drainDeadline, 'drainDeadline should be set');

  // Verify deadline is roughly 5 minutes in the future
  const deadlineDate = new Date(content.drainDeadline);
  const now = new Date();
  const diffMinutes = (deadlineDate - now) / 1000 / 60;
  assert.ok(diffMinutes > 4.9 && diffMinutes < 5.1, 'drainDeadline should be ~5 minutes ahead');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('drain-state > isDraining returns true when drain-state.json exists with matching sessionId', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-drain-match-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 }, tmpDir);
  assert.strictEqual(isDraining('abc', tmpDir), true);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('drain-state > isDraining returns false when no drain-state.json', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-drain-none-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  assert.strictEqual(isDraining('abc', tmpDir), false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('drain-state > isDraining returns false for DIFFERENT sessionId (new session)', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-drain-diff-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  enterDrainMode({ sessionId: 'old-session', drainDeadlineMinutes: 5 }, tmpDir);
  assert.strictEqual(isDraining('new-session', tmpDir), false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('drain-state > isDraining returns false when drainDeadline has passed', () => {
  const tmpDir = path.join(
    process.cwd(),
    '.claude/context/runtime/test-drain-expired-' + Date.now()
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  // Manually write expired drain state
  const state = {
    sessionId: 'abc',
    activatedAt: new Date(Date.now() - 120000).toISOString(),
    drainDeadline: new Date(Date.now() - 60000).toISOString(), // 1 min ago
  };
  fs.writeFileSync(path.join(tmpDir, 'drain-state.json'), JSON.stringify(state));

  assert.strictEqual(isDraining('abc', tmpDir), false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('drain-state > exitDrainMode removes drain-state.json', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-drain-exit-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 }, tmpDir);
  const drainPath = path.join(tmpDir, 'drain-state.json');
  assert.ok(fs.existsSync(drainPath));

  exitDrainMode(tmpDir);
  assert.strictEqual(fs.existsSync(drainPath), false, 'File should be removed');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('drain-state > getDrainState returns parsed state or null', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime/test-drain-get-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  assert.strictEqual(getDrainState(tmpDir), null, 'Should return null when missing');

  enterDrainMode({ sessionId: 'abc', drainDeadlineMinutes: 5 }, tmpDir);
  const state = getDrainState(tmpDir);
  assert.ok(state, 'Should return state object');
  assert.strictEqual(state.sessionId, 'abc');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const { execFileSync } = require('child_process');

function runHook(inputJson, env = {}, options = {}) {
  try {
    const hookPath = path.join(process.cwd(), '.claude/hooks/routing/finish-only-guard.cjs');
    // Ensure file exists before running
    if (!fs.existsSync(hookPath)) {
      throw new Error(`Hook file not found: ${hookPath}`);
    }
    const result = execFileSync('node', [hookPath], {
      input: JSON.stringify(inputJson),
      env: { ...process.env, ...env },
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'ignore'],
      encoding: 'utf8',
    });
    return JSON.parse(result);
  } catch (err) {
    if (err.stdout) {
      try {
        return JSON.parse(err.stdout);
      } catch (_e) {
        /* ignore */
      }
    }
    throw err;
  }
}

test('finish-only-guard hook > blocks TaskCreate when draining with matching sessionId', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  enterDrainMode({ sessionId: 'session-matching', drainDeadlineMinutes: 5 }, tmpDir);

  const res = runHook(
    { tool_name: 'TaskCreate', arguments: {} },
    { CLAUDE_SESSION_ID: 'session-matching' }
  );
  assert.strictEqual(res.allow, false);
  assert.ok(res.message.includes('draining') || res.message.includes('Session draining'));

  exitDrainMode(tmpDir);
});

test('finish-only-guard hook > allows TaskCreate when NOT draining', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  exitDrainMode(tmpDir); // ensure clear

  const res = runHook(
    { tool_name: 'TaskCreate', arguments: {} },
    { CLAUDE_SESSION_ID: 'session-clean' }
  );
  assert.strictEqual(res.allow, true);
});

test('finish-only-guard hook > allows TaskCreate when drain sessionId differs (new session)', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  enterDrainMode({ sessionId: 'session-old', drainDeadlineMinutes: 5 }, tmpDir);

  const res = runHook(
    { tool_name: 'TaskCreate', arguments: {} },
    { CLAUDE_SESSION_ID: 'session-new' }
  );
  assert.strictEqual(res.allow, true);

  exitDrainMode(tmpDir);
});

test('finish-only-guard hook > allows TaskUpdate even during drain', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  enterDrainMode({ sessionId: 'session-matching', drainDeadlineMinutes: 5 }, tmpDir);

  const res = runHook(
    { tool_name: 'TaskUpdate', arguments: {} },
    { CLAUDE_SESSION_ID: 'session-matching' }
  );
  assert.strictEqual(res.allow, true);

  exitDrainMode(tmpDir);
});

test('finish-only-guard hook > allows TaskList even during drain', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  enterDrainMode({ sessionId: 'session-matching', drainDeadlineMinutes: 5 }, tmpDir);

  const res = runHook(
    { tool_name: 'TaskList', arguments: {} },
    { CLAUDE_SESSION_ID: 'session-matching' }
  );
  assert.strictEqual(res.allow, true);

  exitDrainMode(tmpDir);
});

test('finish-only-guard hook > allows TaskCreate when drainDeadline expired', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const state = {
    sessionId: 'session-matching',
    activatedAt: new Date(Date.now() - 120000).toISOString(),
    drainDeadline: new Date(Date.now() - 60000).toISOString(), // 1 min ago
  };
  fs.writeFileSync(path.join(tmpDir, 'drain-state.json'), JSON.stringify(state));

  const res = runHook(
    { tool_name: 'TaskCreate', arguments: {} },
    { CLAUDE_SESSION_ID: 'session-matching' }
  );
  assert.strictEqual(res.allow, true);

  exitDrainMode(tmpDir);
});

test('finish-only-guard hook > is fail-open (allows on unexpected errors)', () => {
  const tmpDir = path.join(process.cwd(), '.claude/context/runtime');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // Corrupt the json
  fs.writeFileSync(path.join(tmpDir, 'drain-state.json'), 'not json{');

  const res = runHook(
    { tool_name: 'TaskCreate', arguments: {} },
    { CLAUDE_SESSION_ID: 'session-matching' }
  );
  assert.strictEqual(res.allow, true, 'Should be fail-open');

  exitDrainMode(tmpDir);
});

test('finish-only-guard hook > reads default session and drain state from PROJECT_ROOT when cwd is outside repo', () => {
  const runtimeDir = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
  const sessionPath = path.join(runtimeDir, 'session-id.json');
  const drainPath = path.join(runtimeDir, 'drain-state.json');
  const outsideCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'finish-guard-cwd-'));
  const sessionBackup = fs.existsSync(sessionPath) ? fs.readFileSync(sessionPath, 'utf8') : null;
  const drainBackup = fs.existsSync(drainPath) ? fs.readFileSync(drainPath, 'utf8') : null;

  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      sessionPath,
      JSON.stringify({ sessionId: 'project-root-session', generatedAt: new Date().toISOString() })
    );
    fs.writeFileSync(
      drainPath,
      JSON.stringify({
        sessionId: 'project-root-session',
        activatedAt: new Date().toISOString(),
        drainDeadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
    );

    const res = runHook(
      { tool_name: 'TaskCreate', arguments: {} },
      { CLAUDE_SESSION_ID: '' },
      { cwd: outsideCwd }
    );

    assert.strictEqual(
      res.allow,
      false,
      'TaskCreate should be blocked using project runtime state'
    );
    assert.ok(
      !fs.existsSync(path.join(outsideCwd, '.claude', 'context', 'runtime')),
      'finish-only-guard must not read/write runtime state under process.cwd()'
    );
  } finally {
    if (sessionBackup === null) {
      fs.rmSync(sessionPath, { force: true });
    } else {
      fs.writeFileSync(sessionPath, sessionBackup, 'utf8');
    }
    if (drainBackup === null) {
      fs.rmSync(drainPath, { force: true });
    } else {
      fs.writeFileSync(drainPath, drainBackup, 'utf8');
    }
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
});
