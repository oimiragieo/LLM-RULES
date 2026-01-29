# Agent Execution Limits

**Version:** 1.0
**Date:** 2026-01-29
**Status:** Implemented (Task #51)
**Related ADR:** ADR-057 (Agent Enhancement Strategy)

---

## Overview

Agent execution limits prevent runaway agents, control compute costs, and enable graceful termination. This feature is inspired by crewAI's `max_iter` and `max_execution_time` but extends it with cost tracking (`max_cost_usd`) and configurable timeout actions.

**Key Benefits:**

- **Prevents infinite loops** - Agents stop after N tool calls
- **Cost control** - Stop agent when LLM costs exceed budget
- **Predictable runtime** - Terminate agents that exceed time limit
- **Graceful handling** - Choose between terminate/pause/warn on timeout

---

## Schema

Execution limits are defined in `.claude/schemas/agent-spawn-params.json`:

```json
{
  "execution_limits": {
    "max_turns": 25, // Max tool call iterations (1-100)
    "max_duration_ms": 600000, // Max execution time in ms (1s-1hr)
    "max_cost_usd": 1.0, // Max cost in USD (0.01-100.0)
    "timeout_action": "terminate" // "terminate" | "pause" | "warn"
  }
}
```

### Field Descriptions

| Field             | Type    | Default      | Range              | Description                                         |
| ----------------- | ------- | ------------ | ------------------ | --------------------------------------------------- |
| `max_turns`       | integer | 25           | 1-100              | Max tool call iterations (like crewAI's `max_iter`) |
| `max_duration_ms` | integer | 600000 (10m) | 1000-3600000 (1hr) | Max execution time in milliseconds                  |
| `max_cost_usd`    | number  | 1.0          | 0.01-100.0         | Max LLM cost in USD before stopping                 |
| `timeout_action`  | string  | "terminate"  | enum (see below)   | Action to take when limit reached                   |

### Timeout Actions

| Action      | Behavior                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| `terminate` | Stop agent immediately, mark task as incomplete, log error                        |
| `pause`     | Pause agent execution, wait for manual resume (future: TaskUpdate resume support) |
| `warn`      | Log warning but continue execution (use for non-critical agents, debugging)       |

---

## Usage Examples

### Example 1: Standard Developer Task (Balanced Limits)

**Scenario:** Developer implementing a feature (medium complexity, ~20 tool calls, 10 minutes)

```javascript
Task({
  subagent_type: 'developer',
  model: 'sonnet',
  description: 'Developer implementing authentication feature',
  allowed_tools: ['Read', 'Write', 'Edit', 'Bash', 'TaskUpdate', 'Skill'],
  execution_limits: {
    max_turns: 25, // Allow up to 25 tool calls (read, write, edit, test cycles)
    max_duration_ms: 600000, // 10 minutes max execution
    max_cost_usd: 1.0, // Stop if cost exceeds $1.00
    timeout_action: 'terminate',
  },
  prompt: `You are DEVELOPER. Task ID: #42...`,
});
```

**Rationale:**

- `max_turns: 25` - Typical developer tasks: read files (3-5), write code (5-10), run tests (2-3), iterate (5-10) = ~25 turns
- `max_duration_ms: 600000` - 10 minutes should be enough for most implementation tasks
- `max_cost_usd: 1.0` - Sonnet costs ~$0.003/1K tokens, so $1.00 = ~330K tokens (plenty for implementation)
- `timeout_action: terminate` - If limits hit, likely infinite loop or scope creep - stop immediately

### Example 2: Quick QA Validation (Tight Limits)

**Scenario:** QA agent running automated test suite (fast, <5 tool calls, 2 minutes)

```javascript
Task({
  subagent_type: 'qa',
  model: 'haiku',
  description: 'QA validating test suite passes',
  allowed_tools: ['Read', 'Bash', 'TaskUpdate'],
  execution_limits: {
    max_turns: 10, // Simple task: read test files (1-2), run tests (1), report (1) = ~5 turns
    max_duration_ms: 120000, // 2 minutes max
    max_cost_usd: 0.5, // Haiku is cheap (~$0.00025/1K tokens), $0.5 is generous
    timeout_action: 'terminate',
  },
  prompt: `You are QA. Run all tests and report results. Task ID: #55...`,
});
```

**Rationale:**

- `max_turns: 10` - QA tasks are linear: read → run → report, shouldn't need many iterations
- `max_duration_ms: 120000` - Test suites should complete quickly, 2 minutes is generous
- `max_cost_usd: 0.5` - Haiku is very cheap, $0.5 allows for long test outputs
- `timeout_action: terminate` - If QA takes >2 min, likely hung test - terminate

### Example 3: Research Task (Loose Limits)

**Scenario:** Researcher exploring documentation/codebase (exploration-heavy, 40+ tool calls, 20 minutes)

```javascript
Task({
  subagent_type: 'researcher',
  model: 'opus',
  description: 'Researcher investigating authentication patterns',
  allowed_tools: ['Read', 'Grep', 'WebSearch', 'Write', 'TaskUpdate', 'Skill'],
  execution_limits: {
    max_turns: 50, // Research is exploratory: many reads, greps, web searches
    max_duration_ms: 1200000, // 20 minutes for thorough research
    max_cost_usd: 5.0, // Opus is expensive (~$0.015/1K tokens), research generates many tokens
    timeout_action: 'warn', // Research may legitimately take long - warn but don't stop
  },
  prompt: `You are RESEARCHER. Investigate authentication patterns. Task ID: #60...`,
});
```

**Rationale:**

- `max_turns: 50` - Research involves many tool calls: grep, read files, web search, synthesize
- `max_duration_ms: 1200000` - 20 minutes for comprehensive research (multiple sources, analysis)
- `max_cost_usd: 5.0` - Opus generates long responses, research is token-heavy, $5 is reasonable
- `timeout_action: warn` - Research may legitimately hit limits - log warning but let it finish

### Example 4: Long-Running Background Task (Maximum Limits)

**Scenario:** Architecture analysis running in background (very long, 100 tool calls, 1 hour)

```javascript
Task({
  subagent_type: 'architect',
  model: 'opus',
  description: 'Architect analyzing system architecture',
  allowed_tools: ['Read', 'Glob', 'Grep', 'Write', 'TaskCreate', 'Skill'],
  run_in_background: true,
  execution_limits: {
    max_turns: 100, // Architecture analysis: read many files, create diagrams, write docs
    max_duration_ms: 3600000, // 1 hour max (background task, not urgent)
    max_cost_usd: 10.0, // Opus + long analysis = expensive, but worth it for architecture
    timeout_action: 'pause', // If timeout, pause for manual review (don't lose work)
  },
  prompt: `You are ARCHITECT. Analyze codebase architecture. Task ID: #70...`,
});
```

**Rationale:**

- `max_turns: 100` - Architecture analysis touches many files, creates multiple artifacts
- `max_duration_ms: 3600000` - 1 hour for comprehensive codebase analysis
- `max_cost_usd: 10.0` - High-value architecture work justifies higher cost
- `timeout_action: pause` - If hit limit, pause to review progress (don't discard partial work)

---

## Default Values by Agent Type

Recommended defaults based on agent role:

| Agent Type             | max_turns | max_duration_ms | max_cost_usd | timeout_action |
| ---------------------- | --------- | --------------- | ------------ | -------------- |
| **developer**          | 25        | 600000 (10m)    | 1.0          | terminate      |
| **qa**                 | 10        | 120000 (2m)     | 0.5          | terminate      |
| **planner**            | 15        | 300000 (5m)     | 2.0          | terminate      |
| **architect**          | 50        | 1800000 (30m)   | 5.0          | warn           |
| **researcher**         | 50        | 1200000 (20m)   | 5.0          | warn           |
| **security-architect** | 30        | 900000 (15m)    | 3.0          | terminate      |
| **code-reviewer**      | 20        | 600000 (10m)    | 1.5          | warn           |
| **devops**             | 30        | 900000 (15m)    | 2.0          | terminate      |

### Rationale for Defaults

- **Developer:** Balanced limits for typical implementation tasks (read, write, test cycles)
- **QA:** Tight limits for linear test execution (should be fast)
- **Planner:** Moderate limits for design work (less tool-heavy than implementation)
- **Architect/Researcher:** Loose limits for exploratory work (many reads, analysis)
- **Security/Code Review:** Moderate-high limits for thorough analysis
- **DevOps:** Moderate limits for infrastructure changes (slower operations)

---

## Cost Tracking Implementation

**How `max_cost_usd` is tracked:**

1. **Before each LLM call**, estimate token count (prompt + expected completion)
2. **Calculate cost** using model pricing:
   - Haiku: $0.00025/1K prompt, $0.00125/1K completion
   - Sonnet: $0.003/1K prompt, $0.015/1K completion
   - Opus: $0.015/1K prompt, $0.075/1K completion
3. **Accumulate costs** in agent context
4. **Check before next call**: `if (accumulated_cost + next_call_cost > max_cost_usd) → timeout_action`

**Example calculation:**

```javascript
// Sonnet pricing
const SONNET_PROMPT_COST = 0.003 / 1000; // $0.003 per 1K tokens
const SONNET_COMPLETION_COST = 0.015 / 1000; // $0.015 per 1K tokens

// Agent makes 5 calls
let accumulated_cost = 0;

// Call 1: 2K prompt, 1K completion
accumulated_cost += 2000 * SONNET_PROMPT_COST + 1000 * SONNET_COMPLETION_COST;
// = $0.006 + $0.015 = $0.021

// Call 2: 3K prompt, 2K completion
accumulated_cost += 3000 * SONNET_PROMPT_COST + 2000 * SONNET_COMPLETION_COST;
// = $0.009 + $0.030 = $0.039, total = $0.060

// ... continue until accumulated_cost > max_cost_usd
if (accumulated_cost > max_cost_usd) {
  executeTimeoutAction(timeout_action);
}
```

---

## Turn Counting Implementation

**How `max_turns` is tracked:**

A "turn" = one tool call from agent to tool (Read, Write, Bash, etc.)

**Examples:**

```
Turn 1: Read('.claude/agents/core/developer.md')
Turn 2: Read('.claude/context/memory/learnings.md')
Turn 3: Write('.claude/schemas/agent-spawn-params.json', ...)
Turn 4: Bash({ command: 'npm test' })
Turn 5: TaskUpdate({ taskId: '51', status: 'completed' })

Total: 5 turns
```

**Not counted as turns:**

- Internal reasoning (agent thinking, planning)
- LLM calls without tool invocation
- Reading context from memory (implicit)

**Why this matters:**

- Prevents infinite loops (agent calling same tool repeatedly)
- Catches stuck agents (agent keeps retrying failed operation)
- Enables predictable resource usage (N turns = N tool calls = N costs)

---

## Duration Tracking Implementation

**How `max_duration_ms` is tracked:**

1. **Start timer** when agent first spawned (Task() call completes)
2. **Check timer** before each tool call
3. **If elapsed > max_duration_ms** → execute timeout_action
4. **Stop timer** when agent completes (TaskUpdate completed) or terminates

**Example:**

```javascript
const startTime = Date.now();
const max_duration_ms = 600000; // 10 minutes

while (agent.hasNextTurn()) {
  const elapsed = Date.now() - startTime;

  if (elapsed > max_duration_ms) {
    executeTimeoutAction(timeout_action);
    break;
  }

  agent.executeTurn();
}
```

**Edge cases:**

- **Async operations (Bash):** Duration includes time waiting for command completion
- **Background agents:** Duration tracked separately per agent (not global)
- **Paused agents:** Duration pauses when agent pauses (doesn't count idle time)

---

## Timeout Action Behavior

### 1. `terminate` (Default)

**What happens:**

1. Stop agent immediately (interrupt current tool call if possible)
2. Mark task as `failed` with error: `"Execution limit exceeded: [max_turns|max_duration_ms|max_cost_usd]"`
3. Log error with details:
   ```json
   {
     "error": "Agent exceeded max_turns limit",
     "taskId": "51",
     "agentType": "developer",
     "turns": 26,
     "max_turns": 25,
     "elapsed_ms": 450000,
     "accumulated_cost_usd": 0.85
   }
   ```
4. Clean up resources (close files, kill child processes)
5. Emit `AGENT_FAILED` event

**When to use:**

- Production agents (must not run away)
- Cost-sensitive operations
- When failure is acceptable (non-critical tasks)

### 2. `pause` (Future: Manual Resume)

**What happens:**

1. Pause agent execution (finish current tool call, then stop)
2. Save agent state (turn count, cost, context)
3. Mark task as `paused` with metadata:
   ```json
   {
     "status": "paused",
     "reason": "Execution limit exceeded",
     "taskId": "51",
     "resume_url": "/tasks/51/resume",
     "state": { ... }
   }
   ```
4. Emit `AGENT_PAUSED` event
5. Wait for manual resume (`TaskUpdate({ taskId: '51', status: 'in_progress' })`)

**When to use:**

- Long-running background tasks (don't lose progress)
- High-value work (architecture analysis, research)
- When manual review needed before continuing

**Note:** Manual resume support is planned for future implementation.

### 3. `warn` (Continue with Warning)

**What happens:**

1. Log warning with details (same as terminate error format)
2. Continue agent execution normally
3. Emit `AGENT_WARNING` event (for monitoring)
4. Optionally: Notify user via dashboard

**When to use:**

- Development/debugging (see how far agent goes)
- Non-critical tasks (research, exploration)
- When limits are soft guidelines (not hard requirements)

**Caution:** May lead to runaway costs or infinite loops - use sparingly in production.

---

## Monitoring and Alerts

**Recommended monitoring:**

1. **Dashboard metrics:**
   - Agents hitting limits (count per hour)
   - Avg turns per agent type
   - Avg duration per agent type
   - Total cost per agent type
   - Timeout action distribution (terminate vs pause vs warn)

2. **Alerts:**
   - Alert when agent exceeds 80% of max_turns (early warning)
   - Alert when agent exceeds 80% of max_duration_ms
   - Alert when accumulated_cost > $10/hour (runaway cost detection)
   - Alert when >5 agents terminate per hour (systemic issue)

3. **Logging:**
   - Log all limit violations to `.claude/logs/execution-limits.log`
   - Include full agent context (task, turns, cost, duration)
   - Enable post-mortem debugging

---

## Future Enhancements

### 1. Dual LLM Cost Tracking (ADR-057 P1.3)

**Goal:** Separate planning LLM (Opus) from execution LLM (Haiku) to reduce costs 60-70%

**Implementation:**

```javascript
execution_limits: {
  max_turns: 25,
  max_duration_ms: 600000,
  max_planning_cost_usd: 0.5,   // Opus for reasoning
  max_execution_cost_usd: 0.3,   // Haiku for tool calls
  max_total_cost_usd: 1.0,       // Combined limit
  timeout_action: 'terminate'
}
```

### 2. Adaptive Limits (Machine Learning)

**Goal:** Learn optimal limits per agent type based on historical data

**Implementation:**

- Track successful task completion rates by limit configuration
- Adjust limits dynamically (increase if task fails due to limits, decrease if underutilized)
- Recommend optimal limits per agent type

### 3. Cost Budgets per User/Team

**Goal:** Enforce team-wide cost limits, not just per-agent

**Implementation:**

```javascript
execution_limits: {
  max_turns: 25,
  max_duration_ms: 600000,
  max_cost_usd: 1.0,          // Per-agent limit
  team_budget_usd: 100.0,     // Shared team budget
  user_budget_usd: 10.0,      // Per-user daily budget
  timeout_action: 'terminate'
}
```

### 4. Retry with Increased Limits

**Goal:** Allow agent to request more resources if legitimately needed

**Implementation:**

```javascript
timeout_action: 'request_increase'; // Ask user for approval to continue
```

---

## Testing Strategy

### Unit Tests

**File:** `tests/unit/execution-limits.test.mjs`

```javascript
describe('Execution Limits', () => {
  it('should terminate agent when max_turns exceeded', async () => {
    const agent = spawnAgent({ execution_limits: { max_turns: 5 } });
    // Execute 6 turns
    for (let i = 0; i < 6; i++) {
      await agent.executeTurn();
    }
    expect(agent.status).toBe('failed');
    expect(agent.error).toContain('max_turns');
  });

  it('should terminate agent when max_duration_ms exceeded', async () => {
    const agent = spawnAgent({ execution_limits: { max_duration_ms: 1000 } });
    await sleep(1100);
    await agent.executeTurn();
    expect(agent.status).toBe('failed');
    expect(agent.error).toContain('max_duration_ms');
  });

  it('should terminate agent when max_cost_usd exceeded', async () => {
    const agent = spawnAgent({ execution_limits: { max_cost_usd: 0.1 } });
    // Make expensive LLM calls
    while (agent.accumulated_cost < 0.11) {
      await agent.llmCall({ tokens: 10000 });
    }
    expect(agent.status).toBe('failed');
    expect(agent.error).toContain('max_cost_usd');
  });

  it('should warn but continue when timeout_action=warn', async () => {
    const agent = spawnAgent({
      execution_limits: { max_turns: 5, timeout_action: 'warn' },
    });
    for (let i = 0; i < 6; i++) {
      await agent.executeTurn();
    }
    expect(agent.status).toBe('in_progress'); // Still running
    expect(agent.warnings).toContain('max_turns');
  });
});
```

### Integration Tests

**File:** `tests/integration/execution-limits.test.mjs`

```javascript
describe('Execution Limits Integration', () => {
  it('should terminate developer agent after 25 turns', async () => {
    const taskId = await TaskCreate({ subject: 'Test task' });

    await Task({
      subagent_type: 'developer',
      execution_limits: { max_turns: 25 },
      prompt: 'Loop infinitely calling Read tool',
    });

    // Wait for agent to hit limit
    await waitFor(() => task.status === 'failed', 30000);

    const task = await TaskGet({ taskId });
    expect(task.status).toBe('failed');
    expect(task.error).toContain('max_turns');
  });
});
```

---

## Related Documentation

- **ADR-057:** Agent Enhancement Strategy (crewAI patterns)
- **ADR-054:** Memory System Enhancement (context for cost tracking)
- **Spec:** `.claude/context/artifacts/specs/memory-system-enhancement-spec.md` (Section 7.2)
- **Research:** `.claude/context/artifacts/research-reports/agent-comparison-analysis-2026-01-28.md` (Section 1.6)
- **Schema:** `.claude/schemas/agent-spawn-params.json`

---

## Changelog

| Version | Date       | Author    | Changes                                                 |
| ------- | ---------- | --------- | ------------------------------------------------------- |
| 1.0     | 2026-01-29 | Developer | Initial specification (Task #51, ADR-057 P1.2 complete) |

---

**END OF DOCUMENTATION**
