const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const learnPath = path.join(ROOT, '.claude/context/memory/learnings.md');

const actions = [];

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
