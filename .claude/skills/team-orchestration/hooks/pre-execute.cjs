'use strict';

/**
 * team-orchestration/hooks/pre-execute.cjs
 * Validates phase input and checks phase transition eligibility.
 */

const path = require('path');
const fs = require('fs');

const VALID_PHASES = ['plan', 'design', 'implement', 'review', 'test', 'deploy'];
const PHASE_ORDER = { plan: 0, design: 1, implement: 2, review: 3, test: 4, deploy: 5 };

function preExecute(input = {}) {
  const errors = [];

  if (input.phase && !VALID_PHASES.includes(input.phase)) {
    errors.push(`Invalid phase: "${input.phase}". Valid phases: ${VALID_PHASES.join(', ')}`);
  }

  if (input.taskId && typeof input.taskId !== 'string') {
    errors.push('taskId must be a string');
  }

  if (input.skipApprovalGate && typeof input.skipApprovalGate !== 'boolean') {
    errors.push('skipApprovalGate must be boolean');
  }

  if (errors.length > 0) {
    process.stderr.write(
      `[team-orchestration/pre-execute] Validation failed:\n${errors.join('\n')}\n`
    );
    process.exit(2);
  }

  // Check snapshot exists if phase > plan
  if (input.phase && input.taskId && PHASE_ORDER[input.phase] > 0) {
    const snapshotPath = path.resolve(
      process.cwd(),
      '.claude', 'context', 'plans',
      `${input.taskId}.snapshot.json`
    );
    if (!fs.existsSync(snapshotPath)) {
      process.stderr.write(
        `[team-orchestration/pre-execute] WARNING: No snapshot found at ${snapshotPath}. Phase continuity may be broken.\n`
      );
    }
  }

  return { continue: true };
}

module.exports = { preExecute };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    let input = {};
    try { input = JSON.parse(raw); } catch (_err) { /* non-JSON stdin ignored */ }
    preExecute(input);
    process.exit(0);
  });
}
