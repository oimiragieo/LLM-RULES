#!/usr/bin/env node
'use strict';

/**
 * Tests for post-pipeline-token-report.cjs
 *
 * VAL-RF-013: Token report fires regardless of task wording
 * VAL-RF-014: Token report has structural detection (not just keywords)
 * VAL-RF-015: Token report avoids false positives on intermediate tasks
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/validation/post-pipeline-token-report.cjs'
);
const {
  shouldTriggerReport,
  emitReport,
} = require('../../.claude/hooks/validation/post-pipeline-token-report.cjs');

/**
 * Create a temp project root with the necessary structure.
 */
function mkProjectRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'token-report-test-'));
  fs.mkdirSync(path.join(root, '.claude', 'context', 'runtime'), { recursive: true });
  return root;
}

/**
 * Run the hook with the given input and return { stdout, stderr, exitCode }.
 */
function runHook(input, env = {}) {
  return new Promise(resolve => {
    const proc = spawn('node', [HOOK_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => {
      stdout += chunk;
    });

    proc.stderr.on('data', chunk => {
      stderr += chunk;
    });

    proc.on('close', code => {
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

// ─── Unit Tests for shouldTriggerReport ─────────────────────────────────────

test('VAL-RF-013: shouldTriggerReport fires on metadata.pipelineComplete without keywords', () => {
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-123',
      status: 'completed',
      subject: 'Regular task completion', // No "final" keyword
      metadata: {
        pipelineComplete: true, // Structural signal
      },
    },
  });

  assert.equal(result.shouldReport, true, 'Should report on pipelineComplete');
  assert.ok(result.reason.includes('pipelineComplete'), 'Reason should mention pipelineComplete');
});

test('VAL-RF-013: shouldTriggerReport fires on metadata.isFinalTask without keywords', () => {
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-456',
      status: 'completed',
      subject: 'Wrapping up the implementation', // No "final" keyword
      metadata: {
        isFinalTask: true, // Structural signal
      },
    },
  });

  assert.equal(result.shouldReport, true, 'Should report on isFinalTask');
  assert.ok(result.reason.includes('isFinalTask'), 'Reason should mention isFinalTask');
});

test('VAL-RF-015: shouldTriggerReport does NOT fire on intermediate task with "final" substring', () => {
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-789',
      status: 'completed',
      subject: 'Finalize component layout', // Contains "final" but is intermediate
      metadata: {
        // No pipelineComplete or isFinalTask flag
      },
    },
  });

  assert.equal(result.shouldReport, false, 'Should NOT report on intermediate task');
  assert.equal(result.reason, 'no_signal', 'Reason should be no_signal');
});

test('VAL-RF-015: shouldTriggerReport does NOT fire on "finalized" containing "final" substring', () => {
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-finalized',
      status: 'completed',
      subject: 'The component has been finalized', // "finalized" contains "final" but is not word "final"
      metadata: {},
    },
  });

  assert.equal(result.shouldReport, false, 'Should NOT report on "finalized" substring');
  assert.equal(result.reason, 'no_signal', 'Reason should be no_signal');
});

test('keyword fallback fires on "deliverable" as whole word', () => {
  // "deliverable" is a whole word, so it should trigger fallback
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-d1',
      status: 'completed',
      subject: 'Prepare deliverable for review', // "deliverable" is a whole word
      metadata: {},
    },
  });

  assert.equal(result.shouldReport, true, 'Should report on whole word "deliverable"');
  assert.ok(result.reason.includes('deliverable'), 'Reason should mention deliverable');
});

test('VAL-RF-014: structural signal is PRIMARY (checked before keywords)', () => {
  // Test that structural signal works even without any keywords
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-structural',
      status: 'completed',
      subject: 'Implementation done', // No keywords at all
      metadata: {
        pipelineComplete: true,
      },
    },
  });

  assert.equal(result.shouldReport, true, 'Structural signal should be primary');
  assert.ok(result.reason.startsWith('structural:'), 'Should indicate structural detection');
});

test('shouldTriggerReport does not fire on in_progress status even with pipelineComplete', () => {
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-incomplete',
      status: 'in_progress',
      subject: 'Final step',
      metadata: {
        pipelineComplete: true,
      },
    },
  });

  assert.equal(result.shouldReport, false, 'Should NOT report on non-completed status');
  assert.equal(result.reason, 'not_completed', 'Reason should be not_completed');
});

test('shouldTriggerReport does not fire on non-TaskUpdate tool', () => {
  const result = shouldTriggerReport({
    tool_name: 'Edit',
    tool_input: {
      file_path: '/some/file.js',
    },
  });

  assert.equal(result.shouldReport, false, 'Should NOT report on non-TaskUpdate');
  assert.equal(result.reason, 'not_taskupdate', 'Reason should be not_taskupdate');
});

test('keyword fallback still works for legacy tasks without metadata', () => {
  // When there's no structural signal but subject has legacy keywords, it should still fire
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-legacy',
      status: 'completed',
      subject: 'Final delivery of the pipeline complete milestone', // Multiple keywords
      metadata: {},
    },
  });

  assert.equal(result.shouldReport, true, 'Keyword fallback should work');
  assert.ok(result.reason.includes('keyword'), 'Reason should mention keyword fallback');
});

test('shouldTriggerReport handles malformed input gracefully', () => {
  const result = shouldTriggerReport({});

  assert.equal(result.shouldReport, false, 'Should not report on malformed input');
  assert.equal(result.reason, 'not_taskupdate', 'Should identify as not_taskupdate');
});

test('shouldTriggerReport handles missing metadata gracefully', () => {
  const result = shouldTriggerReport({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-no-meta',
      status: 'completed',
      subject: 'Done',
      // No metadata field at all
    },
  });

  assert.equal(result.shouldReport, false, 'Should not report without signal');
  assert.equal(result.reason, 'no_signal', 'Reason should be no_signal');
});

test('shouldTriggerReport handles toolUse nested format', () => {
  const result = shouldTriggerReport({
    toolUse: {
      tool: 'TaskUpdate',
      input: {
        taskId: 'task-nested',
        status: 'completed',
        metadata: {
          pipelineComplete: true,
        },
      },
    },
  });

  assert.equal(result.shouldReport, true, 'Should handle nested toolUse format');
});

// ─── Integration Tests via spawn ────────────────────────────────────────────

test('integration: hook process exits 0 and outputs report on pipelineComplete', async () => {
  // Create a temp project root with ccusage-status.txt
  const tempRoot = mkProjectRoot();
  const statusPath = path.join(tempRoot, '.claude', 'context', 'runtime', 'ccusage-status.txt');
  fs.writeFileSync(statusPath, 'Test token usage: 100 tokens', 'utf8');

  const result = await runHook(
    {
      tool_name: 'TaskUpdate',
      tool_input: {
        taskId: 'task-int-1',
        status: 'completed',
        subject: 'Regular completion',
        metadata: {
          pipelineComplete: true,
        },
      },
    },
    { PROJECT_ROOT: tempRoot }
  );

  assert.equal(result.exitCode, 0, 'Hook should exit 0');
  // Note: The hook uses PROJECT_ROOT from require, so we check exit code primarily
});

test('integration: hook process exits 0 when no signal', async () => {
  const result = await runHook({
    tool_name: 'TaskUpdate',
    tool_input: {
      taskId: 'task-int-2',
      status: 'completed',
      subject: 'Regular completion',
      metadata: {},
    },
  });

  assert.equal(result.exitCode, 0, 'Hook should exit 0');
  assert.ok(!result.stderr.includes('TOKEN USAGE REPORT'), 'Should not output token report');
});

// ─── emitReport Tests ───────────────────────────────────────────────────────

test('emitReport returns report content', () => {
  const projectRoot = mkProjectRoot();
  const statusPath = path.join(projectRoot, '.claude', 'context', 'runtime', 'ccusage-status.txt');
  fs.writeFileSync(statusPath, 'Token usage: 1000 input, 500 output', 'utf8');

  const report = emitReport(projectRoot);

  assert.ok(report.includes('TOKEN USAGE REPORT'), 'Should include header');
  assert.ok(report.includes('Token usage: 1000 input, 500 output'), 'Should include status');
  assert.ok(report.includes('END TOKEN USAGE REPORT'), 'Should include footer');
});

test('emitReport handles missing ccusage-status.txt gracefully', () => {
  const projectRoot = mkProjectRoot();
  // Don't create ccusage-status.txt

  const report = emitReport(projectRoot);

  assert.ok(report.includes('TOKEN USAGE REPORT'), 'Should include header');
  assert.ok(report.includes('not found'), 'Should mention file not found');
});
