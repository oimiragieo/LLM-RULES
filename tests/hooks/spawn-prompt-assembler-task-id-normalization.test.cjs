const { test } = require('node:test');
const assert = require('node:assert');

const {
  normalizeTaskIdReferences,
  normalizeStalePathReferences,
  ensureMandatorySpawnPreflight,
} = require('../../.claude/hooks/routing/spawn-prompt-assembler.cjs');

test('normalizeTaskIdReferences rewrites hardcoded task placeholders to active task id', () => {
  const input = [
    '**Task ID**: task-1',
    'Task ID: task-1',
    'TASK ID: task-1',
    'TaskUpdate({ taskId: "1", status: "in_progress" })',
    'TaskUpdate({ task_id: "1", status: "completed" })',
    "TaskUpdate({ taskId: 'task-1', status: 'in_progress' })",
    "TaskUpdate({ task_id: 'task-1', status: 'completed' })",
  ].join('\n');

  const output = normalizeTaskIdReferences(input, 'task-real-123');
  assert.ok(output.includes('**Task ID**: task-real-123'));
  assert.ok(output.includes('Task ID: task-real-123'));
  assert.ok(output.includes('TASK ID: task-real-123'));
  assert.ok(output.includes('taskId: "task-real-123"'));
  assert.ok(output.includes('task_id: "task-real-123"'));
  assert.ok(output.includes("taskId: 'task-real-123'"));
  assert.ok(output.includes("task_id: 'task-real-123'"));
  assert.equal(output.includes('task-1'), false);
  assert.equal(output.includes('taskId: "1"'), false);
  assert.equal(output.includes('task_id: "1"'), false);
});

test('normalizeTaskIdReferences rewrites role-line and numeric single-quote task ids', () => {
  const input = [
    'You are task-1. Complete the assigned work.',
    "TaskUpdate({ taskId: '1', status: 'in_progress' })",
    "TaskUpdate({ task_id: '1', status: 'completed' })",
  ].join('\n');

  const output = normalizeTaskIdReferences(input, 'task-abc-999');
  assert.ok(output.includes('You are task-abc-999. Complete the assigned work.'));
  assert.ok(output.includes("taskId: 'task-abc-999'"));
  assert.ok(output.includes("task_id: 'task-abc-999'"));
  assert.equal(output.includes('task-1'), false);
  assert.equal(output.includes("taskId: '1'"), false);
  assert.equal(output.includes("task_id: '1'"), false);
});

test('normalizeTaskIdReferences rewrites "task #N" role markers and numeric task ids', () => {
  const input = [
    'You are task #1: Code quality audit.',
    'You are task #2: Architecture review.',
    'FIRST: Call TaskUpdate({ taskId: "2", status: "in_progress" })',
    'LAST: Call TaskUpdate({ task_id: "1", status: "completed" })',
  ].join('\n');

  const output = normalizeTaskIdReferences(input, 'task-7600b003c263-code-quality-audit-mloyulmd');
  assert.ok(
    output.includes('You are task-7600b003c263-code-quality-audit-mloyulmd: Code quality audit.')
  );
  assert.ok(
    output.includes('You are task-7600b003c263-code-quality-audit-mloyulmd: Architecture review.')
  );
  assert.ok(output.includes('taskId: "task-7600b003c263-code-quality-audit-mloyulmd"'));
  assert.ok(output.includes('task_id: "task-7600b003c263-code-quality-audit-mloyulmd"'));
  assert.equal(output.includes('task #1'), false);
  assert.equal(output.includes('task #2'), false);
  assert.equal(output.includes('taskId: "2"'), false);
  assert.equal(output.includes('task_id: "1"'), false);
});

test('normalizeStalePathReferences rewrites known stale report and code paths', () => {
  const input = [
    '.claude/lib/utils/safe-json-parse.cjs',
    'tests/metrics/metrics-schema-contract.test.cjs',
    'tests/metrics/metrics-reader-rollups.test.cjs',
    '.claude/context/artifacts/research-reports/p0-fix-research-2026-02-13.md',
    '.claude/context/artifacts/research-reports/implementation-patterns-research-2026-02-13.md',
  ].join('\n');

  const output = normalizeStalePathReferences(input);
  assert.ok(output.includes('.claude/lib/utils/safe-json.cjs'));
  assert.ok(output.includes('tests/lib/monitoring/metrics-schema-contract.test.cjs'));
  assert.ok(output.includes('tests/lib/monitoring/metrics-reader-rollups.test.cjs'));
  assert.ok(output.includes('.claude/context/reports/p0-fix-research-2026-02-13.md'));
  assert.ok(
    output.includes('.claude/context/reports/implementation-patterns-research-2026-02-13.md')
  );
  assert.equal(output.includes('.claude/lib/utils/safe-json-parse.cjs'), false);
});

test('normalizes unix-style drive paths in prompt text on Windows', () => {
  const input = 'Read /c/dev/projects/agent-studio/.claude/context/reports/demo.md for details';
  const output = normalizeStalePathReferences(input);

  if (process.platform === 'win32') {
    assert.ok(
      output.includes('C:\\dev\\projects\\agent-studio\\.claude\\context\\reports\\demo.md')
    );
    assert.equal(
      output.includes('/c/dev/projects/agent-studio/.claude/context/reports/demo.md'),
      false
    );
  } else {
    assert.equal(output, input);
  }
});

test('ensureMandatorySpawnPreflight injects task/session and read-before-edit guidance', () => {
  const output = ensureMandatorySpawnPreflight('Implement fix', 'task-real-777');
  assert.ok(output.includes('task_id "task-real-777"'));
  assert.ok(output.includes('never session_id'));
  assert.ok(output.includes('Read file before Edit/Write'));
  assert.ok(output.includes('max 3 retries'));
});
