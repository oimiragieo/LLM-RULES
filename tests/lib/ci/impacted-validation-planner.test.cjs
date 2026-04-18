'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  planImpactedValidation,
} = require('../../../.claude/lib/ci/impacted-validation-planner.cjs');

test('routing changes trigger routing validation', () => {
  const plan = planImpactedValidation(process.cwd(), [
    '.claude/lib/routing/routing-table-intent-keywords-data.cjs',
  ]);

  assert.equal(plan.recommendedCommands.includes('pnpm validate:routing'), true);
});

test('hook and docs changes trigger hook documentation sync validation', () => {
  const plan = planImpactedValidation(process.cwd(), [
    '.claude/hooks/session/worktree-prune-on-start.cjs',
    '.claude/docs/HOOKS_REFERENCE.md',
  ]);

  assert.equal(plan.recommendedCommands.includes('pnpm validate:hooks:docs'), true);
});

test('agent and skill changes trigger registry and agent-skill validation', () => {
  const plan = planImpactedValidation(process.cwd(), [
    '.claude/agents/core/developer.md',
    '.claude/skills/implementation-readiness/SKILL.md',
  ]);

  assert.equal(plan.recommendedCommands.includes('pnpm validate:agent-skill-refs'), true);
  assert.equal(plan.recommendedCommands.includes('pnpm agents:registry:validate'), true);
});

test('benchmark-sensitive files map to known benchmark slices', () => {
  const plan = planImpactedValidation(process.cwd(), [
    '.claude/lib/monitoring/flight-recorder.cjs',
    '.claude/lib/code-indexing/hybrid-lazy-indexer-methods-b.cjs',
    '.claude/hooks/post-tool-use/perf-regression-gate.cjs',
  ]);

  assert.deepEqual(plan.benchmarkSlices, [
    'tests/benchmarks/flight-recorder-throughput.test.cjs',
    'tests/benchmarks/telemetry-hotpath-latency.test.cjs',
    'tests/lib/code-indexing/benchmark-fast-path.test.cjs',
    'tests/hooks/benchmarks/perf-regression-gate.test.cjs',
  ]);
});

test('unknown changes degrade to conservative fallback recommendations', () => {
  const plan = planImpactedValidation(process.cwd(), ['scripts/unknown-area/example.cjs']);

  assert.equal(plan.conservativeFallback, true);
  assert.deepEqual(plan.recommendedCommands, [
    'pnpm lint',
    'pnpm format:check',
    'pnpm validate',
    'pnpm test',
  ]);
});
