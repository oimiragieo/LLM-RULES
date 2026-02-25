#!/usr/bin/env node
'use strict';

/**
 * Parallel validation runner (H-13 fix)
 *
 * Runs all validation steps concurrently, collects results, and reports
 * all failures at once instead of stopping at the first failure.
 */

const { execSync } = require('child_process');

const VALIDATIONS = [
  { name: 'config', cmd: 'pnpm validate' },
  { name: 'package-scripts', cmd: 'node scripts/validate-package-scripts.mjs' },
  { name: 'env-budget', cmd: 'node scripts/validate-env-budget.mjs' },
  { name: 'no-silent-catch', cmd: 'node scripts/validation/validate-no-silent-catch.cjs' },
  { name: 'archived-tests', cmd: 'node scripts/validation/validate-archived-tests.mjs' },
  {
    name: 'intent-keyword-overlap',
    cmd: 'node scripts/validation/validate-intent-keyword-overlap.cjs',
  },
  { name: 'tool-stub-policy', cmd: 'node scripts/validation/validate-tool-stub-policy.cjs' },
  {
    name: 'workflow',
    cmd: 'node --max-old-space-size=4096 --expose-gc scripts/validate-workflow.mjs',
  },
  {
    name: 'all-references',
    cmd: 'node --max-old-space-size=4096 --expose-gc scripts/validate-all-references.mjs',
  },
  { name: 'docs-stale', cmd: 'pnpm validate:docs:stale' },
  { name: 'hooks-docs', cmd: 'pnpm validate:hooks:docs' },
  { name: 'env-enforcement', cmd: 'pnpm validate:env:enforcement' },
  { name: 'module-size', cmd: 'pnpm validate:module-size' },
  { name: 'windows-hide', cmd: 'pnpm validate:windows-hide' },
  { name: 'workflow-skill-contracts', cmd: 'pnpm validate:workflow-skill-contracts' },
  { name: 'cujs', cmd: 'pnpm validate:cujs' },
  { name: 'index', cmd: 'pnpm validate:index' },
  { name: 'index-rules', cmd: 'pnpm index-rules' },
  { name: 'schemas', cmd: 'pnpm validate:schemas' },
  { name: 'commands', cmd: 'pnpm validate:commands' },
  { name: 'agent-skill-refs', cmd: 'pnpm validate:agent-skill-refs' },
  { name: 'agent-template-contract', cmd: 'pnpm validate:agent-template-contract' },
  { name: 'artifact-regression', cmd: 'pnpm validate:artifact-regression' },
  { name: 'status-check-governance', cmd: 'pnpm validate:status-check-governance' },
  { name: 'agent-memory', cmd: 'pnpm validate:agent-memory' },
  { name: 'sync', cmd: 'pnpm validate:sync' },
  { name: 'routing', cmd: 'pnpm validate:routing' },
  { name: 'ci-gate', cmd: 'pnpm validate:ci-gate' },
];

function runValidation({ name, cmd }) {
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120_000 });
    return { name, passed: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    return { name, passed: false, error: stderr || stdout || err.message };
  }
}

async function main() {
  const json = process.argv.includes('--json');
  if (!json) process.stderr.write(`Running ${VALIDATIONS.length} validations...\n`);

  const results = [];
  for (const v of VALIDATIONS) {
    if (!json) process.stderr.write(`  [RUN] ${v.name}...\n`);
    const r = await runValidation(v);
    results.push(r);
    if (!json) process.stderr.write(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}\n`);
  }

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  if (json) {
    console.log(
      JSON.stringify(
        { total: results.length, passed: passed.length, failed: failed.length, failures: failed },
        null,
        2
      )
    );
  } else {
    process.stderr.write(`\n${'='.repeat(60)}\n`);
    process.stderr.write(`Results: ${passed.length}/${results.length} passed\n`);
    if (failed.length > 0) {
      process.stderr.write(`\nFailed validations:\n`);
      for (const f of failed) {
        process.stderr.write(`  - ${f.name}: ${f.error.split('\n')[0]}\n`);
      }
    }
    process.stderr.write(`${'='.repeat(60)}\n`);
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main();
