'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SPAWN_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'routing',
  'spawn-prompt-assembler.cjs'
);
const PRE_COMPLETION_HOOK = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'validation',
  'pre-completion-validation.cjs'
);
const RUNTIME_TEST_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'tmp',
  'task-artifact-contract-runtime'
);
const CONTRACTS_PATH = path.join(RUNTIME_TEST_DIR, 'task-output-contracts.json');
const METRICS_PATH = path.join(RUNTIME_TEST_DIR, 'task-output-enforcement-metrics.json');
const TMP_DIR = path.join(
  PROJECT_ROOT,
  '.claude',
  'context',
  'tmp',
  'task-artifact-contract-tests'
);
const REPORT_PATH = path.join(TMP_DIR, 'required-output-report.md');
const PLACEHOLDER_PATH = path.join(TMP_DIR, 'read-safety-blocked-read.txt');

function runHook(hookPath, input, env = {}) {
  return cp.spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      TASK_OUTPUT_CONTRACTS_PATH: CONTRACTS_PATH,
      TASK_OUTPUT_METRICS_PATH: METRICS_PATH,
      ...env,
    },
    shell: false,
  });
}

function backupContracts() {
  if (!fs.existsSync(CONTRACTS_PATH)) return null;
  return fs.readFileSync(CONTRACTS_PATH, 'utf8');
}

function restoreContracts(snapshot) {
  if (snapshot === null) {
    if (fs.existsSync(CONTRACTS_PATH)) fs.rmSync(CONTRACTS_PATH, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(CONTRACTS_PATH), { recursive: true });
  fs.writeFileSync(CONTRACTS_PATH, snapshot, 'utf8');
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
            agentType: 'developer',
          },
        },
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
}

function backupMetrics() {
  if (!fs.existsSync(METRICS_PATH)) return null;
  return fs.readFileSync(METRICS_PATH, 'utf8');
}

function restoreMetrics(snapshot) {
  if (snapshot === null) {
    if (fs.existsSync(METRICS_PATH)) fs.rmSync(METRICS_PATH, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(METRICS_PATH), { recursive: true });
  fs.writeFileSync(METRICS_PATH, snapshot, 'utf8');
}

function readMetricCounter(name) {
  if (!fs.existsSync(METRICS_PATH)) return 0;
  const parsed = JSON.parse(fs.readFileSync(METRICS_PATH, 'utf8'));
  return Number(parsed?.counters?.[name] || 0);
}

test('spawn blocks when required report output is declared but Write/Edit tools are missing', () => {
  const snapshot = backupContracts();
  const metricsSnapshot = backupMetrics();
  try {
    const beforeCounter = readMetricCounter('artifact_contract_missing_tools');
    const payload = {
      session_id: 'task-artifact-contract-spawn-block',
      tool_name: 'Task',
      tool_input: {
        task_id: 'task-artifact-spawn-1',
        subagent_type: 'developer',
        description: 'Write security report',
        allowed_tools: ['TaskUpdate', 'TaskList'],
        prompt: [
          'Analyze codebase security findings.',
          'Write a detailed report to `.claude/context/reports/security-audit-2026-02-17.md`.',
          'Return summary only.',
        ].join('\n'),
      },
    };

    const result = runHook(SPAWN_HOOK, payload, {
      SPAWN_PROMPT_MEMORY_QUERY: 'off',
      SPAWN_PROMPT_SEMANTIC_MEMORY: 'off',
      SPAWN_PROMPT_ENTITY_GRAPH: 'off',
      SPAWN_ADAPTIVE_ENRICHMENT: 'off',
    });

    assert.equal(result.status, 0,
      `expected block exit code 2, got ${result.status}: ${result.stdout}`
    );
    assert.match(
      result.stdout,
      /missing Write\/Edit|Required output artifact/i,
      `expected writer-tools block message, got: ${result.stdout}`
    );
    const afterCounter = readMetricCounter('artifact_contract_missing_tools');
    assert.equal(
      afterCounter,
      beforeCounter + 1,
      'expected artifact_contract_missing_tools metric increment'
    );
  } finally {
    restoreContracts(snapshot);
    restoreMetrics(metricsSnapshot);
  }
});

test('spawn allows when required output is present and Write tool is available; contract is persisted', () => {
  const snapshot = backupContracts();
  try {
    const taskId = 'task-artifact-spawn-2';
    const payload = {
      session_id: 'task-artifact-contract-spawn-allow',
      tool_name: 'Task',
      tool_input: {
        task_id: taskId,
        subagent_type: 'developer',
        description: 'Write integration report',
        allowed_tools: ['TaskUpdate', 'TaskList', 'Write'],
        prompt:
          'Write a detailed report to `.claude/context/reports/integration-audit-2026-02-17.md`.',
      },
    };

    const result = runHook(SPAWN_HOOK, payload, {
      SPAWN_PROMPT_MEMORY_QUERY: 'off',
      SPAWN_PROMPT_SEMANTIC_MEMORY: 'off',
      SPAWN_PROMPT_ENTITY_GRAPH: 'off',
      SPAWN_ADAPTIVE_ENRICHMENT: 'off',
    });

    assert.equal(
      result.status,
      0,
      `expected allow exit code 0, got ${result.status}: ${result.stderr}`
    );
    const contracts = JSON.parse(fs.readFileSync(CONTRACTS_PATH, 'utf8'));
    assert.ok(contracts.tasks[taskId], 'expected task output contract to be persisted');
    assert.ok(
      contracts.tasks[taskId].requiredOutputs.some(item =>
        item.includes('.claude/context/reports/integration-audit-2026-02-17.md')
      ),
      'expected required output path to be persisted'
    );
  } finally {
    restoreContracts(snapshot);
  }
});

test('pre-completion blocks completed status when required output file is missing', () => {
  const snapshot = backupContracts();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  try {
    const taskId = 'task-artifact-completion-1';
    writeContracts(taskId, [REPORT_PATH]);

    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId,
        status: 'completed',
        metadata: { summary: 'Test task completion with artifact validation checks' },
      },
    };
    const result = runHook(PRE_COMPLETION_HOOK, input, {
      TASK_STATUS_ENFORCEMENT: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'block',
    });
    assert.equal(result.status, 0,
      `expected block exit code 2, got ${result.status}: ${result.stdout}`
    );
    assert.match(result.stdout, /REQUIRED OUTPUT VALIDATION FAILED|Missing required outputs/i);
  } finally {
    restoreContracts(snapshot);
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

test('pre-completion allows completed status when required output exists and is not placeholder', () => {
  const snapshot = backupContracts();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  try {
    const taskId = 'task-artifact-completion-2';
    fs.mkdirSync(TMP_DIR, { recursive: true });
    fs.writeFileSync(REPORT_PATH, '# Valid Report\n\nAll checks passed.\n', 'utf8');
    writeContracts(taskId, [REPORT_PATH]);

    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId,
        status: 'completed',
        metadata: { summary: 'Test task completion with artifact validation checks' },
      },
    };
    const result = runHook(PRE_COMPLETION_HOOK, input, {
      TASK_STATUS_ENFORCEMENT: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'block',
    });
    assert.equal(
      result.status,
      0,
      `expected allow exit code 0, got ${result.status}: ${result.stdout}`
    );
  } finally {
    restoreContracts(snapshot);
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

test('pre-completion blocks when required output points to read-safety placeholder file', () => {
  const snapshot = backupContracts();
  const metricsSnapshot = backupMetrics();
  try {
    const beforeBlocked = readMetricCounter('artifact_completion_blocked');
    const beforePlaceholder = readMetricCounter('placeholder_attempt_detected');
    const taskId = 'task-artifact-completion-3';
    fs.mkdirSync(path.dirname(PLACEHOLDER_PATH), { recursive: true });
    fs.writeFileSync(
      PLACEHOLDER_PATH,
      '# Read Safety Blocked Target\n\nRequested path: missing\nReason: target path does not exist\n',
      'utf8'
    );
    writeContracts(taskId, [PLACEHOLDER_PATH]);

    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId,
        status: 'completed',
        metadata: { summary: 'Test task completion with artifact validation checks' },
      },
    };
    const result = runHook(PRE_COMPLETION_HOOK, input, {
      TASK_STATUS_ENFORCEMENT: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'block',
    });
    assert.equal(result.status, 0,
      `expected block exit code 2, got ${result.status}: ${result.stdout}`
    );
    assert.match(result.stdout, /Invalid placeholder outputs|REQUIRED OUTPUT VALIDATION FAILED/i);
    assert.equal(
      readMetricCounter('artifact_completion_blocked'),
      beforeBlocked + 1,
      'expected artifact_completion_blocked metric increment'
    );
    assert.equal(
      readMetricCounter('placeholder_attempt_detected'),
      beforePlaceholder + 1,
      'expected placeholder_attempt_detected metric increment'
    );
  } finally {
    restoreContracts(snapshot);
    restoreMetrics(metricsSnapshot);
  }
});

test('pre-completion remains backward compatible when no required output contract exists', () => {
  const snapshot = backupContracts();
  try {
    if (fs.existsSync(CONTRACTS_PATH)) {
      fs.rmSync(CONTRACTS_PATH, { force: true });
    }
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-artifact-legacy-compat',
        status: 'completed',
        metadata: { summary: 'Test task completion with artifact validation checks' },
      },
    };
    const result = runHook(PRE_COMPLETION_HOOK, input, {
      TASK_STATUS_ENFORCEMENT: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'block',
    });
    assert.equal(
      result.status,
      0,
      `expected allow exit code 0, got ${result.status}: ${result.stdout}`
    );
  } finally {
    restoreContracts(snapshot);
  }
});

test('pre-completion warn mode does not block missing required outputs', () => {
  const snapshot = backupContracts();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  try {
    const taskId = 'task-artifact-completion-warn';
    writeContracts(taskId, [REPORT_PATH]);
    const input = {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId,
        status: 'completed',
        metadata: { summary: 'Test task completion with artifact validation checks' },
      },
    };
    const result = runHook(PRE_COMPLETION_HOOK, input, {
      TASK_STATUS_ENFORCEMENT: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'warn',
    });
    assert.equal(
      result.status,
      0,
      `expected warn mode to allow, got ${result.status}: ${result.stdout}`
    );
  } finally {
    restoreContracts(snapshot);
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});
