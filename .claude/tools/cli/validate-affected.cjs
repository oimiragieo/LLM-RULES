#!/usr/bin/env node
'use strict';

const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');
const { getChangedFiles } = require('../../lib/ci/failure-evidence.cjs');
const { planImpactedValidation } = require('../../lib/ci/impacted-validation-planner.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const files = [];
  let json = false;
  let projectRoot = process.cwd();

  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === '--json') {
      json = true;
      continue;
    }
    if (current === '--project-root' && args[i + 1]) {
      projectRoot = args[++i];
      continue;
    }
    if (current === '--file' && args[i + 1]) {
      files.push(args[++i]);
    }
  }

  return { json, projectRoot, files };
}

function main() {
  const opts = parseArgs(process.argv);
  const changedFiles = opts.files.length > 0 ? opts.files : getChangedFiles(opts.projectRoot);
  const plan = planImpactedValidation(opts.projectRoot, changedFiles);

  if (opts.json) {
    console.log(JSON.stringify({ plan }, null, 2));
    return;
  }

  console.log('Affected validation plan');
  console.log(`- Conservative fallback: ${plan.conservativeFallback}`);
  console.log(`- Matched rules: ${plan.matchedRules.join(', ') || '(none)'}`);
  console.log('- Recommended commands:');
  for (const command of plan.recommendedCommands) {
    console.log(`  - ${command}`);
  }
  if (plan.targetedTests.length > 0) {
    console.log('- Targeted tests:');
    for (const testFile of plan.targetedTests) {
      console.log(`  - ${testFile}`);
    }
  }
  if (plan.benchmarkSlices.length > 0) {
    console.log('- Benchmark slices:');
    for (const benchmark of plan.benchmarkSlices) {
      console.log(`  - ${benchmark}`);
    }
  }
}

const wrappedMain = wrapCLITool(main, 'validate-affected');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  main,
};
