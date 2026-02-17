'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const POST_TASK_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'post-task-unified.cjs'
);
const RUNTIME_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'tmp',
  'task-output-contract-runtime'
);
const CONTRACTS_PATH = path.join(RUNTIME_DIR, 'task-output-contracts.json');
const TASK_STATUS_PATH = path.join(RUNTIME_DIR, 'task-status.json');
const RECOVERY_QUEUE_PATH = path.join(RUNTIME_DIR, 'taskupdate-recovery-queue.jsonl');
const TASK_STATUS_LOCK_PATH = path.join(RUNTIME_DIR, 'task-status.lock');
const TMP_REPORT = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'tmp',
  'task-output-contract-tests',
  'delivered-report.md'
);

function backup(pathname) {
  if (!fs.existsSync(pathname)) return null;
  return fs.readFileSync(pathname, 'utf8');
}

function restore(pathname, snapshot) {
  if (snapshot === null) {
    if (fs.existsSync(pathname)) fs.rmSync(pathname, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(pathname), { recursive: true });
  fs.writeFileSync(pathname, snapshot, 'utf8');
}

function runPostTask(input) {
  return cp.spawnSync(process.execPath, [POST_TASK_HOOK], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      TASK_OUTPUT_CONTRACTS_PATH: CONTRACTS_PATH,
      TASKUPDATE_RECOVERY_QUEUE_PATH: RECOVERY_QUEUE_PATH,
      TASK_STATUS_FILE_PATH: TASK_STATUS_PATH,
      TASK_STATUS_LOCK_PATH,
    },
    shell: false,
  });
}

function writeContracts(taskId, outputs) {
  fs.mkdirSync(path.dirname(CONTRACTS_PATH), { recursive: true });
  fs.writeFileSync(
    CONTRACTS_PATH,
    JSON.stringify(
      {
        tasks: {
          [taskId]: {
            requiredOutputs: outputs,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
}

function writeTaskStatus(taskId, status) {
  fs.mkdirSync(path.dirname(TASK_STATUS_PATH), { recursive: true });
  let payload = {};
  if (fs.existsSync(TASK_STATUS_PATH)) {
    payload = JSON.parse(fs.readFileSync(TASK_STATUS_PATH, 'utf8'));
  }
  payload[taskId] = status;
  fs.writeFileSync(TASK_STATUS_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

function readTaskStatus(taskId) {
  if (!fs.existsSync(TASK_STATUS_PATH)) return 'pending';
  const payload = JSON.parse(fs.readFileSync(TASK_STATUS_PATH, 'utf8'));
  return payload[taskId] || 'pending';
}

test('TaskOutput completed does not advance lifecycle when required artifacts are missing', () => {
  const contractsSnapshot = backup(CONTRACTS_PATH);
  const statusSnapshot = backup(TASK_STATUS_PATH);
  const queueSnapshot = backup(RECOVERY_QUEUE_PATH);
  fs.rmSync(path.dirname(TMP_REPORT), { recursive: true, force: true });
  try {
    const taskId = 'task-taskoutput-missing-artifact';
    writeContracts(taskId, [TMP_REPORT]);
    writeTaskStatus(taskId, 'in_progress');
    if (fs.existsSync(RECOVERY_QUEUE_PATH)) fs.rmSync(RECOVERY_QUEUE_PATH, { force: true });

    const result = runPostTask({
      tool_name: 'TaskOutput',
      tool_input: { task_id: taskId },
      tool_output: { status: 'completed' },
    });
    assert.equal(result.status, 0, `hook should not crash: ${result.stderr || result.stdout}`);
    assert.equal(
      readTaskStatus(taskId),
      'in_progress',
      'task status must remain in_progress when required artifacts are missing'
    );
    const queue = fs.existsSync(RECOVERY_QUEUE_PATH)
      ? fs.readFileSync(RECOVERY_QUEUE_PATH, 'utf8')
      : '';
    assert.match(queue, /taskoutput_completed_missing_required_outputs/);
  } finally {
    restore(CONTRACTS_PATH, contractsSnapshot);
    restore(TASK_STATUS_PATH, statusSnapshot);
    restore(RECOVERY_QUEUE_PATH, queueSnapshot);
    fs.rmSync(path.dirname(TMP_REPORT), { recursive: true, force: true });
  }
});

test('TaskOutput completed advances lifecycle when required artifacts are present', () => {
  const contractsSnapshot = backup(CONTRACTS_PATH);
  const statusSnapshot = backup(TASK_STATUS_PATH);
  const queueSnapshot = backup(RECOVERY_QUEUE_PATH);
  fs.rmSync(path.dirname(TMP_REPORT), { recursive: true, force: true });
  try {
    const taskId = 'task-taskoutput-artifact-present';
    fs.mkdirSync(path.dirname(TMP_REPORT), { recursive: true });
    fs.writeFileSync(TMP_REPORT, '# Report\n\nDelivered.\n', 'utf8');
    writeContracts(taskId, [TMP_REPORT]);
    writeTaskStatus(taskId, 'in_progress');
    if (fs.existsSync(RECOVERY_QUEUE_PATH)) fs.rmSync(RECOVERY_QUEUE_PATH, { force: true });

    const result = runPostTask({
      tool_name: 'TaskOutput',
      tool_input: { task_id: taskId },
      tool_output: { status: 'completed' },
    });
    assert.equal(result.status, 0, `hook should not crash: ${result.stderr || result.stdout}`);
    assert.equal(
      readTaskStatus(taskId),
      'completed',
      'task status should advance when artifacts exist'
    );
    const queue = fs.existsSync(RECOVERY_QUEUE_PATH)
      ? fs.readFileSync(RECOVERY_QUEUE_PATH, 'utf8')
      : '';
    assert.match(queue, /taskoutput_completed_without_taskupdate/);
  } finally {
    restore(CONTRACTS_PATH, contractsSnapshot);
    restore(TASK_STATUS_PATH, statusSnapshot);
    restore(RECOVERY_QUEUE_PATH, queueSnapshot);
    fs.rmSync(path.dirname(TMP_REPORT), { recursive: true, force: true });
  }
});
