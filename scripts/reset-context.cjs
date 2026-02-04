#!/usr/bin/env node
'use strict';

const {
  buildResetPlan,
  executeReset,
  normalizeScope,
} = require('../.claude/lib/utils/context-reset.cjs');

function parseArgs(argv) {
  const args = new Set(argv);
  const getValue = key => {
    const index = argv.indexOf(key);
    if (index === -1 || index === argv.length - 1) return null;
    return argv[index + 1];
  };
  return {
    scope: getValue('--scope') || getValue('-s') || 'soft',
    force: args.has('--force') || args.has('--yes') || args.has('-y'),
    dryRun: args.has('--dry-run'),
    includeLanceDb: args.has('--include-lancedb'),
  };
}

function formatTargets(targets) {
  return targets
    .map(target => '- ' + target.path + ' (' + target.type + ')')
    .join('\n');
}

function printUsage() {
  console.log(
    'Usage: node scripts/reset-context.cjs --scope <soft|memory|full> [--force] [--dry-run] [--include-lancedb]'
  );
  console.log('Defaults: --scope soft, --dry-run unless --force is provided.');
}

function printNextSteps(scope) {
  if (scope === 'memory' || scope === 'full') {
    console.log('Next steps:');
    console.log('- pnpm run memory:init (rebuild SQLite memory schema)');
  }
  if (scope === 'full') {
    console.log('- pnpm run code:index:reindex (rebuild code index)');
    console.log('- pnpm run routing:prototypes (rebuild routing prototypes)');
    console.log('- pnpm run agents:registry (regenerate agent registry)');
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const normalizedScope = normalizeScope(parsed.scope);
  const shouldDryRun = parsed.dryRun || !parsed.force;

  if (normalizedScope !== parsed.scope) {
    console.log('Unknown scope ' + parsed.scope + '; using ' + normalizedScope + '.');
  }

  const plan = buildResetPlan(normalizedScope, { includeLanceDb: parsed.includeLanceDb });

  console.log('Reset scope: ' + plan.scope);
  console.log('Include LanceDB: ' + (plan.includeLanceDb ? 'yes' : 'no'));
  console.log('Targets:');
  console.log(formatTargets(plan.targets));

  if (!parsed.force && !parsed.dryRun) {
    console.log('Dry run only. Re-run with --force to apply deletions.');
    printUsage();
    return;
  }

  const result = executeReset(plan, { dryRun: shouldDryRun });
  if (result.dryRun) {
    console.log('Dry run complete. ' + result.removed.length + ' target(s) would be removed.');
  } else {
    console.log('Reset complete. Removed ' + result.removed.length + ' target(s).');
  }
  printNextSteps(plan.scope);
}

if (require.main === module) {
  main();
}
