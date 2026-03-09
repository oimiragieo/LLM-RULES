const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../../..');
const remPath = path.join(ROOT, '.claude/context/runtime/reflection-reminder.txt');
const learnPath = path.join(ROOT, '.claude/context/memory/learnings.md');

const actions = [];

if (fs.existsSync(remPath)) {
  const content = fs.readFileSync(remPath, 'utf8').trim();
  if (content.length > 0) {
    actions.push({
      type: 'task_create',
      subject: 'reflection-agent',
      description: 'Run continuous reflection cycle based on pending reflection reminders.',
    });
  }
}

if (fs.existsSync(learnPath)) {
  const stats = fs.statSync(learnPath);
  if (stats.size > 35000) {
    try {
      execSync('node .claude/lib/memory/memory-rotator.cjs', { cwd: ROOT, stdio: 'ignore' });
    } catch (_e) {
      // Ignore rotation failure
    }
  }
}

if (actions.length > 0) {
  const queuePath = path.join(ROOT, '.claude', 'context', 'runtime', 'cron-actions-queue.jsonl');

  // Ensure directory exists
  const dir = path.dirname(queuePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Append each action individually
  for (const action of actions) {
    const line = JSON.stringify({
      ...action,
      queuedAt: new Date().toISOString(),
    });
    fs.appendFileSync(queuePath, line + '\n');
  }
  process.stdout.write(`QUEUED_ACTIONS: ${actions.length}\n`);
} else {
  process.stdout.write('HEARTBEAT_OK (no reflections pending)\n');
}
