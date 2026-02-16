#!/usr/bin/env node
'use strict';
const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const {
  getFindingsSummary,
  pruneStaleOpenFindings,
} = require('../../lib/memory/findings-registry.cjs');

function parseArgs(argv) {
  const args = argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!key.startsWith('--')) continue;
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
    map.set(key, value);
  }

  return {
    json: map.get('--json') === 'true',
    projectRoot: map.get('--project-root') || process.cwd(),
    requireData: map.get('--require-data') === 'true',
    pruneStale: map.get('--prune-stale') === 'true',
    pruneMaxAgeDays: map.has('--prune-max-age-days')
      ? Number(map.get('--prune-max-age-days'))
      : null,
    resolutionMode: map.get('--resolution-mode') || null,
    assertMaxOpenCritical: map.has('--assert-max-open-critical')
      ? Number(map.get('--assert-max-open-critical'))
      : null,
    assertMaxOpenHigh: map.has('--assert-max-open-high')
      ? Number(map.get('--assert-max-open-high'))
      : null,
    assertMaxOpenTotal: map.has('--assert-max-open-total')
      ? Number(map.get('--assert-max-open-total'))
      : null,
  };
}

function evaluate(summary, opts) {
  const failures = [];
  if (opts.requireData && Number(summary.total || 0) === 0) {
    failures.push('No findings data available.');
  }

  if (
    Number.isFinite(opts.assertMaxOpenCritical) &&
    Number(summary.bySeverity?.critical?.open || 0) > opts.assertMaxOpenCritical
  ) {
    failures.push(
      `Open critical findings ${summary.bySeverity.critical.open} exceeds ${opts.assertMaxOpenCritical}.`
    );
  }

  if (
    Number.isFinite(opts.assertMaxOpenHigh) &&
    Number(summary.bySeverity?.high?.open || 0) > opts.assertMaxOpenHigh
  ) {
    failures.push(
      `Open high findings ${summary.bySeverity.high.open} exceeds ${opts.assertMaxOpenHigh}.`
    );
  }

  if (
    Number.isFinite(opts.assertMaxOpenTotal) &&
    Number(summary.open || 0) > opts.assertMaxOpenTotal
  ) {
    failures.push(`Open findings total ${summary.open} exceeds ${opts.assertMaxOpenTotal}.`);
  }

  return failures;
}

function buildSummary(projectRoot) {
  return {
    projectRoot,
    timestamp: new Date().toISOString(),
    ...getFindingsSummary(projectRoot),
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const previousResolutionMode = process.env.OPEN_FINDINGS_RESOLUTION_MODE;
  if (opts.resolutionMode) {
    process.env.OPEN_FINDINGS_RESOLUTION_MODE = String(opts.resolutionMode);
  }
  let pruneResult = null;
  const result = (() => {
    if (opts.pruneStale) {
      pruneResult = pruneStaleOpenFindings(opts.projectRoot, {
        maxAgeDays: opts.pruneMaxAgeDays,
      });
    }
    const summary = buildSummary(opts.projectRoot);
    const failures = evaluate(summary, opts);
    return { summary, failures };
  })();
  if (opts.resolutionMode) {
    if (previousResolutionMode === undefined) delete process.env.OPEN_FINDINGS_RESOLUTION_MODE;
    else process.env.OPEN_FINDINGS_RESOLUTION_MODE = previousResolutionMode;
  }
  const { summary, failures } = result;

  if (opts.json) {
    console.log(JSON.stringify({ summary, pruneResult, failures }, null, 2));
  } else {
    console.log('Open findings summary');
    console.log(`- Total: ${summary.total}`);
    console.log(`- Open: ${summary.open}`);
    console.log(`- Resolved: ${summary.resolved}`);
    console.log(`- Open critical: ${summary.bySeverity.critical.open}`);
    console.log(`- Open high: ${summary.bySeverity.high.open}`);
    if (pruneResult) {
      console.log(
        `- Pruned stale findings: ${pruneResult.pruned} (max age days: ${pruneResult.maxAgeDays})`
      );
    }
    if (failures.length > 0) {
      console.log('- Threshold failures:');
      for (const failure of failures) {
        console.log(`  - ${failure}`);
      }
    }
  }

  if (failures.length > 0) process.exit(1);
}

const wrappedMain = wrapCLITool(main, 'open-findings-summary');

if (require.main === module) {
  wrappedMain();
}

module.exports = {
  parseArgs,
  evaluate,
  buildSummary,
};
