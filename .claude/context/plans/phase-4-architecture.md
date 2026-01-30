# Phase 4 Architecture Document: Advanced Workflow Features & Legacy Migration

**Document ID**: `phase-4-architecture`
**Created**: 2026-01-30
**Author**: PLANNER Agent (Task #24)
**Status**: DESIGN COMPLETE
**Version**: 1.0

---

## 1. Executive Summary

This document describes the architecture for Phase 4 features, explaining how advanced workflow orchestration, composition, hybrid execution, versioning, legacy integration, and performance optimization integrate with the existing Phase 0-3 foundation.

### Key Architectural Decisions

1. **Pattern-Based Orchestration**: Adopt proven patterns (fan-out/fan-in, saga, strangler fig) rather than custom solutions
2. **Composition Over Configuration**: Enable workflow reuse through composition, not duplication
3. **Backward Compatibility First**: All new features are additive; existing workflows unchanged
4. **Performance by Default**: Lazy loading and caching enabled by default, opt-out available

---

## 2. Phase 3 Foundation Integration

### 2.1 Building on SPEC-011 (Workflow State Machine Enhancements)

**What SPEC-011 Provides**:
- Transaction support (begin/commit/rollback)
- Parallel phase support (fork/join)
- Nested workflow references (parentId/childIds)

**How Phase 4 Extends It**:

```
SPEC-011 (Foundation)          SPEC-017 (Extension)
+-- beginTransaction()    -->  +-- Pattern-aware transactions
+-- forkState()           -->  +-- Fan-out with strategies
+-- joinState()           -->  +-- Collection strategies (all/any/majority)
+-- waitForChildren()     -->  +-- Conditional branching
                               +-- Loop patterns with checkpointing
```

**Integration Points**:
```javascript
// SPEC-017 uses SPEC-011 transaction support
const fanOut = async (tasks, options) => {
  const transaction = await stateManager.beginTransaction();
  try {
    const results = await Promise.all(tasks.map(t => executeTask(t)));
    const collected = collect(results, options.strategy);
    await transaction.commit();
    return collected;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
```

### 2.2 Building on SPEC-015 (Conductor-Main Integration)

**What SPEC-015 Provides**:
- Migration assessment tool
- State format migration script
- Validation test framework

**How Phase 4 Extends It**:

```
SPEC-015 (Foundation)              SPEC-019 (Extension)
+-- conductor-migration-assess.cjs --> +-- hybrid mode assessment
+-- state-migration script         --> +-- bi-directional sync
+-- validation tests               --> +-- hybrid execution tests
```

**Hybrid Execution Flow**:
```
Request arrives
     |
     v
[Routing Rules Evaluation]
     |
     +-- Rule: "legacy/*" --> conductor-main adapter
     |                             |
     |                             v
     |                        Execute in conductor-main
     |                             |
     |                             v
     |                        Sync state back
     |
     +-- Rule: "new/*"   --> agent-studio adapter
                               |
                               v
                          Execute in Agent-Studio
```

### 2.3 Building on SPEC-013 (Performance Profiling)

**What SPEC-013 Provides**:
- Performance benchmarks
- Bottleneck detection
- Baseline measurements

**How Phase 4 Extends It**:

```
SPEC-013 (Foundation)              SPEC-022 (Extension)
+-- Performance profiler      -->  +-- Lazy loading optimizations
+-- Bottleneck analyzer       -->  +-- Cache hit/miss tracking
+-- Optimization targets      -->  +-- Streaming for large results
```

---

## 3. Advanced Workflow Orchestration Design (SPEC-017)

### 3.1 Fan-Out/Fan-In Pattern

**Problem**: Execute N tasks in parallel and collect results

**Architecture**:
```
                    ┌── Task A ──┐
                    │            │
Input ──> Splitter ─┼── Task B ──┼─> Collector ──> Result
                    │            │
                    └── Task C ──┘
```

**Collection Strategies**:

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `all` | Wait for all, fail if any fails | Critical path tasks |
| `any` | Return first success, cancel others | Racing multiple approaches |
| `majority` | Wait for >50% to succeed | Voting/consensus |
| `quorum(n)` | Wait for n successes | Distributed agreement |

**Implementation**:
```javascript
class FanOutPattern {
  async execute(tasks, options) {
    const { strategy = 'all', timeout = 30000, failurePolicy = 'fail-fast' } = options;

    const promises = tasks.map(task => this.executeWithTimeout(task, timeout));

    switch (strategy) {
      case 'all':
        return Promise.all(promises);
      case 'any':
        return Promise.race(promises.map(p => p.catch(e => e)));
      case 'majority':
        return this.waitForMajority(promises);
      case 'quorum':
        return this.waitForQuorum(promises, options.quorumCount);
    }
  }

  async waitForMajority(promises) {
    const needed = Math.ceil(promises.length / 2);
    const results = [];

    for await (const result of this.settledIterator(promises)) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        if (results.length >= needed) return results;
      }
    }
    throw new Error('Could not achieve majority');
  }
}
```

### 3.2 Conditional Branching

**Problem**: Execute different paths based on runtime conditions

**Architecture**:
```
                    ┌── Then Branch ──┐
                    │                 │
Condition ──> When ─┤                 ├─> Continue
   (expr)           │                 │
                    └── Else Branch ──┘
```

**Condition Evaluators**:

| Evaluator | Syntax | Example |
|-----------|--------|---------|
| JavaScript | `(ctx) => expr` | `(ctx) => ctx.result.score > 0.8` |
| JSONPath | `$.path.to.value` | `$.result.status === 'approved'` |
| Simple | `key operator value` | `result.count > 10` |

**Implementation**:
```javascript
class ConditionalBranching {
  constructor() {
    this.evaluators = {
      // Use safe expression evaluator library (e.g., expr-eval)
      javascript: (expr, ctx) => this.safeEval(expr, ctx),
      jsonpath: (expr, ctx) => jp.query(ctx, expr)[0],
      simple: (expr, ctx) => this.parseSimple(expr, ctx)
    };
  }

  safeEval(expr, ctx) {
    // SECURITY: Use safe expression evaluator library (expr-eval, mathjs) for dynamic expressions
    // const evaluator = new ExpressionEvaluator(expr);
    // return evaluator.evaluate(ctx);
    throw new Error('Implement with safe expression evaluator library');
  }

  async when(condition, thenBranch, elseBranch, context) {
    const result = await this.evaluate(condition, context);

    if (result) {
      return this.executeBranch(thenBranch, context);
    } else if (elseBranch) {
      return this.executeBranch(elseBranch, context);
    }
    return null;
  }

  async switch(value, cases, defaultCase, context) {
    for (const [caseValue, branch] of Object.entries(cases)) {
      if (value === caseValue) {
        return this.executeBranch(branch, context);
      }
    }
    return defaultCase ? this.executeBranch(defaultCase, context) : null;
  }
}
```

### 3.3 Loop Patterns

**Problem**: Execute tasks repeatedly with controlled iteration

**Architecture**:
```
                    ┌─────────────────────┐
                    │                     │
                    ▼                     │
Start ──> [Condition] ──> Body ──> Update ┘
               │
               ▼ (false)
             Continue
```

**Loop Types**:

| Type | Description | Max Iterations |
|------|-------------|----------------|
| `forEach` | Iterate over collection | Collection size |
| `doWhile` | Loop until condition false | Required |
| `retryUntil` | Retry until success | Required |

**Implementation**:
```javascript
class LoopPatterns {
  async forEach(items, task, options = {}) {
    const { parallel = false, maxConcurrency = 10 } = options;

    if (parallel) {
      return this.parallelForEach(items, task, maxConcurrency);
    }

    const results = [];
    for (const item of items) {
      const result = await this.executeTask(task, { item });
      results.push(result);
      await this.checkpoint({ completed: results.length, total: items.length });
    }
    return results;
  }

  async doWhile(condition, task, maxIterations) {
    if (!maxIterations) {
      throw new Error('maxIterations required to prevent infinite loops');
    }

    let iterations = 0;
    let result;

    do {
      result = await this.executeTask(task, { iteration: iterations });
      iterations++;
      await this.checkpoint({ iteration: iterations, lastResult: result });
    } while (
      await this.evaluateCondition(condition, { result, iterations }) &&
      iterations < maxIterations
    );

    return { result, iterations };
  }

  async retryUntil(successCondition, task, maxRetries, options = {}) {
    const { backoff = 'exponential', initialDelay = 1000 } = options;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.executeTask(task, { attempt });
        if (await this.evaluateCondition(successCondition, { result })) {
          return { success: true, result, attempts: attempt + 1 };
        }
      } catch (error) {
        // Retry on error
      }

      const delay = this.calculateDelay(backoff, initialDelay, attempt);
      await this.sleep(delay);
    }

    return { success: false, attempts: maxRetries };
  }
}
```

---

## 4. Workflow Composition Design (SPEC-018)

### 4.1 Composition Model

**Problem**: Build complex workflows from simpler, reusable components

**Architecture**:
```
┌─────────────────────────────────────────────────┐
│  Composed Workflow                               │
│  ┌───────────────┐  ┌───────────────┐           │
│  │ Base Workflow │  │ Included      │           │
│  │ (inherited)   │  │ Sub-workflow  │           │
│  │               │  │               │           │
│  │ Phase 1 ─────────> [Override]    │           │
│  │ Phase 2       │  │               │           │
│  │ Phase 3 ─────────> [Insert Sub]  │           │
│  └───────────────┘  └───────────────┘           │
└─────────────────────────────────────────────────┘
```

### 4.2 Composition Operations

**Include**: Insert a sub-workflow at a specific point
```yaml
workflow:
  name: feature-with-security
  phases:
    - name: planning
      tasks: [...]
    - include: security-review-workflow  # Insert entire workflow
    - name: implementation
      tasks: [...]
```

**Extend**: Inherit from base workflow with overrides
```yaml
workflow:
  name: feature-with-testing
  extends: feature-development-workflow
  overrides:
    phase2:
      add:
        - task: integration-tests
          after: unit-tests
      remove:
        - task: manual-testing  # Replaced by automated
```

**Compose**: Combine multiple workflows
```yaml
workflow:
  name: complete-feature
  compose:
    strategy: sequential  # or 'parallel', 'conditional'
    workflows:
      - feature-development-workflow
      - qa-workflow
      - deployment-workflow
```

### 4.3 Cycle Detection

**Problem**: Prevent circular references in workflow composition

**Solution**: DFS-based cycle detection

```javascript
class WorkflowResolver {
  detectCycles(workflowId, visited = new Set(), stack = new Set()) {
    if (stack.has(workflowId)) {
      throw new Error(`Circular dependency detected: ${[...stack, workflowId].join(' -> ')}`);
    }

    if (visited.has(workflowId)) {
      return; // Already validated
    }

    visited.add(workflowId);
    stack.add(workflowId);

    const workflow = this.load(workflowId);

    for (const dependency of this.getDependencies(workflow)) {
      this.detectCycles(dependency, visited, stack);
    }

    stack.delete(workflowId);
  }

  getDependencies(workflow) {
    const deps = [];
    if (workflow.extends) deps.push(workflow.extends);
    if (workflow.includes) deps.push(...workflow.includes.map(i => i.workflow));
    if (workflow.compose) deps.push(...workflow.compose.workflows);
    return deps;
  }
}
```

### 4.4 Hierarchy Flattening

**Problem**: Convert composed workflow to flat, executable form

**Process**:
```
1. Load workflow definition
2. Resolve all includes (recursive)
3. Apply inheritance (merge base with overrides)
4. Apply composition (combine workflows)
5. Validate phase order and dependencies
6. Return flattened workflow
```

```javascript
class WorkflowComposer {
  async flatten(workflowId) {
    const workflow = await this.resolve(workflowId);
    const flattened = { phases: [] };

    // Handle inheritance
    if (workflow.extends) {
      const base = await this.flatten(workflow.extends);
      flattened.phases = [...base.phases];
      this.applyOverrides(flattened, workflow.overrides);
    }

    // Handle includes
    for (const phase of workflow.phases || []) {
      if (phase.include) {
        const subWorkflow = await this.flatten(phase.include);
        flattened.phases.push(...subWorkflow.phases);
      } else {
        flattened.phases.push(phase);
      }
    }

    // Validate and return
    this.validate(flattened);
    return flattened;
  }
}
```

---

## 5. Hybrid Execution Design (SPEC-019)

### 5.1 Hybrid Executor Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Hybrid Executor                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Router    │  │    Sync     │  │  Normalizer │     │
│  │  (rules)    │  │  (state)    │  │  (results)  │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
└─────────┼────────────────┼────────────────┼─────────────┘
          │                │                │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
    │ conductor │◄───│   State   │───►│  Agent    │
    │   -main   │    │   Store   │    │  Studio   │
    └───────────┘    └───────────┘    └───────────┘
```

### 5.2 Routing Rules

**Configuration Format**:
```yaml
hybrid_execution:
  enabled: true
  default_system: agent-studio
  routing_rules:
    # Pattern-based routing
    - pattern: "legacy/authentication/*"
      system: conductor-main
      reason: "Auth still being migrated"

    # Feature flag routing
    - feature_flag: "new-checkout"
      percentage: 25
      system: agent-studio
      fallback: conductor-main

    # Time-based routing (canary)
    - pattern: "checkout/*"
      system: agent-studio
      schedule:
        start: "02:00"
        end: "06:00"
        timezone: "UTC"
```

### 5.3 State Synchronization

**Bi-directional Sync Protocol**:

```
Agent-Studio                    Conductor-Main
     │                               │
     │  ─── Task Started ───────>    │
     │                               │
     │  <── State Checkpoint ────    │
     │                               │
     │  ─── Progress Update ────>    │
     │                               │
     │  <── Task Completed ──────    │
     │                               │
     │  ─── Sync Acknowledgment ─>   │
     │                               │
```

**Conflict Resolution**:
```javascript
class StateSync {
  async sync(taskId) {
    const localState = await this.getLocalState(taskId);
    const remoteState = await this.getRemoteState(taskId);

    if (!localState || !remoteState) {
      return localState || remoteState;
    }

    // Last-write-wins with vector clock
    if (localState.vectorClock > remoteState.vectorClock) {
      await this.pushToRemote(taskId, localState);
      return localState;
    } else if (remoteState.vectorClock > localState.vectorClock) {
      await this.updateLocal(taskId, remoteState);
      return remoteState;
    } else {
      // Concurrent updates - merge
      return this.mergeStates(localState, remoteState);
    }
  }

  mergeStates(local, remote) {
    // Field-level merge with conflict markers
    const merged = { ...local };
    for (const [key, value] of Object.entries(remote)) {
      if (local[key] !== value) {
        if (this.isConflict(key, local[key], value)) {
          merged[`${key}_conflict`] = {
            local: local[key],
            remote: value,
            resolvedAt: null
          };
        } else {
          merged[key] = this.mergeField(key, local[key], value);
        }
      }
    }
    return merged;
  }
}
```

---

## 6. Workflow Versioning Design (SPEC-020)

### 6.1 Version Registry

**Storage Format**:
```
.claude/workflows/
├── feature-development/
│   ├── v1.0.0/
│   │   ├── workflow.md
│   │   └── metadata.json
│   ├── v2.0.0/
│   │   ├── workflow.md
│   │   ├── metadata.json
│   │   └── migrations/
│   │       └── from-1.0.cjs
│   └── active -> v2.0.0  (symlink)
```

**Metadata Schema**:
```json
{
  "workflowId": "feature-development",
  "version": "2.0.0",
  "semver": {
    "major": 2,
    "minor": 0,
    "patch": 0
  },
  "minCompatibleVersion": "1.0.0",
  "created": "2026-01-30T10:00:00Z",
  "author": "planner-agent",
  "status": "active",
  "changelog": [
    "Added security review phase (Phase 2.5)",
    "Renamed 'testing' phase to 'quality-assurance'",
    "BREAKING: Removed deprecated 'manual-review' task"
  ],
  "migrations": [
    {
      "from": "1.x.x",
      "to": "2.0.0",
      "script": "migrations/from-1.0.cjs"
    }
  ]
}
```

### 6.2 Migration Engine

**Migration Script Structure**:
```javascript
// migrations/from-1.0.cjs
module.exports = {
  version: '2.0.0',
  fromVersionPattern: '1.x.x',

  async migrate(state) {
    const migrated = { ...state };

    // Rename phase
    if (migrated.phases.testing) {
      migrated.phases['quality-assurance'] = migrated.phases.testing;
      delete migrated.phases.testing;
    }

    // Add new phase with default state
    migrated.phases['security-review'] = {
      status: 'pending',
      startedAt: null,
      completedAt: null
    };

    // Update version
    migrated.workflowVersion = '2.0.0';

    return migrated;
  },

  async validate(state) {
    const errors = [];

    if (!state.phases['quality-assurance']) {
      errors.push('Missing quality-assurance phase');
    }
    if (!state.phases['security-review']) {
      errors.push('Missing security-review phase');
    }

    return { valid: errors.length === 0, errors };
  },

  async rollback(state) {
    const rolledBack = { ...state };

    // Reverse the migration
    if (rolledBack.phases['quality-assurance']) {
      rolledBack.phases.testing = rolledBack.phases['quality-assurance'];
      delete rolledBack.phases['quality-assurance'];
    }
    delete rolledBack.phases['security-review'];

    rolledBack.workflowVersion = '1.0.0';

    return rolledBack;
  }
};
```

### 6.3 Blue-Green Deployment

**Deployment Flow**:
```
1. Deploy new version (green) alongside current (blue)
2. Route percentage of traffic to green (start: 10%)
3. Monitor metrics (error rate, latency, completion rate)
4. If metrics healthy, increase percentage (10% -> 50% -> 100%)
5. If metrics degrade, rollback to blue
6. Once 100% on green, retire blue
```

**Implementation**:
```javascript
class BlueGreenDeployer {
  constructor(versionManager) {
    this.versionManager = versionManager;
  }

  async deploy(workflowId, newVersion, options = {}) {
    const { startPercentage = 10, monitoringPeriod = 3600000 } = options;

    // Step 1: Install new version
    await this.versionManager.createVersion(workflowId, newVersion);

    // Step 2: Set up routing
    await this.setRouting(workflowId, {
      blue: this.versionManager.getActive(workflowId),
      green: newVersion,
      greenPercentage: startPercentage
    });

    // Step 3: Start monitoring
    const monitor = this.startMonitoring(workflowId, {
      successThreshold: 0.99,
      latencyThreshold: 1000,
      period: monitoringPeriod
    });

    return { deployment: 'in-progress', monitor };
  }

  async rampUp(workflowId, targetPercentage) {
    const metrics = await this.getMetrics(workflowId);

    if (metrics.errorRate > 0.01 || metrics.p99Latency > 1000) {
      throw new Error('Metrics unhealthy, cannot ramp up');
    }

    await this.setRouting(workflowId, {
      greenPercentage: targetPercentage
    });
  }

  async rollback(workflowId) {
    await this.setRouting(workflowId, {
      greenPercentage: 0
    });

    // Log rollback
    await this.versionManager.recordRollback(workflowId, {
      reason: 'metrics-degradation',
      timestamp: new Date().toISOString()
    });
  }
}
```

---

## 7. Legacy Adapter Design (SPEC-021)

### 7.1 Strangler Fig Pattern

**Concept**: Gradually replace legacy system components while maintaining compatibility

```
┌─────────────────────────────────────────────────────────┐
│                    Adapter Facade                        │
│                                                         │
│   Request ───> [Feature Toggle] ───> Legacy System      │
│                       │                                 │
│                       ▼ (when enabled)                  │
│                    New System                           │
│                       │                                 │
│                       ▼ (on error)                      │
│                 Fallback to Legacy                      │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Adapter Implementation

```javascript
class LegacyAdapter {
  constructor(legacyFn, newFn, options = {}) {
    this.legacyFn = legacyFn;
    this.newFn = newFn;
    this.options = {
      featureFlag: null,
      percentage: 0,
      fallbackOnError: true,
      metrics: true,
      ...options
    };
  }

  async execute(...args) {
    const useNew = this.shouldUseNew();
    const startTime = Date.now();

    try {
      if (useNew) {
        const result = await this.newFn(...args);
        this.recordMetrics('new', Date.now() - startTime, true);
        return result;
      } else {
        const result = await this.legacyFn(...args);
        this.recordMetrics('legacy', Date.now() - startTime, true);
        return result;
      }
    } catch (error) {
      this.recordMetrics(useNew ? 'new' : 'legacy', Date.now() - startTime, false);

      if (useNew && this.options.fallbackOnError) {
        // Try legacy as fallback
        const fallbackStart = Date.now();
        const result = await this.legacyFn(...args);
        this.recordMetrics('fallback', Date.now() - fallbackStart, true);
        return result;
      }

      throw error;
    }
  }

  shouldUseNew() {
    if (this.options.featureFlag) {
      return this.isFeatureEnabled(this.options.featureFlag);
    }
    if (this.options.percentage > 0) {
      return Math.random() * 100 < this.options.percentage;
    }
    return false;
  }
}
```

### 7.3 Gradual Rollout

```javascript
class FeatureToggle {
  constructor() {
    this.toggles = new Map();
  }

  async rampUp(feature, targetPercentage, duration) {
    const current = this.getPercentage(feature);
    const steps = 10;
    const increment = (targetPercentage - current) / steps;
    const interval = duration / steps;

    for (let i = 0; i < steps; i++) {
      await this.sleep(interval);
      this.setPercentage(feature, current + increment * (i + 1));

      // Check health before continuing
      const healthy = await this.checkHealth(feature);
      if (!healthy) {
        await this.rollback(feature, current);
        throw new Error(`Health check failed at ${this.getPercentage(feature)}%`);
      }
    }
  }

  async rollback(feature, targetPercentage = 0) {
    this.setPercentage(feature, targetPercentage);
    await this.notifyRollback(feature);
  }
}
```

---

## 8. Performance Optimization Design (SPEC-022)

### 8.1 Lazy Loading Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Lazy Loader                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Loader    │  │   Cache     │  │  Prefetch   │     │
│  │  (on-demand)│  │  (LRU)      │  │  (predict)  │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
└─────────┼────────────────┼────────────────┼─────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────┐
│                   Workflow Store                         │
│  [Phase 1] [Phase 2] [Phase 3] ... [Phase N]            │
│     │                                                    │
│     └── Only loaded sections are in memory              │
└─────────────────────────────────────────────────────────┘
```

### 8.2 Caching Strategy

**Cache Layers**:
1. **L1 (Memory)**: Recently accessed workflows (LRU, 100 items)
2. **L2 (File)**: Parsed workflow definitions (JSON cache)
3. **L3 (Computed)**: Flattened/resolved workflows

**Cache Invalidation**:
```javascript
class CacheManager {
  constructor(options = {}) {
    this.l1 = new LRUCache({ max: options.l1Size || 100 });
    this.l2Path = options.l2Path || '.claude/cache/workflows';
  }

  async get(key) {
    // Try L1
    if (this.l1.has(key)) {
      return this.l1.get(key);
    }

    // Try L2
    const l2Value = await this.getFromL2(key);
    if (l2Value) {
      this.l1.set(key, l2Value);
      return l2Value;
    }

    return null;
  }

  async set(key, value, options = {}) {
    const { ttl = 3600000, persist = true } = options;

    this.l1.set(key, value, { ttl });

    if (persist) {
      await this.setToL2(key, value);
    }
  }

  invalidate(pattern) {
    // Pattern-based invalidation
    const regex = new RegExp(pattern);

    for (const key of this.l1.keys()) {
      if (regex.test(key)) {
        this.l1.delete(key);
      }
    }

    // Also invalidate L2
    this.invalidateL2(pattern);
  }
}
```

### 8.3 Result Streaming

**Problem**: Analytics queries returning 10,000+ results

**Solution**: Transform API to streams

```javascript
class StreamProcessor {
  streamResults(query, options = {}) {
    const { chunkSize = 100 } = options;

    return new Readable({
      objectMode: true,
      async read() {
        const chunk = await query.getNext(chunkSize);

        if (chunk.length === 0) {
          this.push(null); // End of stream
          return;
        }

        for (const item of chunk) {
          this.push(item);
        }
      }
    });
  }

  transformStream(stream, transformer) {
    return stream.pipe(new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        try {
          const transformed = transformer(chunk);
          callback(null, transformed);
        } catch (error) {
          callback(error);
        }
      }
    }));
  }
}

// Usage
const results = streamProcessor.streamResults(analyticsQuery);
const filtered = streamProcessor.transformStream(results, r => r.status === 'completed');

for await (const result of filtered) {
  // Process one at a time, constant memory
}
```

### 8.4 Memory Budget Enforcement

```javascript
class MemoryBudgetEnforcer {
  constructor(options = {}) {
    this.budget = options.budget || 200 * 1024 * 1024; // 200MB default
    this.warningThreshold = 0.8;
    this.criticalThreshold = 0.95;
  }

  async checkBudget() {
    const usage = process.memoryUsage().heapUsed;
    const percentage = usage / this.budget;

    if (percentage >= this.criticalThreshold) {
      await this.emergencyCleanup();
      throw new Error(`Memory critical: ${Math.round(percentage * 100)}% of budget`);
    }

    if (percentage >= this.warningThreshold) {
      await this.proactiveCleanup();
      this.emitWarning(percentage);
    }

    return { usage, budget: this.budget, percentage };
  }

  async emergencyCleanup() {
    // Clear all caches
    cacheManager.clear();

    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    // Compress inactive workflow states
    await workflowStateManager.compressInactive();
  }

  async proactiveCleanup() {
    // Evict least recently used cache entries
    cacheManager.evict(0.2); // Remove 20%

    // Compress old workflow states
    await workflowStateManager.compressOlderThan(3600000); // 1 hour
  }
}
```

---

## 9. Integration Matrix

### Phase 4 Feature Integration

| Feature | SPEC-017 | SPEC-018 | SPEC-019 | SPEC-020 | SPEC-021 | SPEC-022 |
|---------|----------|----------|----------|----------|----------|----------|
| **SPEC-017** | - | Uses patterns in composed workflows | N/A | Versioned patterns | N/A | Patterns optimized |
| **SPEC-018** | Composition uses patterns | - | Composed hybrid workflows | Versioned compositions | N/A | Lazy load compositions |
| **SPEC-019** | N/A | Hybrid composed workflows | - | Version-aware routing | Uses adapters | Optimized sync |
| **SPEC-020** | Versioned patterns | Versioned compositions | Version-aware routing | - | Versioned adapters | Cached versions |
| **SPEC-021** | N/A | N/A | Uses adapters | Versioned adapters | - | Adapter metrics cached |
| **SPEC-022** | Patterns optimized | Lazy load compositions | Optimized sync | Cached versions | Adapter metrics cached | - |

---

## 10. API Summary

### New Public APIs

```javascript
// SPEC-017: Advanced Patterns
const patterns = require('.claude/lib/workflow/workflow-patterns.cjs');
patterns.fanOut(tasks, { strategy: 'majority' });
patterns.when(condition, thenBranch, elseBranch);
patterns.doWhile(condition, task, maxIterations);

// SPEC-018: Composition
const composer = require('.claude/lib/workflow/workflow-composer.cjs');
composer.include(workflowPath);
composer.extend(baseWorkflow, overrides);
composer.flatten(workflowId);

// SPEC-019: Hybrid Execution
const hybrid = require('.claude/lib/workflow/hybrid-executor.cjs');
hybrid.execute(task);
hybrid.sync(taskId);

// SPEC-020: Versioning
const versions = require('.claude/lib/workflow/workflow-versioning.cjs');
versions.create(workflowId, version);
versions.migrate(state, fromVersion, toVersion);
versions.blueGreen.deploy(workflowId, newVersion);

// SPEC-021: Legacy Adapters
const adapter = require('.claude/lib/integration/legacy-adapter.cjs');
const wrapped = adapter.wrap(legacyFn, newFn, { percentage: 25 });
await wrapped.execute(...args);

// SPEC-022: Performance
const optimizer = require('.claude/lib/workflow/workflow-optimizer.cjs');
optimizer.lazyLoad(workflowPath, sections);
optimizer.cache.get(key);
optimizer.stream(query);
```

---

## 11. Backwards Compatibility

### Guarantees

1. **Existing workflows unchanged**: All Phase 0-3 workflows continue to work
2. **No required migrations**: New features are opt-in
3. **Default behavior preserved**: Without new configuration, behavior is identical
4. **API stability**: Existing APIs remain stable

### Deprecation Path

If any existing APIs are deprecated:
1. Mark as `@deprecated` with version
2. Log warning on first use
3. Maintain for 2 major versions minimum
4. Document migration path

---

**End of Phase 4 Architecture Document**

Generated by: PLANNER Agent
Task ID: 24
Date: 2026-01-30
Location: C:\dev\projects\agent-studio\.claude\context\plans\phase-4-architecture.md
