# System Architecture Handbook

**Version:** 1.0.0
**Last Updated:** 2026-01-30
**Target Audience:** New developers, operators, and architects joining the agent-studio project

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Component Architecture](#component-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Key Algorithms](#key-algorithms)
5. [Integration Points](#integration-points)
6. [Performance Characteristics](#performance-characteristics)

---

## System Overview

### What is agent-studio?

Agent-studio is a production-grade multi-agent orchestration framework built on Claude Code. It provides an enterprise-ready platform for routing complex tasks to specialized AI agents, coordinating multi-agent workflows, and applying machine learning optimization to improve execution patterns over time.

The framework enables:

- **Task Routing**: Intelligent classification and routing of user requests to the most appropriate specialized agent
- **Multi-Agent Orchestration**: Coordination of multiple agents working in parallel or sequence
- **Self-Evolution**: Automatic creation of new agents, skills, and workflows based on detected capability gaps
- **ML Optimization**: Pattern detection, cost prediction, and adaptive execution to improve performance

### Design Philosophy

Agent-studio follows several core principles:

**1. Router-First Architecture**

The Router is the single entry point for all user requests. It never executes work directly. Instead, it analyzes requests, selects appropriate agents, and spawns them via the Task tool. This creates loose coupling and enables easy extension.

**2. Bounded Resource Management**

All collections, caches, and history arrays have explicit size limits. This prevents memory exhaustion during long-running operations and ensures predictable resource consumption.

**3. Graceful Degradation**

All features support feature flags and graceful degradation. ML features can be disabled at runtime without affecting core functionality. If one component fails, the system continues operating.

**4. Event-Driven Communication**

Components communicate through events, enabling loose coupling and easy monitoring. The workflow engine emits events at every phase, step, and gate transition.

**5. Checkpoint-Based Durability**

Long-running workflows support checkpointing and resumption. If a process is interrupted, it can resume from the last checkpoint rather than restarting.

### Core Architecture: Router, Agents, Orchestrators, ML Platform

The system consists of four major subsystems:

```
+-------------+     +----------------+     +-----------------+
|   ROUTER    | --> |    AGENTS      | --> |   WORKFLOWS     |
| (routing.md)|     | (50+ types)    |     | (state machine) |
+-------------+     +----------------+     +-----------------+
       |                   |                       |
       v                   v                       v
+-------------+     +----------------+     +-----------------+
| TASK SYSTEM | --> | ORCHESTRATORS  | --> |  ML PLATFORM    |
| (tracking)  |     | (coordination) |     | (optimization)  |
+-------------+     +----------------+     +-----------------+
```

**Router**: The entry point that analyzes requests, applies self-check gates, and spawns appropriate agents.

**Agents**: 50+ specialized agents covering core functions (developer, qa, planner, architect), domain expertise (python-pro, rust-pro, frontend-pro), specialized functions (security-architect, devops, incident-responder), and orchestration (master-orchestrator, swarm-coordinator, evolution-orchestrator, party-orchestrator).

**Orchestrators**: Special agents that can spawn other agents. They coordinate multi-agent work, handle parallel execution, and manage consensus-based decisions.

**ML Platform**: Phase 5 features including pattern detection (N-gram analysis), cost prediction (token estimation), and adaptive execution (pattern-based optimization).

### Technology Stack

**Runtime Environment:**

- Node.js 20+ (V8 JavaScript engine)
- CommonJS modules (.cjs) for production code
- ES Modules (.mjs) for test files

**Core Technologies:**

- Custom YAML parser for workflow definitions
- Event-driven architecture (EventEmitter pattern)
- Feature flags via environment variables
- Git-based version control and rollback

**Observability:**

- Heap monitoring with threshold-based alerts
- Event-based logging at all execution points
- Production alerts with escalation matrix
- Prometheus metrics endpoints

**Testing:**

- Node.js built-in test runner
- TDD workflow (RED-GREEN-REFACTOR)
- 1364 total tests (1322 passing, 96.9% pass rate)
- Memory leak regression tests

---

## Component Architecture

### Router: The Central Dispatcher

**Location:** `.claude/agents/core/router.md`

The Router is the system's front controller. It receives every user request and determines how to handle it. The Router follows a strict protocol:

1. **TaskList()** - Always check existing tasks first
2. **Analyze** - Classify request by intent, complexity, domain, risk
3. **Gate Check** - Pass 4 self-check gates (complexity, security, tool, creator)
4. **Spawn** - Create subagent(s) via Task tool

**Tool Restrictions:**

The Router has a whitelist of allowed tools:

- `Task`, `TaskList`, `TaskCreate`, `TaskUpdate`, `TaskGet`
- `Read` (for agent files and routing docs only)
- `AskUserQuestion`

The Router cannot use: `Edit`, `Write`, `Bash`, `Glob`, `Grep`, `WebSearch`, or any MCP tools. If these tools are needed, the Router must spawn an agent.

**Self-Check Gates:**

| Gate               | Trigger                                         | Action                     |
| ------------------ | ----------------------------------------------- | -------------------------- |
| Gate 1: Complexity | Multi-step, multi-file, architecture decisions  | Spawn PLANNER first        |
| Gate 2: Security   | Auth/authz, credentials, security-critical code | Include SECURITY-ARCHITECT |
| Gate 3: Tool       | Would use blacklisted tools                     | Spawn appropriate agent    |
| Gate 4: Creator    | Writing to artifact paths                       | Invoke creator skill       |

**Routing Decision Flow:**

```
User Request
     |
     v
+------------+
| TaskList() |
+------------+
     |
     v
+------------------+     +-------------------+
| Classify Intent  | --> | Match to Agent    |
+------------------+     +-------------------+
     |                          |
     v                          v
+------------------+     +-------------------+
| Apply Gates 1-4  | --> | Select Model      |
+------------------+     | (haiku/sonnet/opus)|
     |                   +-------------------+
     v                          |
+------------------+            v
| Spawn Agent(s)   | <----------+
+------------------+
```

### Agent Ecosystem: 50+ Specialized Agents

**Directory Structure:**

```
.claude/agents/
├── core/           # Essential agents (developer, qa, planner, architect)
├── domain/         # Language/framework experts (python-pro, rust-pro)
├── specialized/    # Function-specific (security-architect, devops)
└── orchestrators/  # Coordination agents (master-orchestrator, swarm-coordinator)
```

**Core Agents:**

| Agent                | Purpose                                   | Model  |
| -------------------- | ----------------------------------------- | ------ |
| `developer`          | Bug fixes, feature implementation, coding | sonnet |
| `planner`            | Feature planning, task breakdown, design  | sonnet |
| `architect`          | System design, architecture decisions     | opus   |
| `qa`                 | Testing, QA validation, test writing      | sonnet |
| `technical-writer`   | Documentation, user guides, API docs      | sonnet |
| `pm`                 | Product management, requirements          | sonnet |
| `reflection-agent`   | Quality reflection, session analysis      | sonnet |
| `context-compressor` | Context summarization                     | sonnet |

**Domain Experts:**

| Agent              | Expertise                 | Model  |
| ------------------ | ------------------------- | ------ |
| `python-pro`       | Python, Django, FastAPI   | sonnet |
| `rust-pro`         | Rust, systems programming | sonnet |
| `golang-pro`       | Go, microservices         | sonnet |
| `typescript-pro`   | TypeScript, Node.js       | sonnet |
| `frontend-pro`     | React, Vue, Angular       | sonnet |
| `java-pro`         | Java, Spring Boot         | sonnet |
| `nextjs-pro`       | Next.js App Router        | sonnet |
| `ai-ml-specialist` | AI/ML, deep learning      | opus   |
| `data-engineer`    | ETL, data pipelines       | sonnet |

**Specialized Functions:**

| Agent                   | Function                          | Model  |
| ----------------------- | --------------------------------- | ------ |
| `security-architect`    | Security review, threat modeling  | opus   |
| `devops`                | Infrastructure, deployment        | sonnet |
| `devops-troubleshooter` | Debugging, incident response      | sonnet |
| `incident-responder`    | Production incidents              | opus   |
| `code-reviewer`         | Code review, PR review            | sonnet |
| `code-simplifier`       | Refactoring, simplification       | sonnet |
| `database-architect`    | Schema design, query optimization | sonnet |
| `c4-*`                  | C4 architecture diagrams          | sonnet |

### Orchestrators: Multi-Agent Coordination

Orchestrators are special agents that can spawn other agents. They coordinate complex multi-agent workflows.

**Master Orchestrator:**

- Coordinates large projects requiring multiple specialists
- Manages parallel execution of independent tasks
- Consolidates results from multiple agents

**Swarm Coordinator:**

- Manages swarm-based coordination patterns
- Handles convergent workflows (multiple agents to single result)
- Implements consensus-based decision making

**Evolution Orchestrator:**

- Implements the EVOLVE workflow for self-evolution
- Creates new agents, skills, and workflows
- Enforces research requirements before creation

**Party Orchestrator:**

- Multi-agent collaboration and discussion
- Debate and consensus modes
- Team decision making

**Critical Configuration:**

Orchestrators MUST include `Task` tool in their allowed_tools list. Without it, they cannot spawn subagents.

### ML Platform: Phase 5 Features

**Location:** `.claude/lib/ml/`

The ML Platform provides four core capabilities:

**1. Pattern Detector (WorkflowPatternDetector)**

- Analyzes workflow execution history
- Identifies frequent task sequences using N-gram analysis
- Detects bottleneck patterns and optimization opportunities
- Memory budget: 500KB (10,000 patterns max)

```javascript
const { getPatternDetector } = require('.claude/lib/ml');
const detector = getPatternDetector({ minSupport: 0.1 });
const patterns = detector.detectFrequentSequences(workflows);
```

**2. Cost Predictor (CostPredictor)**

- Estimates token counts for prompts
- Predicts LLM costs by model
- Tracks actual vs predicted costs
- Memory budget: stateless (per-call estimation)

```javascript
const { getCostPredictor } = require('.claude/lib/ml');
const predictor = getCostPredictor({ budgetAlertThreshold: 10.0 });
const cost = predictor.estimateCost(inputTokens, outputTokens, 'claude-sonnet-4-20250514');
```

**3. Adaptive Executor (AdaptiveExecutor)**

- Applies pattern-based optimizations
- Parallelizes independent tasks
- Caches frequently-used results
- Memory budget: 1MB (5,000 optimization suggestions)

```javascript
const { getAdaptiveExecutor } = require('.claude/lib/ml');
const executor = getAdaptiveExecutor({ maxConcurrency: 10 });
const optimizations = executor.generateOptimizations(patterns);
```

**4. Optimization Recommender (OptimizationRecommender)**

- Generates optimization recommendations
- Tracks optimization history
- Measures optimization effectiveness
- Memory budget: 500KB (bounded history)

**Feature Flags:**

All ML features are controlled by environment variables:

```bash
PATTERN_DETECTION_ENABLED=true
COST_PREDICTION_ENABLED=true
ADAPTIVE_EXECUTION_ENABLED=true
PERFORMANCE_PROFILING_ENABLED=true
PATTERN_LIBRARY_ENABLED=true
```

### Memory Management: 3-Layer Architecture

Memory management is critical to system stability. Agent-studio implements a 3-layer defense:

**Layer 1: Prevention (Bounded Collections)**

All arrays and maps have explicit size limits:

```javascript
class StateSyncManager {
  constructor(config = {}) {
    this.syncHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000;
  }

  sync(state) {
    this.syncHistory.push({ timestamp: Date.now(), state });
    // Trim after each push
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory.shift();
    }
  }
}
```

**Layer 2: Cleanup (Test Hooks and Cleanup Methods)**

All classes with state implement cleanup() methods:

```javascript
class ChaosEngineer {
  cleanup() {
    this.testResults = [];
    this.recoveryAttempts = [];
    this.injectedFaults.clear();
    this.removeAllListeners();
  }
}
```

Tests call cleanup in afterEach hooks:

```javascript
afterEach(async () => {
  if (chaos) await chaos.cleanup();
});
```

**Layer 3: Monitoring (MemoryMonitor)**

Real-time heap monitoring with threshold-based alerts:

```javascript
const { getGlobalMonitor } = require('.claude/lib/utils/memory-monitor.cjs');
const monitor = getGlobalMonitor();
monitor.start();

monitor.on('warning', data => {
  console.warn(`Memory warning: ${(data.percent * 100).toFixed(1)}%`);
});
```

**Memory Budgets by Component:**

| Component         | Budget | Enforcement              |
| ----------------- | ------ | ------------------------ |
| StateSyncManager  | 50KB   | maxHistorySize = 1000    |
| LoadTestFramework | 100KB  | MAX_METRICS = 1000       |
| ChaosEngineer     | 0KB    | cleanup() in afterEach   |
| WorkflowEngine    | 500KB  | Manual monitoring        |
| Agent Context     | 2MB    | context-compressor skill |
| Test Output       | 50MB   | Summarization            |

### Workflow Engine: State Management and Checkpoints

**Location:** `.claude/lib/workflow/workflow-engine.cjs`

The WorkflowEngine provides production-grade workflow execution:

**EVOLVE Phase Machine:**

The workflow engine implements the EVOLVE state machine:

```
E -> V -> O -> L -> V -> E
Evaluate -> Validate -> Obtain -> Lock -> Verify -> Enable
```

Valid transitions are strictly enforced:

- evaluate -> validate
- validate -> obtain
- obtain -> lock
- lock -> verify
- verify -> enable (or retry lock)
- enable -> complete

**Features:**

- YAML workflow definition parsing
- Step execution with handlers
- Gate validation for phase transitions
- Checkpoint/resume for durability
- Rollback via compensating actions
- Event-driven notifications

**Example Workflow Definition:**

```yaml
name: feature-development
version: 1.0.0

phases:
  evaluate:
    steps:
      - id: gather_requirements
        action: function
        handler: gatherRequirements
      - id: analyze_complexity
        action: function
        handler: analyzeComplexity
    gates:
      - condition: steps.gather_requirements.complete
        message: Requirements must be gathered

  validate:
    steps:
      - id: validate_requirements
        action: function
        handler: validateRequirements
```

**Checkpoint and Resume:**

```javascript
// Save checkpoint
const checkpointId = await engine.checkpoint();

// Later, resume from checkpoint
await engine.resume(checkpointId);
```

---

## Data Flow Diagrams

### User Request to Agent Spawn

```
User Request
     |
     v
+------------------+
|     ROUTER       |
| (router.md)      |
+------------------+
     |
     | 1. TaskList()
     v
+------------------+
|  TASK SYSTEM     |
| - Check existing |
| - Track progress |
+------------------+
     |
     | 2. Classify request
     v
+------------------+
|  INTENT ANALYSIS |
| - Keywords match |
| - Domain detect  |
| - Risk assess    |
+------------------+
     |
     | 3. Gate validation
     v
+------------------+
|   GATE CHECKS    |
| Gate 1: Complex? |
| Gate 2: Secure?  |
| Gate 3: Tool?    |
| Gate 4: Creator? |
+------------------+
     |
     | 4. Select agent
     v
+------------------+
|  AGENT SELECT    |
| - Match intent   |
| - Pick model     |
| - Config tools   |
+------------------+
     |
     | 5. Task(...)
     v
+------------------+
|  SPAWN AGENT     |
| - Load template  |
| - Inject context |
| - Set task ID    |
+------------------+
```

### Task Execution Flow with Monitoring

```
+------------------+
|  SPAWNED AGENT   |
+------------------+
     |
     | 1. TaskUpdate(in_progress)
     v
+------------------+
|  READ AGENT DEF  |
| (.claude/agents/)|
+------------------+
     |
     | 2. Load skills
     v
+------------------+
|  SKILL INVOKE    |
| Skill({ skill }) |
+------------------+
     |
     | 3. Execute work
     v
+------------------+          +------------------+
|  WORK EXECUTION  | -------> |  MEMORY MONITOR  |
| - Read/Write     |          | - Check heap     |
| - Edit/Bash      |          | - Emit warnings  |
| - Glob/Grep      |          | - Block if crit  |
+------------------+          +------------------+
     |
     | 4. Update on discovery
     v
+------------------+
|  TASK METADATA   |
| - discoveries[]  |
| - keyFiles[]     |
| - blockers       |
+------------------+
     |
     | 5. Complete
     v
+------------------+
| TaskUpdate       |
| (completed)      |
| - summary        |
| - filesModified  |
+------------------+
     |
     | 6. Check for more
     v
+------------------+
|  TaskList()      |
| (find unblocked) |
+------------------+
```

### ML Pipeline: Workflow to Pattern Detection

```
+------------------+
|  WORKFLOW RUN    |
| - phases[]       |
| - steps[]        |
| - duration       |
+------------------+
     |
     | After completion
     v
+------------------+
|  PATTERN RECORD  |
| _recordPattern() |
+------------------+
     |
     v
+------------------+
| PATTERN DETECTOR |
| - N-gram extract |
| - Frequency calc |
| - Support filter |
+------------------+
     |
     v
+------------------+
| PATTERN LIBRARY  |
| - LRU cache      |
| - Max 1000 items |
| - Persistence    |
+------------------+
     |
     v
+------------------+
| ADAPTIVE EXEC    |
| - Match patterns |
| - Gen optim      |
| - Apply cache    |
+------------------+
     |
     v
+------------------+
| OPTIMIZATION     |
| RECOMMENDATIONS  |
| - Parallelize    |
| - Batch tasks    |
| - Cache results  |
+------------------+
```

### Memory Monitoring and Throttling Flow

```
+------------------+
|  MEMORY MONITOR  |
| (5s interval)    |
+------------------+
     |
     | Check heap
     v
+--------------------+
| THRESHOLD CHECK    |
| warning: 70%       |
| critical: 85%      |
| shutdown: 95%      |
+--------------------+
     |
     v
+---------+---------+
|         |         |
v         v         v
<70%    70-85%    >85%
NORMAL  WARNING   CRITICAL
         |         |
         v         v
+----------+  +------------+
| Emit     |  | BLOCK      |
| warning  |  | SPAWNING   |
| event    |  | routing-   |
+----------+  | guard.cjs  |
              +------------+
                   |
                   v
              +------------+
              | Return     |
              | error to   |
              | Router     |
              +------------+
                   |
                   v
              +------------+
              | RECOVERY   |
              | - Scale    |
              | - Restart  |
              | - Rollback |
              +------------+
```

---

## Key Algorithms

### State Reconciliation: Bidirectional Sync

The StateSyncManager implements bidirectional state synchronization between distributed components.

**Algorithm:**

```javascript
async syncBidirectional(localState, remoteState) {
  // 1. Detect conflicts using vector clocks
  const conflicts = this.detectConflicts(localState, remoteState);

  // 2. For each conflict, apply resolution strategy
  for (const conflict of conflicts) {
    if (this.config.strategy === 'local-wins') {
      // Local state takes precedence
      remoteState[conflict.key] = localState[conflict.key];
    } else if (this.config.strategy === 'remote-wins') {
      // Remote state takes precedence
      localState[conflict.key] = remoteState[conflict.key];
    } else if (this.config.strategy === 'merge') {
      // Merge arrays, pick latest for scalars
      const merged = this.mergeValues(
        localState[conflict.key],
        remoteState[conflict.key]
      );
      localState[conflict.key] = merged;
      remoteState[conflict.key] = merged;
    }
  }

  // 3. Record sync in history (bounded)
  this.syncHistory.push({
    timestamp: Date.now(),
    conflicts: conflicts.length,
    resolved: true
  });

  // 4. Trim history to prevent memory leak
  if (this.syncHistory.length > this.maxHistorySize) {
    this.syncHistory.shift();
  }

  return { local: localState, remote: remoteState };
}
```

**Conflict Detection:**

Conflicts are detected by comparing vector clocks:

- If local clock > remote clock: no conflict (local is newer)
- If remote clock > local clock: no conflict (remote is newer)
- If clocks are concurrent: conflict exists

### Memory Bounding: Circular Buffer with LRU Eviction

All unbounded collections use the circular buffer pattern:

```javascript
const MAX_SIZE = 1000;

class BoundedHistory {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);

    // LRU eviction: remove oldest when over limit
    while (this.items.length > MAX_SIZE) {
      this.items.shift();
    }
  }

  // For Map-based collections, use key-based LRU
  setWithLRU(key, value) {
    // If at limit and key is new, evict oldest
    if (this.map.size >= MAX_SIZE && !this.map.has(key)) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }
}
```

### ML Pattern Detection: N-gram and Frequency Analysis

The PatternDetector identifies common task sequences using N-gram analysis:

```javascript
detectFrequentSequences(workflows, options = {}) {
  const { minSupport = 0.1, maxPatternLength = 5 } = options;

  // 1. Generate N-gram candidates
  const candidates = new Map();

  for (const workflow of workflows) {
    const tasks = workflow.steps || [];

    // Generate N-grams of length 2 to maxPatternLength
    for (let n = 2; n <= maxPatternLength; n++) {
      for (let i = 0; i <= tasks.length - n; i++) {
        const pattern = tasks.slice(i, i + n).map(t => t.type).join('->');
        candidates.set(pattern, (candidates.get(pattern) || 0) + 1);

        // Early termination to prevent memory exhaustion
        if (candidates.size > MAX_CANDIDATES) {
          break;
        }
      }
    }
  }

  // 2. Filter by support threshold
  const totalWorkflows = workflows.length;
  const frequentPatterns = [];

  for (const [pattern, count] of candidates.entries()) {
    const support = count / totalWorkflows;
    if (support >= minSupport) {
      frequentPatterns.push({ pattern, support, count });
    }
  }

  // 3. Sort by support (descending)
  frequentPatterns.sort((a, b) => b.support - a.support);

  // 4. Return bounded result
  return frequentPatterns.slice(0, MAX_RESULT_SIZE);
}
```

### Cost Prediction: Token Estimation and Model Pricing

The CostPredictor estimates LLM costs:

```javascript
estimateCost(inputTokens, outputTokens, model) {
  // Model pricing (per million tokens)
  const PRICING = {
    'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
    'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
    'claude-haiku-3-5-20241022': { input: 0.25, output: 1.25 }
  };

  const pricing = PRICING[model] || PRICING['claude-sonnet-4-20250514'];

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

estimateTokens(text, options = {}) {
  // Rough estimation: ~4 characters per token for English
  const CHARS_PER_TOKEN = 4;
  const baseTokens = Math.ceil(text.length / CHARS_PER_TOKEN);

  // Add system overhead (prompt template, context)
  if (options.includeSystemOverhead) {
    return baseTokens + 500; // ~500 tokens for system prompt
  }

  return baseTokens;
}
```

---

## Integration Points

### ML Features Integration with Workflows

The WorkflowEngine integrates ML features at three points:

**1. Pre-Execution: Cost Estimation**

```javascript
async execute(context = {}) {
  // Before running workflow
  if (this.ml.costPredictor) {
    const estimatedCost = this._estimateWorkflowCost(context);
    console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);
  }
  // ... execute workflow
}
```

**2. Post-Execution: Pattern Recording**

```javascript
// After successful completion
if (this.ml.patternDetector) {
  this._recordExecutionPattern();
}
```

**3. Post-Execution: Optimization Generation**

```javascript
if (this.ml.optimizationEngine) {
  this._generateOptimizations();
}
```

### Memory Monitoring Integration with Routing

The routing-guard hook integrates memory monitoring:

```javascript
// Check 6: Memory pressure
const { shouldPause, reason } = checkMemoryPressure();
if (shouldPause) {
  return {
    decision: 'block',
    message: `Task spawn blocked: ${reason}`,
  };
}
```

When heap exceeds 85%, new agent spawning is blocked until memory recovers.

### Orchestrator Coordination with Task System

Orchestrators use the task system for coordination:

```javascript
// 1. Create subtasks for each agent
const tasks = await Promise.all([
  TaskCreate({ subject: 'Agent A work', ... }),
  TaskCreate({ subject: 'Agent B work', ... })
]);

// 2. Set up dependencies
await TaskUpdate({ taskId: tasks[1].id, addBlockedBy: [tasks[0].id] });

// 3. Spawn agents with task IDs
await Promise.all([
  Task({ prompt: `Task ID: ${tasks[0].id}`, ... }),
  Task({ prompt: `Task ID: ${tasks[1].id}`, ... })
]);

// 4. Wait for completion and consolidate
const results = await Promise.all(
  tasks.map(t => TaskGet({ taskId: t.id }))
);
```

---

## Performance Characteristics

### Latency Targets

| Operation             | Target | Typical | Notes                |
| --------------------- | ------ | ------- | -------------------- |
| Task routing          | <5ms   | 2ms     | Router decision time |
| State sync (single)   | <100ms | 50ms    | Bidirectional sync   |
| Result normalization  | <10ms  | 5ms     | Format conversion    |
| Workflow checkpoint   | <200ms | 100ms   | Save to filesystem   |
| Agent spawn           | <500ms | 300ms   | Template load + init |
| ML Pattern Detection  | <100ms | 0.01ms  | Per workflow         |
| ML Cost Prediction    | <50ms  | 0.00ms  | Per estimation       |
| ML Adaptive Execution | <200ms | 0.001ms | Per optimization     |

### Memory Budgets

| Environment | Heap Size | Target Usage | Buffer |
| ----------- | --------- | ------------ | ------ |
| Development | 4GB       | 3GB          | 1GB    |
| Staging     | 8GB       | 6GB          | 2GB    |
| Production  | 12GB      | 10GB         | 2GB    |

**Threshold Alerts:**

- Warning: 70% heap
- Critical: 85% heap (spawn blocking)
- Shutdown: 95% heap

### Throughput Expectations

| Operation            | Target Rate | Notes                           |
| -------------------- | ----------- | ------------------------------- |
| Task creation        | 100/sec     | Peak load                       |
| Agent spawning       | 10/sec      | Prevents sync history explosion |
| State syncs          | 50/sec      | Across all orchestrators        |
| Workflow checkpoints | 20/sec      | Background saves                |

### Load Test Results (Production Validated)

- **Concurrent Workflows:** 100 sustained for 5 minutes
- **Memory Stability:** Heap <300 MB, no leaks
- **Error Rate:** 0% (target <0.5%)
- **Success Rate:** 100% (target >99.5%)
- **Recovery Time:** <5 seconds (target <30 seconds)
- **OOM Errors:** 0

---

## Quick Reference

### Directory Structure

```
.claude/
├── agents/           # Agent definitions (50+ agents)
│   ├── core/         # Essential agents
│   ├── domain/       # Language/framework experts
│   ├── specialized/  # Function-specific agents
│   └── orchestrators/# Coordination agents
├── context/          # Runtime context
│   ├── artifacts/    # Generated reports, plans
│   └── memory/       # Learnings, decisions, issues
├── docs/             # Documentation
├── hooks/            # Safety and validation hooks
├── lib/              # Core modules
│   ├── ml/           # ML platform
│   ├── workflow/     # Workflow engine
│   ├── memory/       # Memory management
│   └── utils/        # Utilities
├── schemas/          # JSON schemas
├── skills/           # Skill definitions
├── templates/        # Spawn templates
├── tools/            # CLI tools
├── workflows/        # Workflow definitions
├── CLAUDE.md         # Framework specification
├── config.yaml       # Configuration
└── settings.json     # MCP settings
```

### Key Files

| File                                       | Purpose                                   |
| ------------------------------------------ | ----------------------------------------- |
| `.claude/CLAUDE.md`                        | Framework specification (source of truth) |
| `.claude/lib/workflow/workflow-engine.cjs` | Workflow execution engine                 |
| `.claude/lib/ml/index.cjs`                 | ML platform entry point                   |
| `.claude/lib/utils/memory-monitor.cjs`     | Heap monitoring                           |
| `.claude/hooks/routing/routing-guard.cjs`  | Routing enforcement                       |
| `.claude/docs/MEMORY_MANAGEMENT.md`        | Memory patterns guide                     |
| `.claude/docs/MONITORING_RUNBOOK.md`       | Operations runbook                        |

### Environment Variables

```bash
# Environment
AGENT_STUDIO_ENV=development|staging|production

# ML Features
PATTERN_DETECTION_ENABLED=true|false
COST_PREDICTION_ENABLED=true|false
ADAPTIVE_EXECUTION_ENABLED=true|false

# Memory Thresholds
HEAP_WARNING_THRESHOLD=70
HEAP_CRITICAL_THRESHOLD=85

# Enforcement
PLANNER_FIRST_ENFORCEMENT=block|warn|off
CREATOR_GUARD=block|warn|off
```

---

**Document Version:** 1.0.0
**Last Updated:** 2026-01-30
**Maintainer:** Technical Writing Team
