const { test } = require('node:test');
const assert = require('node:assert');

const {
  normalizeTaskIdReferences,
  normalizeStalePathReferences,
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

test('normalizeStalePathReferences rewrites known stale report and code paths', () => {
  const input = [
    '.claude/lib/memory/memory-query.cjs',
    '.claude/lib/utils/safe-json-parse.cjs',
    'tests/metrics/metrics-schema-contract.test.cjs',
    'tests/metrics/metrics-reader-rollups.test.cjs',
    '.claude/context/artifacts/research-reports/p0-fix-research-2026-02-13.md',
    '.claude/context/artifacts/research-reports/implementation-patterns-research-2026-02-13.md',
  ].join('\n');

  const output = normalizeStalePathReferences(input);
  assert.ok(output.includes('.claude/lib/memory/core/memory-query.cjs'));
  assert.ok(output.includes('.claude/lib/utils/safe-json.cjs'));
  assert.ok(output.includes('tests/lib/monitoring/metrics-schema-contract.test.cjs'));
  assert.ok(output.includes('tests/lib/monitoring/metrics-reader-rollups.test.cjs'));
  assert.ok(output.includes('.claude/context/reports/p0-fix-research-2026-02-13.md'));
  assert.ok(
    output.includes('.claude/context/reports/implementation-patterns-research-2026-02-13.md')
  );
  assert.equal(output.includes('.claude/lib/memory/memory-query.cjs'), false);
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
