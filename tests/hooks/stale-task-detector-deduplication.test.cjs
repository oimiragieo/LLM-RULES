// F-LIFECYCLE regression test: stale-task-detector emits at most once per cooldown window per task
'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('child_process');
const { PROJECT_ROOT } = require('../../.claude/lib/utils/project-root.cjs');

const DETECTOR_SCRIPT = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'session',
  'stale-task-detector.cjs'
);
const TASKUPDATE_STATE_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'taskupdate-first-state.json'
);
const GAP_LOG_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'session-gap-log.jsonl'
);
const COOLDOWN_FILE = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'runtime',
  'stale-task-emission-cooldown.json'
);

function backupFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}
function restoreFile(filePath, backup) {
  if (backup !== null) {
    fs.writeFileSync(filePath, backup, 'utf8');
  } else {
    fs.rmSync(filePath, { force: true });
  }
}

function runDetector(env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [DETECTOR_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(env || {}),
        STALE_TASK_AUTO_QUEUE: 'off',
        STALE_TASK_THRESHOLD_MS: '1',
        STALE_TASK_EMISSION_COOLDOWN_MS: String(60 * 60 * 1000),
      },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('close', code => resolve({ code, stdout: out, stderr: err }));
  });
}

function countNewMentions(taskId, beforeLen) {
  if (!fs.existsSync(GAP_LOG_FILE)) return 0;
  const newContent = fs.readFileSync(GAP_LOG_FILE, 'utf8').slice(beforeLen);
  return newContent.split('\n').filter(l => l.trim() && l.includes(taskId)).length;
}

describe('stale-task-detector cooldown deduplication', { concurrency: 1 }, () => {
  let stateBackup = null;
  let cooldownBackup = null;
  let gapLogBackup = null;
  const TEST_TASK = 'test-cooldown-dedup-' + process.pid;
  const TEST_SESSION = 'test-cooldown-sess-' + process.pid;

  before(() => {
    stateBackup = backupFile(TASKUPDATE_STATE_FILE);
    cooldownBackup = backupFile(COOLDOWN_FILE);
    gapLogBackup = backupFile(GAP_LOG_FILE) || '';
    fs.mkdirSync(path.dirname(TASKUPDATE_STATE_FILE), { recursive: true });
    fs.writeFileSync(
      TASKUPDATE_STATE_FILE,
      JSON.stringify(
        {
          sessions: {
            [TEST_SESSION]: {
              inProgress: true,
              taskId: TEST_TASK,
              updatedAt: Date.now() - 30 * 60 * 1000,
            },
          },
        },
        null,
        2
      )
    );
    fs.rmSync(COOLDOWN_FILE, { force: true });
  });

  after(() => {
    restoreFile(TASKUPDATE_STATE_FILE, stateBackup);
    restoreFile(COOLDOWN_FILE, cooldownBackup);
    restoreFile(GAP_LOG_FILE, gapLogBackup);
  });

  test('first run emits stale warning and writes cooldown file', async () => {
    const { stderr } = await runDetector();
    assert.ok(stderr.includes(TEST_TASK), 'first run should emit STALE-TASK for ' + TEST_TASK);
    assert.ok(fs.existsSync(COOLDOWN_FILE), 'cooldown file must be written after first run');
    const cd = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
    assert.ok(
      Object.prototype.hasOwnProperty.call(cd, TEST_TASK),
      'cooldown file must contain task id'
    );
  });

  test('second run within cooldown window suppresses emission', async () => {
    const before = fs.existsSync(GAP_LOG_FILE) ? fs.readFileSync(GAP_LOG_FILE, 'utf8') : '';
    const { stderr } = await runDetector();
    assert.ok(
      !stderr.includes(TEST_TASK),
      'second run must NOT re-emit STALE-TASK for ' + TEST_TASK
    );
    const newMentions = countNewMentions(TEST_TASK, before.length);
    assert.equal(newMentions, 0, 'gap log should have 0 new mentions on cooldown-suppressed run');
  });

  test('cooldown file has valid recent timestamp', () => {
    const cd = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8'));
    const ts = Number(cd[TEST_TASK]);
    assert.ok(!isNaN(ts) && ts > 0, 'timestamp must be positive number');
    assert.ok(ts >= Date.now() - 30000 && ts <= Date.now() + 1000, 'timestamp must be recent');
  });
});
