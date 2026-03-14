#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

// Process self-healing reflection queue
try {
  const processorScript = path.join(ROOT, '.claude', 'hooks', 'process-evolution-queue.cjs');
  if (fs.existsSync(processorScript)) {
    const result = spawnSync('node', [processorScript, '--run-once'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // ignore stderr to prevent cron noise
      timeout: 60000,
      shell: false,
    });
    const output = result.stdout;

    if (output) {
      const lines = output.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && parsed.type === 'evolution-dispatch' && parsed.skill) {
            const argsStr =
              typeof parsed.args === 'string' ? parsed.args : JSON.stringify(parsed.args || {});
            actions.push({
              type: 'task_create',
              subject: parsed.skill,
              description: `Process self-healing evolution request (trigger: ${parsed.trigger}). Execute with args: ${argsStr}`,
            });
          }
        } catch (_e) {
          // Ignore non-JSON lines or parse errors
        }
      }
    }
  }
} catch (_err) {
  // Graceful degradation if queue processor fails
}

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
