#!/usr/bin/env node
'use strict';

/**
 * Diagnostics CLI — Unified entry point for diagnostic modules.
 *
 * Subcommands:
 *   diagnostics edge-cases <file>   — Run edge case detection
 *   diagnostics invariants <dir>    — Check static invariants
 *   diagnostics trajectory <log>    — Normalize agent trajectory
 *   diagnostics state               — Dump current debug state
 *   diagnostics policies            — List registered policies
 *   diagnostics judge <file>        — Run LLM-as-judge evaluation
 *
 * @usage
 *   node .claude/tools/cli/diagnostics.cjs edge-cases src/index.cjs
 *   node .claude/tools/cli/diagnostics.cjs invariants .claude/lib/
 *   node .claude/tools/cli/diagnostics.cjs --help
 */

const { wrapCLITool } = require('../../lib/utils/cli-wrapper.cjs');

const MODULES = {
  'edge-cases': {
    path: '../../lib/diagnostics/edge-case-hunter.cjs',
    description: 'Structured edge case detection with categorized output',
  },
  invariants: {
    path: '../../lib/diagnostics/static-invariants.cjs',
    description: 'Static invariant checker for code correctness',
  },
  trajectory: {
    path: '../../lib/diagnostics/trajectory-normalizer.cjs',
    description: 'Normalize session logs for analysis',
  },
  state: {
    path: '../../lib/diagnostics/debug-state.cjs',
    description: 'Debug session hypothesis tracking',
  },
  policies: {
    path: '../../lib/diagnostics/policy-registry.cjs',
    description: 'Agent policy registry inspection',
  },
  judge: {
    path: '../../lib/diagnostics/llm-judge.cjs',
    description: 'LLM-as-judge evaluation framework',
  },
};

function showHelp() {
  console.log('Usage: diagnostics <subcommand> [args...]\n');
  console.log('Available subcommands:');
  for (const [name, info] of Object.entries(MODULES)) {
    console.log(`  ${name.padEnd(16)} ${info.description}`);
  }
  console.log('\nExamples:');
  console.log('  diagnostics edge-cases src/index.cjs');
  console.log('  diagnostics invariants .claude/lib/');
  console.log('  diagnostics state');
}

wrapCLITool('diagnostics', () => {
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
    // Most diagnostic modules export a main/run function or are self-executing
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
