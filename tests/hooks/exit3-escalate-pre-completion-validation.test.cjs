'use strict';

/**
 * Pre-completion validation block regression tests.
 *
 * Direct hook blocks use exit 2. These sites retain structured ESCALATE
 * trailers so downstream dispatchers can preserve escalation metadata.
 *
 * Sites:
 *   1. Line ~251 - REFLECTION_SCORE_ENFORCEMENT=block -> exit 2, blockerType=data_quality
 *   2. Line ~415 - MILESTONE_SELF_REVIEW_ENFORCEMENT=block -> exit 2, blockerType=self_review
 *   3. Line ~438 - CCUSAGE_REPORT_ENFORCEMENT=block -> exit 2, blockerType=cost_tracking
 *   4. Line ~474 - PLANNER_TOKEN_ESTIMATION_ENFORCEMENT=block -> exit 2, blockerType=planner_metadata
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

const HOOK_PATH = path.resolve(
  __dirname,
  '../../.claude/hooks/validation/pre-completion-validation.cjs'
);
const PROJECT_ROOT = path.resolve(__dirname, '../../');

/**
 * Run the hook subprocess with controlled stdin and env vars.
 * Disables all enforcement modes that would fire before the site under test.
 */
function runHook(toolInput, envOverrides = {}) {
  const stdinData = JSON.stringify({ tool_name: 'TaskUpdate', tool_input: toolInput });
  return spawnSync(process.execPath, [HOOK_PATH], {
    input: stdinData,
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      // Disable all blocking modes by default; tests enable only what they need
      TASK_STATUS_ENFORCEMENT: 'off',
      SUMMARY_REQUIRED_ENFORCEMENT: 'off',
      PRE_COMPLETION_SUMMARY_ENFORCEMENT: 'off',
      GIT_COMMIT_VERIFICATION: 'off',
      TASK_OUTPUT_ENFORCEMENT: 'off',
      MILESTONE_SELF_REVIEW_ENFORCEMENT: 'off',
      CCUSAGE_REPORT_ENFORCEMENT: 'off',
      PLANNER_TOKEN_ESTIMATION_ENFORCEMENT: 'off',
      REFLECTION_SCORE_ENFORCEMENT: 'off',
      DRAIN_GATE_ENFORCEMENT: 'off',
      CLAUDE_AGENT_ID: 'test-agent-exit3',
      ...envOverrides,
    },
    timeout: 15000,
    shell: false,
    windowsHide: true,
  });
}

// ---------------------------------------------------------------------------
// Site 1: REFLECTION_SCORE_ENFORCEMENT=block — missing dataQuality field
// ---------------------------------------------------------------------------

test('site1: reflection score without dataQuality -> exit 2 when REFLECTION_SCORE_ENFORCEMENT=block', () => {
  const input = {
    taskId: 'task-reflect-test',
    status: 'completed',
    metadata: {
      score: 8,
      processedReflectionIds: ['ref-001'],
      summary: 'Reflection agent completed processing.',
    },
  };
  const result = runHook(input, { REFLECTION_SCORE_ENFORCEMENT: 'block' });
  assert.equal(result.status, 2, `Expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
});

test('site1: reflection score without dataQuality → ESCALATE trailer with blockerType=data_quality', () => {
  const input = {
    taskId: 'task-reflect-test2',
    status: 'completed',
    metadata: {
      score: 7,
      processedReflectionIds: ['ref-002'],
      summary: 'Reflection processing complete.',
    },
  };
  const result = runHook(input, { REFLECTION_SCORE_ENFORCEMENT: 'block' });
  assert.ok(
    result.stderr.includes('ESCALATE:'),
    `Expected ESCALATE: trailer in stderr. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blockerType=data_quality'),
    `Expected blockerType=data_quality in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('needsFrom=user'),
    `Expected needsFrom=user in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blocker=missing_dataquality_field'),
    `Expected blocker=missing_dataquality_field in ESCALATE trailer. Got: ${result.stderr}`
  );
});

test('site1: reflection score WITH dataQuality present -> no data_quality block', () => {
  const input = {
    taskId: 'task-reflect-ok',
    status: 'completed',
    metadata: {
      score: 8,
      dataQuality: 'full',
      processedReflectionIds: ['ref-003'],
      summary: 'Reflection done with quality verified.',
    },
  };
  const result = runHook(input, { REFLECTION_SCORE_ENFORCEMENT: 'block' });
  assert.ok(
    result.status === 0 || result.status === 2,
    `Expected exit 0 or non-data_quality block when dataQuality present, got ${result.status}. stderr: ${result.stderr}`
  );
  // Specifically must NOT block due to data_quality issue
  if (result.status === 2) {
    assert.ok(
      !result.stderr.includes('blockerType=data_quality'),
      'Must not escalate data_quality when dataQuality field is present'
    );
  }
});

// ---------------------------------------------------------------------------
// Site 2: MILESTONE_SELF_REVIEW_ENFORCEMENT=block — self-review not performed
// ---------------------------------------------------------------------------

test('site2: pipeline completion without self-review -> exit 2 when MILESTONE_SELF_REVIEW_ENFORCEMENT=block', () => {
  const input = {
    taskId: 'task-pipeline-test',
    status: 'completed',
    metadata: {
      summary: 'Phase 1 pipeline complete — all tasks done.',
      // No selfReviewCompleted, no hook-trace with self-review
    },
  };
  const result = runHook(input, { MILESTONE_SELF_REVIEW_ENFORCEMENT: 'block' });
  assert.equal(result.status, 2, `Expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
});

test('site2: pipeline completion without self-review → ESCALATE trailer with blockerType=self_review', () => {
  const input = {
    taskId: 'task-pipeline-test2',
    status: 'completed',
    metadata: {
      summary: 'Pipeline phase complete — all tasks finished.',
    },
  };
  const result = runHook(input, { MILESTONE_SELF_REVIEW_ENFORCEMENT: 'block' });
  assert.ok(
    result.stderr.includes('ESCALATE:'),
    `Expected ESCALATE: trailer in stderr. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blockerType=self_review'),
    `Expected blockerType=self_review in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('needsFrom=user'),
    `Expected needsFrom=user in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blocker=self_review_not_performed'),
    `Expected blocker=self_review_not_performed in ESCALATE trailer. Got: ${result.stderr}`
  );
});

test('site2: pipeline completion WITH selfReviewCompleted:true -> no self-review block', () => {
  const input = {
    taskId: 'task-pipeline-ok',
    status: 'completed',
    metadata: {
      summary: 'Pipeline phase complete.',
      selfReviewCompleted: true,
    },
  };
  const result = runHook(input, { MILESTONE_SELF_REVIEW_ENFORCEMENT: 'block' });
  // Must not escalate for self-review when flag is set
  if (result.status === 2) {
    assert.ok(
      !result.stderr.includes('blockerType=self_review'),
      'Must not escalate self_review when selfReviewCompleted:true is set'
    );
  }
});

// ---------------------------------------------------------------------------
// Site 3: CCUSAGE_REPORT_ENFORCEMENT=block — ccusage missing on pipeline completion
// ---------------------------------------------------------------------------

test('site3: pipeline completion without token/cost data -> exit 2 when CCUSAGE_REPORT_ENFORCEMENT=block', () => {
  const input = {
    taskId: 'task-ccusage-test',
    status: 'completed',
    metadata: {
      summary: 'Pipeline phase complete — all tasks done.',
      // No tokenUsage, no costUsd, summary has no ccusage/token/cost keywords
    },
  };
  const result = runHook(input, {
    CCUSAGE_REPORT_ENFORCEMENT: 'block',
    MILESTONE_SELF_REVIEW_ENFORCEMENT: 'off',
  });
  assert.equal(result.status, 2, `Expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
});

test('site3: pipeline completion without ccusage → ESCALATE trailer with blockerType=cost_tracking', () => {
  const input = {
    taskId: 'task-ccusage-test2',
    status: 'completed',
    metadata: {
      summary: 'Pipeline complete — finished all tasks.',
    },
  };
  const result = runHook(input, {
    CCUSAGE_REPORT_ENFORCEMENT: 'block',
    MILESTONE_SELF_REVIEW_ENFORCEMENT: 'off',
  });
  assert.ok(
    result.stderr.includes('ESCALATE:'),
    `Expected ESCALATE: trailer in stderr. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blockerType=cost_tracking'),
    `Expected blockerType=cost_tracking in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('needsFrom=user'),
    `Expected needsFrom=user in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blocker=ccusage_missing'),
    `Expected blocker=ccusage_missing in ESCALATE trailer. Got: ${result.stderr}`
  );
});

test('site3: pipeline completion WITH tokenUsage in metadata -> no ccusage block', () => {
  const input = {
    taskId: 'task-ccusage-ok',
    status: 'completed',
    metadata: {
      summary: 'Pipeline complete.',
      tokenUsage: { input: 1000, output: 500 },
    },
  };
  const result = runHook(input, {
    CCUSAGE_REPORT_ENFORCEMENT: 'block',
    MILESTONE_SELF_REVIEW_ENFORCEMENT: 'off',
  });
  if (result.status === 2) {
    assert.ok(
      !result.stderr.includes('blockerType=cost_tracking'),
      'Must not escalate cost_tracking when tokenUsage is present'
    );
  }
});

// ---------------------------------------------------------------------------
// Site 4: PLANNER_TOKEN_ESTIMATION_ENFORCEMENT=block — token estimate missing
// ---------------------------------------------------------------------------

test('site4: planner completion without token estimate -> exit 2 when PLANNER_TOKEN_ESTIMATION_ENFORCEMENT=block', () => {
  const input = {
    taskId: 'task-planner-test',
    status: 'completed',
    metadata: {
      summary: 'Plan created — all sub-tasks generated.',
      // No estimatedTokens, no estimated_tokens, summary has no "estimated"/"token budget"
    },
  };
  const result = runHook(input, {
    PLANNER_TOKEN_ESTIMATION_ENFORCEMENT: 'block',
    MILESTONE_SELF_REVIEW_ENFORCEMENT: 'off',
    CCUSAGE_REPORT_ENFORCEMENT: 'off',
  });
  assert.equal(result.status, 2, `Expected exit 2, got ${result.status}. stderr: ${result.stderr}`);
});

test('site4: planner completion without token estimate → ESCALATE trailer with blockerType=planner_metadata', () => {
  const input = {
    taskId: 'task-planner-test2',
    status: 'completed',
    metadata: {
      summary: 'Plan generated — tasks created.',
    },
  };
  const result = runHook(input, {
    PLANNER_TOKEN_ESTIMATION_ENFORCEMENT: 'block',
    MILESTONE_SELF_REVIEW_ENFORCEMENT: 'off',
    CCUSAGE_REPORT_ENFORCEMENT: 'off',
  });
  assert.ok(
    result.stderr.includes('ESCALATE:'),
    `Expected ESCALATE: trailer in stderr. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blockerType=planner_metadata'),
    `Expected blockerType=planner_metadata in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('needsFrom=user'),
    `Expected needsFrom=user in ESCALATE trailer. Got: ${result.stderr}`
  );
  assert.ok(
    result.stderr.includes('blocker=missing_token_estimate'),
    `Expected blocker=missing_token_estimate in ESCALATE trailer. Got: ${result.stderr}`
  );
});

test('site4: planner completion WITH estimatedTokens in metadata -> no planner_metadata block', () => {
  const input = {
    taskId: 'task-planner-ok',
    status: 'completed',
    metadata: {
      summary: 'Plan complete — tasks created.',
      estimatedTokens: { 'task-1': 5000, 'task-2': 8000 },
    },
  };
  const result = runHook(input, {
    PLANNER_TOKEN_ESTIMATION_ENFORCEMENT: 'block',
    MILESTONE_SELF_REVIEW_ENFORCEMENT: 'off',
    CCUSAGE_REPORT_ENFORCEMENT: 'off',
  });
  if (result.status === 2) {
    assert.ok(
      !result.stderr.includes('blockerType=planner_metadata'),
      'Must not escalate planner_metadata when estimatedTokens is present'
    );
  }
});
