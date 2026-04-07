#!/usr/bin/env node
'use strict';

/**
 * Performance Profile CLI — Unified entry point for profiling modules.
 *
 * Subcommands:
 *   profile bottlenecks <dir>    — Analyze performance bottlenecks
 *   profile targets <dir>        — Identify optimization targets
 *   profile run <command>         — Profile a command execution
 *   profile report                — Generate profiling report
 *
 * @usage
 *   node .claude/tools/cli/performance-profile.cjs bottlenecks .claude/lib/
 *   node .claude/tools/cli/performance-profile.cjs report
 *   node .claude/tools/cli/performance-profile.cjs --help
 */

const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const MODULES = {
  bottlenecks: {
    path: '../../lib/utils/bottleneck-analyzer.cjs',
    description: 'Analyze metrics to identify performance bottlenecks',
  },
  targets: {
    path: '../../lib/utils/optimization-targets.cjs',
    description: 'Define and check performance targets by tier',
  },
  run: {
    path: '../../lib/utils/performance-profiler.cjs',
    description: 'Instrument functions to track execution time and memory',
  },
  report: {
    path: '../../lib/utils/profiling-report-generator.cjs',
    description: 'Generate markdown reports from profiling data',
  },
};

function showHelp() {
  console.log('Usage: performance-profile <subcommand> [args...]\n');
  console.log('Available subcommands:');
  for (const [name, info] of Object.entries(MODULES)) {
    console.log(`  ${name.padEnd(16)} ${info.description}`);
  }
  console.log('\nExamples:');
  console.log('  performance-profile bottlenecks .claude/hooks/');
  console.log('  performance-profile targets .claude/lib/');
  console.log('  performance-profile report');
}

wrapCLITool('performance-profile', () => {
  const [subcommand, ...args] = process.argv.slice(2);

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    showHelp();
    process.exit(0);
  }

  const moduleInfo = MODULES[subcommand];
  if (!moduleInfo) {
    console.error(`Unknown subcommand: ${subcommand}`);
    showHelp();
    process.exit(1);
  }

  try {
    const mod = require(moduleInfo.path);
    if (typeof mod.run === 'function') {
      const result = mod.run(args);
      if (result && typeof result.then === 'function') {
        result.catch(err => {
          console.error(`Error: ${err.message}`);
          process.exit(1);
        });
      }
    } else if (typeof mod.main === 'function') {
      mod.main(args);
    } else if (typeof mod === 'function') {
      mod(args);
    } else {
      console.log(`Module loaded: ${subcommand} (no run/main export found)`);
    }
  } catch (err) {
    console.error(`Failed to load ${subcommand}: ${err.message}`);
    process.exit(1);
  }
});
