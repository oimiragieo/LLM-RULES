#!/usr/bin/env node
/**
 * multi-agent-architecture-reference — main CLI entry point
 *
 * Usage:
 *   node .claude/skills/multi-agent-architecture-reference/scripts/main.cjs [--topology <name>] [--list]
 *
 * Examples:
 *   node scripts/main.cjs --list
 *   node scripts/main.cjs --topology conductor
 *   node scripts/main.cjs --topology swarm
 */

'use strict';

const args = process.argv.slice(2);

const TOPOLOGIES = {
  conductor: {
    tokenCost: '~6x',
    bestFor: 'Sequential phases, ordered agent steps, default agent-studio pattern',
    failureModes: ['SE-M01: Coordinator Overload'],
    existingSkill: 'master-orchestrator.md',
  },
  supervisor: {
    tokenCost: '~5x',
    bestFor: 'Known task types, specialist agents, deterministic routing',
    failureModes: ['SE-M01: Single point of failure; router miscalibration'],
    existingSkill: 'Built into Router',
  },
  'fan-out': {
    tokenCost: '~8x',
    bestFor: 'Parallel review/analysis, map-reduce, search',
    failureModes: ['Result aggregation complexity'],
    existingSkill: 'wave-executor',
  },
  swarm: {
    tokenCost: '~8x',
    bestFor: 'Independent tasks, load balancing, fault-tolerant processing',
    failureModes: ['SE-M02: Swarm Deadlock', 'SE-M05: Orphaned Tasks'],
    existingSkill: 'swarm-coordination',
  },
  consensus: {
    tokenCost: '~12x',
    bestFor: 'High-stakes decisions requiring multi-reviewer agreement',
    failureModes: ['SE-M02: Deadlock on split votes'],
    existingSkill: 'consensus-voting',
  },
  hierarchical: {
    tokenCost: '~15x',
    bestFor: 'EPIC complexity, multiple distinct phases with sub-orchestration',
    failureModes: ['SE-M03: Cascade Failure', 'SE-M04: Token Runaway (max_depth=3)'],
    existingSkill: 'Custom per project',
  },
};

const FAILURE_MODES = {
  'SE-M01': {
    name: 'Coordinator Overload',
    affected: ['Supervisor', 'Conductor', 'Hierarchical root'],
    fix: 'Distribute coordination or add routing replicas; use wave-executor for fan-out',
  },
  'SE-M02': {
    name: 'Swarm Deadlock',
    affected: ['Swarm', 'Consensus Voting'],
    fix: 'Timeout + majority-vote with tie-breaker; set consensus_timeout_ms',
  },
  'SE-M03': {
    name: 'Cascade Failure',
    affected: ['Hierarchical'],
    fix: 'Circuit breakers at each tier; retry with backoff; fallback agents',
  },
  'SE-M04': {
    name: 'Token Runaway',
    affected: ['Hierarchical'],
    fix: 'Set max_depth=3; monitor token budget per level; prefer Conductor',
  },
  'SE-M05': {
    name: 'Orphaned Tasks',
    affected: ['Swarm'],
    fix: 'Assign task IDs; use TaskUpdate tracking; require TaskUpdate(in_progress) on pickup',
  },
};

function listTopologies() {
  process.stdout.write('\nMulti-Agent Topology Decision Matrix\n');
  process.stdout.write('=====================================\n\n');
  for (const [name, info] of Object.entries(TOPOLOGIES)) {
    process.stdout.write(`${name.toUpperCase()} (${info.tokenCost})\n`);
    process.stdout.write(`  Best for: ${info.bestFor}\n`);
    process.stdout.write(`  Skill: ${info.existingSkill}\n`);
    process.stdout.write(`  Failure modes: ${info.failureModes.join(', ')}\n\n`);
  }
}

function showTopology(name) {
  const topology = TOPOLOGIES[name.toLowerCase()];
  if (!topology) {
    process.stderr.write(`Unknown topology: ${name}\n`);
    process.stderr.write(`Available: ${Object.keys(TOPOLOGIES).join(', ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`\nTopology: ${name.toUpperCase()}\n`);
  process.stdout.write(`Token Cost: ${topology.tokenCost}\n`);
  process.stdout.write(`Best For: ${topology.bestFor}\n`);
  process.stdout.write(`Existing Skill: ${topology.existingSkill}\n`);
  process.stdout.write(`Failure Modes:\n`);
  for (const mode of topology.failureModes) {
    const code = mode.split(':')[0];
    const fm = FAILURE_MODES[code];
    if (fm) {
      process.stdout.write(`  ${code}: ${fm.name}\n`);
      process.stdout.write(`    Fix: ${fm.fix}\n`);
    } else {
      process.stdout.write(`  ${mode}\n`);
    }
  }
  process.stdout.write('\n');
}

function showHelp() {
  process.stdout.write(
    'Usage: node main.cjs [--topology <name>] [--list] [--failure-modes] [--help]\n'
  );
  process.stdout.write('\nOptions:\n');
  process.stdout.write('  --list             List all topologies with token costs\n');
  process.stdout.write('  --topology <name>  Show details for a specific topology\n');
  process.stdout.write('  --failure-modes    List all failure modes and fixes\n');
  process.stdout.write('  --help             Show this help\n');
  process.stdout.write(`\nAvailable topologies: ${Object.keys(TOPOLOGIES).join(', ')}\n`);
}

function listFailureModes() {
  process.stdout.write('\nFailure Mode Taxonomy\n');
  process.stdout.write('=====================\n\n');
  for (const [code, info] of Object.entries(FAILURE_MODES)) {
    process.stdout.write(`${code}: ${info.name}\n`);
    process.stdout.write(`  Affected: ${info.affected.join(', ')}\n`);
    process.stdout.write(`  Fix: ${info.fix}\n\n`);
  }
}

// Parse args
if (args.includes('--help') || args.length === 0) {
  showHelp();
} else if (args.includes('--list')) {
  listTopologies();
} else if (args.includes('--failure-modes')) {
  listFailureModes();
} else if (args.includes('--topology')) {
  const idx = args.indexOf('--topology');
  const name = args[idx + 1];
  if (!name) {
    process.stderr.write('Error: --topology requires a topology name\n');
    process.exit(1);
  }
  showTopology(name);
} else {
  showHelp();
  process.exit(1);
}
