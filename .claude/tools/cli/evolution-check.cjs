#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const learnPath = path.join(ROOT, '.claude/context/memory/learnings.md');

const actions = [];

// --- Worktree Slop Auto-Detection ---
try {
  const worktreesDir = path.join(ROOT, '.claude', 'worktrees');
  if (fs.existsSync(worktreesDir)) {
    const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });
    const activeWorktrees = entries.filter(e => e.isDirectory() && e.name.startsWith('agent-'));
    if (activeWorktrees.length > 15) {
      actions.push({
        type: 'task_create',
        subject: 'devops',
        description: `Critical: ${activeWorktrees.length} active agent worktrees detected in .claude/worktrees. This is a severe resource leak. Please investigate and fix worktree-auto-cleanup.cjs to properly prune agent worktrees safely across Windows/Linux, and then execute worktree-prune.cjs to clean up the existing slop.`,
      });
    }
  }
} catch (_wtErr) {
  // Graceful degradation if directory scan fails
}
// Evaluate if there's enough new learnings to trigger an evolution cycle
if (fs.existsSync(learnPath)) {
  const stats = fs.statSync(learnPath);
  // arbitrary heuristic: if learnings > 5KB, queue evolution
  if (stats.size > 5000) {
    actions.push({
      type: 'task_create',
      subject: 'agent-evolver',
      description:
        'Run 24h evolution cycle: evaluate agent definitions against recent learnings and propose structural code improvements.',
    });
  }
}

// Process self-healing reflection queue (removed in Phase 10 cleanup)
// process-evolution-queue.cjs was deleted as part of dead hook removal
// Evolution processing now handled by unified-reflection-handler.cjs

if (actions.length > 0) {
  const queuePath = path.join(ROOT, '.claude', 'context', 'runtime', 'cron-actions-queue.jsonl');
  const dir = path.dirname(queuePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const action of actions) {
    const line = JSON.stringify({
      ...action,
      queuedAt: new Date().toISOString(),
    });
    fs.appendFileSync(queuePath, line + '\n');
  }
  process.stdout.write(`QUEUED_ACTIONS: ${actions.length}\n`);
} else {
  process.stdout.write('HEARTBEAT_OK (no evolution needed)\n');
}
