# Channel Management — Implementation Template

Use this template when integrating `channel-management` into an agent workflow.

## Standard Lifecycle Integration

```javascript
// Step 0: Invoke the skill
Skill({ skill: 'channel-management' });

// Step 1: Check status
const statusResult = await Bash({
  command: 'node .claude/skills/channel-management/scripts/main.cjs status',
});
const status = JSON.parse(statusResult.stdout);

// Step 2: Start if not running
if (!status.running) {
  const startResult = await Bash({
    command: 'node .claude/skills/channel-management/scripts/main.cjs start',
  });
  const started = JSON.parse(startResult.stdout);
  if (!started.ok && started.health !== 'SKIPPED') {
    // Log failure and escalate
    throw new Error(`Channel start failed: ${started.reason}`);
  }
}

// Step 3: Health check
const healthResult = await Bash({
  command: 'node .claude/skills/channel-management/scripts/main.cjs health',
});
const health = JSON.parse(healthResult.stdout);
if (health.health !== 'OK' && health.health !== 'SKIPPED') {
  // Session degraded — log to issues.md
}
```

## Auto-Start Pattern (for heartbeat-orchestrator)

```javascript
// In heartbeat-orchestrator boot sequence
Skill({ skill: 'channel-management' });
// The skill handles CHANNEL_AUTO_START guard internally
```

## Crash Recovery Pattern

```javascript
// When health check returns DEGRADED
const stop = await Bash({
  command: 'node .claude/skills/channel-management/scripts/main.cjs stop',
});
// killOrphaned() is called automatically by 'health' and 'stop' actions
const restart = await Bash({
  command: 'node .claude/skills/channel-management/scripts/main.cjs start',
});
const healthCheck = await Bash({
  command: 'node .claude/skills/channel-management/scripts/main.cjs health',
});
```
