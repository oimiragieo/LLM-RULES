const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { PROJECT_ROOT } = require('../../../.claude/lib/utils/project-root.cjs');
const { enterDrainMode, getDrainState } = require('../../../.claude/lib/context/drain-state.cjs');
const { getOrCreateSessionId } = require('../../../.claude/lib/context/session-id-manager.cjs');
const { readHandoverLog } = require('../../../.claude/lib/context/shift-change-log-reader.cjs');
const { writeHandoverLog } = require('../../../.claude/lib/context/shift-change-log-writer.cjs');

const PROJECT_RUNTIME_DIR = path.join(PROJECT_ROOT, '.claude', 'context', 'runtime');
const DRAIN_STATE_FILE = path.join(PROJECT_RUNTIME_DIR, 'drain-state.json');
const SESSION_ID_FILE = path.join(PROJECT_RUNTIME_DIR, 'session-id.json');
const SHIFT_CHANGE_FILE = path.join(PROJECT_RUNTIME_DIR, 'shift-change-log.json');
const SHIFT_CHANGE_TMP_FILE = SHIFT_CHANGE_FILE + '.tmp';

function backupFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function restoreFile(filePath, backup) {
  if (backup === null) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, backup, 'utf8');
}

function withOutsideCwd(fn) {
  const oldCwd = process.cwd();
  const outsideCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'context-outside-cwd-'));
  try {
    process.chdir(outsideCwd);
    return fn(outsideCwd);
  } finally {
    process.chdir(oldCwd);
    fs.rmSync(outsideCwd, { recursive: true, force: true });
  }
}

test('drain-state defaults to PROJECT_ROOT runtime when cwd is outside repo', () => {
  const backup = backupFile(DRAIN_STATE_FILE);
  try {
    fs.rmSync(DRAIN_STATE_FILE, { force: true });

    withOutsideCwd(outsideCwd => {
      enterDrainMode({ sessionId: 'project-root-drain', drainDeadlineMinutes: 5 });

      assert.ok(fs.existsSync(DRAIN_STATE_FILE), 'drain state must be written under PROJECT_ROOT');
      assert.equal(getDrainState().sessionId, 'project-root-drain');
      assert.equal(
        fs.existsSync(path.join(outsideCwd, '.claude', 'context', 'runtime', 'drain-state.json')),
        false,
        'drain state must not be written under process.cwd()'
      );
    });
  } finally {
    restoreFile(DRAIN_STATE_FILE, backup);
  }
});

test('session-id-manager defaults to PROJECT_ROOT runtime when cwd is outside repo', () => {
  const backup = backupFile(SESSION_ID_FILE);
  const originalSessionId = process.env.CLAUDE_SESSION_ID;

  try {
    delete process.env.CLAUDE_SESSION_ID;
    fs.rmSync(SESSION_ID_FILE, { force: true });

    withOutsideCwd(outsideCwd => {
      const sessionId = getOrCreateSessionId(undefined, { force: true });

      assert.ok(sessionId, 'session id should be generated');
      assert.ok(fs.existsSync(SESSION_ID_FILE), 'session id must be written under PROJECT_ROOT');
      assert.equal(
        fs.existsSync(path.join(outsideCwd, '.claude', 'context', 'runtime', 'session-id.json')),
        false,
        'session id must not be written under process.cwd()'
      );
    });
  } finally {
    if (originalSessionId === undefined) {
      delete process.env.CLAUDE_SESSION_ID;
    } else {
      process.env.CLAUDE_SESSION_ID = originalSessionId;
    }
    restoreFile(SESSION_ID_FILE, backup);
  }
});

test('shift-change-log reader defaults to PROJECT_ROOT runtime when cwd is outside repo', () => {
  const backup = backupFile(SHIFT_CHANGE_FILE);
  try {
    fs.mkdirSync(PROJECT_RUNTIME_DIR, { recursive: true });
    fs.writeFileSync(
      SHIFT_CHANGE_FILE,
      JSON.stringify({
        schemaVersion: '1.0.0',
        handoffId: '123e4567-e89b-12d3-a456-426614174000',
        generation: 1,
        status: 'READY',
        sessionId: 'project-root-reader',
        timestamp: new Date().toISOString(),
      })
    );

    withOutsideCwd(outsideCwd => {
      const log = readHandoverLog();

      assert.equal(log.sessionId, 'project-root-reader');
      assert.equal(
        fs.existsSync(path.join(outsideCwd, '.claude', 'context', 'runtime')),
        false,
        'reader must not use process.cwd() for default runtime lookup'
      );
    });
  } finally {
    restoreFile(SHIFT_CHANGE_FILE, backup);
  }
});

test('shift-change-log writer defaults schema and output paths to PROJECT_ROOT when cwd is outside repo', () => {
  const backup = backupFile(SHIFT_CHANGE_FILE);
  try {
    fs.rmSync(SHIFT_CHANGE_FILE, { force: true });
    fs.rmSync(SHIFT_CHANGE_TMP_FILE, { force: true });

    withOutsideCwd(outsideCwd => {
      const result = writeHandoverLog({
        schemaVersion: '1.0.0',
        generation: 1,
        sessionId: 'project-root-writer',
      });

      assert.equal(result.sessionId, 'project-root-writer');
      assert.ok(
        fs.existsSync(SHIFT_CHANGE_FILE),
        'shift-change log must be written under PROJECT_ROOT'
      );
      assert.equal(
        fs.existsSync(path.join(outsideCwd, '.claude', 'context', 'runtime')),
        false,
        'shift-change writer must not write default output under process.cwd()'
      );
    });
  } finally {
    restoreFile(SHIFT_CHANGE_FILE, backup);
    fs.rmSync(SHIFT_CHANGE_TMP_FILE, { force: true });
  }
});
