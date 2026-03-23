'use strict';

/**
 * team-orchestration/scripts/main.cjs
 * CLI entry point for the team-orchestration skill.
 * Usage: node .claude/skills/team-orchestration/scripts/main.cjs --phase <phase> [options]
 */

const path = require('path');
const fs = require('fs');

const PHASES = ['plan', 'design', 'implement', 'review', 'test', 'deploy'];

const args = process.argv.slice(2);
const phaseIdx = args.indexOf('--phase');
const taskIdx = args.indexOf('--task');
// --snapshot reserved for future use

const phase = phaseIdx !== -1 ? args[phaseIdx + 1] : null;
const taskId = taskIdx !== -1 ? args[taskIdx + 1] : `task-${Date.now()}`;
const snapshotDir = path.join(process.cwd(), '.claude', 'context', 'plans');

if (!phase || !PHASES.includes(phase)) {
  process.stderr.write(`Usage: --phase <${PHASES.join('|')}> [--task <id>]\n`);
  process.exit(1);
}

// Load or create snapshot
const snapshotPath = path.join(snapshotDir, `${taskId}.snapshot.json`);
let snapshot = {
  taskId,
  currentPhase: phase,
  completedPhases: [],
  approvals: {},
  agentAssignments: {
    plan: 'planner',
    design: 'architect',
    implement: 'developer',
    review: 'code-reviewer',
    test: 'qa',
    deploy: 'devops',
  },
  resumable: true,
  timestamp: new Date().toISOString(),
};

if (fs.existsSync(snapshotPath)) {
  try {
    snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    snapshot.currentPhase = phase;
    snapshot.timestamp = new Date().toISOString();
  } catch (_err) {
    /* snapshot not yet created */
  }
}

if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });
fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');

const phaseIndex = PHASES.indexOf(phase);
const previousPhases = PHASES.slice(0, phaseIndex);
const missingApprovals = previousPhases.filter(p => !snapshot.approvals[p] && phaseIndex > 0);

process.stdout.write(
  JSON.stringify(
    {
      taskId,
      phase,
      agent: snapshot.agentAssignments[phase],
      snapshotPath,
      previousPhasesCompleted: previousPhases,
      missingApprovals,
      message: `Ready to execute phase: ${phase} with agent: ${snapshot.agentAssignments[phase]}`,
    },
    null,
    2
  ) + '\n'
);
