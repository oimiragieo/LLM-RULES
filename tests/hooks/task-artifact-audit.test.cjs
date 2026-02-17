'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const HOOK_PATH = path.join(PROJECT_ROOT, '.claude', 'hooks', 'routing', 'post-task-unified.cjs');
const RUNTIME_TEST_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'tmp',
  'task-artifact-audit-runtime'
);
const CONTRACTS_PATH = path.join(RUNTIME_TEST_DIR, 'task-output-contracts.json');
const TASK_STATUS_PATH = path.join(RUNTIME_TEST_DIR, 'task-status.json');
const TASK_STATUS_LOCK_PATH = path.join(RUNTIME_TEST_DIR, 'task-status.lock');
const RECOVERY_QUEUE_PATH = path.join(RUNTIME_TEST_DIR, 'taskupdate-recovery-queue.jsonl');
const AUDIT_PATH = path.join(RUNTIME_TEST_DIR, 'task-artifact-audit.jsonl');

function runHook(input) {
  return cp.spawnSync(process.execPath, [HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      TASK_OUTPUT_CONTRACTS_PATH: CONTRACTS_PATH,
      TASK_ARTIFACT_AUDIT_PATH: AUDIT_PATH,
      TASKUPDATE_RECOVERY_QUEUE_PATH: RECOVERY_QUEUE_PATH,
      TASK_STATUS_FILE_PATH: TASK_STATUS_PATH,
      TASK_STATUS_LOCK_PATH,
    },
    shell: false,
  });
}

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

function writeContracts(taskId, requiredOutputs) {
  fs.mkdirSync(path.dirname(CONTRACTS_PATH), { recursive: true });
  fs.writeFileSync(
    CONTRACTS_PATH,
    JSON.stringify(
      {
        tasks: {
          [taskId]: {
            requiredOutputs,
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

test('post-task-unified writes artifact audit entry with contract metadata', () => {
  const contractsSnapshot = backup(CONTRACTS_PATH);
  const auditSnapshot = backup(AUDIT_PATH);
  try {
    const taskId = 'task-artifact-audit-1';
    writeContracts(taskId, ['.claude/context/reports/audit-target.md']);
    if (fs.existsSync(AUDIT_PATH)) fs.rmSync(AUDIT_PATH, { force: true });

    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId,
        status: 'in_progress',
      },
    };
    const result = runHook(input);
    assert.equal(result.status, 0, `hook failed: ${result.stderr || result.stdout}`);
    assert.ok(fs.existsSync(AUDIT_PATH), 'expected task artifact audit file to be created');

    const lines = fs
      .readFileSync(AUDIT_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const last = lines[lines.length - 1];
    assert.equal(last.taskId, taskId);
    assert.equal(last.status, 'in_progress');
    assert.equal(last.hasOutputContract, true);
    assert.equal(last.requiredOutputCount, 1);
  } finally {
    restore(CONTRACTS_PATH, contractsSnapshot);
    restore(AUDIT_PATH, auditSnapshot);
  }
});

test('post-task-unified audit entry is still written when no contract exists', () => {
  const contractsSnapshot = backup(CONTRACTS_PATH);
  const auditSnapshot = backup(AUDIT_PATH);
  try {
    if (fs.existsSync(CONTRACTS_PATH)) fs.rmSync(CONTRACTS_PATH, { force: true });
    if (fs.existsSync(AUDIT_PATH)) fs.rmSync(AUDIT_PATH, { force: true });
    const taskId = 'task-artifact-audit-2';

    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId,
        status: 'completed',
      },
    };
    const result = runHook(input);
    assert.equal(result.status, 0, `hook failed: ${result.stderr || result.stdout}`);

    const lines = fs
      .readFileSync(AUDIT_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    const last = lines[lines.length - 1];
    assert.equal(last.taskId, taskId);
    assert.equal(last.hasOutputContract, false);
    assert.equal(last.requiredOutputCount, 0);
  } finally {
    restore(CONTRACTS_PATH, contractsSnapshot);
    restore(AUDIT_PATH, auditSnapshot);
  }
});
