# Behavioral Loop Detection — Implementation Template

Use this template when integrating loop detection into a custom agent or orchestrator.

## Setup (at task start)

```javascript
Skill({ skill: 'behavioral-loop-detection' });

// Initialize in-memory buffer
const loopBuffer = {
  window: [],
  maxSize: 20,
  similarRunLength: 0,
  lastNormalized: null,
};
```

## Per-Action Check (before each tool call)

```javascript
// 1. Record
const entry = recordAction(loopBuffer, '{{TOOL_NAME}}', {{TOOL_ARGS}});

// 2. Check similarity
const simResult = checkSimilarity(loopBuffer, entry);

// 3. Apply escalation
const escalation = applyEscalation(simResult.runLength, '{{TASK_ID}}');

// 4. Handle escalation
if (escalation.level === 3) {
  // FORCE-DONE: stop and complete with partial results
  TaskUpdate({
    taskId: '{{TASK_ID}}',
    status: 'completed',
    metadata: {
      summary: 'Partial completion — loop detected after {{N}} similar actions',
      partial: true,
      loopDetected: true,
    },
  });
  return; // stop the task loop
}

if (escalation.level >= 1) {
  // Inject escalation message into agent reasoning
  // e.g., prepend to next prompt or log to context
  console.warn('[loop-detection]', escalation.message);
}
```

## Required Imports

```javascript
const {
  createBuffer,
  recordAction,
  checkSimilarity,
  applyEscalation,
} = require('.claude/skills/behavioral-loop-detection/scripts/main.cjs');
```
