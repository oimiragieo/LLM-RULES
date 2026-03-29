#!/usr/bin/env node
'use strict';

/**
 * Parallel validation runner (H-13 fix)
 *
 * Runs all validation steps concurrently using Promise.all(), collects results,
 * and reports all failures at once instead of stopping at the first failure.
 *
 * Note: The name "parallel" is intentional and accurate — all validations run
 * simultaneously via Promise.all(). This is distinct from validate:full which
 * runs checks sequentially. Individual validation steps remain sequential
 * within themselves (test isolation requirement), but all steps run in
 * parallel with each other.
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const path = require('path');

// Use path.resolve for cross-platform path resolution
// All paths resolved from repository root
const ROOT = process.cwd();
const VALIDATIONS = [
  {
    name: 'validate-config',
    cmd: `node "${path.join(ROOT, 'scripts/validation/validate-config.mjs')}"`,
  },
  {
    name: 'validate-models',
    cmd: `node "${path.join(ROOT, 'scripts/validation/validate-model-names.mjs')}"`,
  },
  {
    name: 'validate-archived-tests',
    cmd: `node "${path.join(ROOT, 'scripts/validation/validate-archived-tests.mjs')}"`,
  },
  {
    name: 'validate-agents',
    cmd: `node "${path.join(ROOT, '.claude/tools/cli/validate-agents.mjs')}"`,
  },
  {
    name: 'validate-hooks',
    cmd: `node "${path.join(ROOT, 'scripts/validation/validate-hooks-doc-sync.cjs')}"`,
  },
  {
    name: 'validate-skills',
    cmd: `node "${path.join(ROOT, '.claude/tools/cli/validate-skill-agent-consistency.mjs')}"`,
  },
];

async function runValidation({ name, cmd }) {
  try {
    await execAsync(cmd, { timeout: 120_000 });
    return { name, passed: true };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    return { name, passed: false, error: stderr || stdout || err.message };
  }
}

async function main() {
  const json = process.argv.includes('--json');
  if (!json) process.stderr.write(`Running ${VALIDATIONS.length} validations in parallel...\n`);

  const promises = VALIDATIONS.map(async v => {
    if (!json) process.stderr.write(`  [START] ${v.name}\n`);
    const r = await runValidation(v);
    if (!json) process.stderr.write(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}\n`);
    return r;
  });

  const results = await Promise.all(promises);

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
