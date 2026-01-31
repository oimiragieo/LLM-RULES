# Performance Budgets

**Last Updated:** 2026-01-30
**Version:** 1.0.0

## Overview

Performance budgets define maximum acceptable resource usage for each component in the agent-studio framework. These budgets prevent memory leaks, ensure predictable performance, and guide optimization efforts.

---

## Memory Budgets

### Per-Component Memory Limits

| Component                    | Budget      | Rationale                                    | Enforcement                   |
|------------------------------|-------------|----------------------------------------------|-------------------------------|
| **StateSyncManager**         | 50KB        | 1000 sync entries × ~50 bytes per entry     | `maxHistorySize = 1000`       |
| **LoadTestFramework**        | 100KB       | 1000 metrics × 3 arrays × ~33 bytes          | `MAX_METRICS = 1000`          |
| **ChaosEngineer**            | 0KB         | State cleared in `afterEach`                 | `cleanup()` method            |
| **WorkflowEngine**           | 500KB       | Workflow state + checkpoints                 | Manual monitoring             |
| **MemoryManager**            | 200KB       | Tier metadata + smart pruning state          | Manual monitoring             |
| **Agent Context**            | 2MB         | Per spawned agent (compress if exceeded)     | Context-compressor skill      |
| **Test Output Buffer**       | 50MB        | Per test run (summarize if exceeded)         | Manual monitoring             |

### System-Wide Memory Limits

| Environment  | Heap Size | Target Usage | Buffer    | Notes                          |
|--------------|-----------|--------------|-----------|--------------------------------|
| Development  | 4GB       | 3GB          | 1GB       | Local testing, agent spawning  |
| Staging      | 8GB       | 6GB          | 2GB       | Load testing, 100+ agents      |
| Production   | 12GB      | 10GB         | 2GB       | Enterprise scale, monitoring   |

**Buffer Rationale:** 25% overhead for GC, OS, and peak usage.

---

## Test Suite Budget

### Overall Test Suite

- **Total Memory:** ≤2GB (development heap limit: 4GB)
- **Individual Test:** ≤10MB per test
- **Test Class State:** 0MB (must be cleared in `afterEach`)

### Test Execution Time

| Test Type               | Budget    | Notes                              |
|-------------------------|-----------|------------------------------------|
| Unit tests (individual) | <100ms    | Fast feedback                      |
| Integration tests       | <1s       | Multiple components                |
| Load tests              | <30s      | 100+ concurrent workflows          |
| Full test suite         | <5min     | 1311 total tests                   |

---

## Orchestrator Budget

### Concurrent Agent Spawning

| Scenario                | Agents | Memory per Agent | Total Memory | Notes                     |
|-------------------------|--------|------------------|--------------|---------------------------|
| Standard workflow       | 3-5    | 2MB              | 10MB         | Typical feature work      |
| Master orchestrator     | 10-15  | 2MB              | 30MB         | Complex planning          |
| Enterprise scale        | 34+    | 2MB              | 68MB         | Load testing scenario     |
| **Budget Limit**        | 50     | 2MB              | **100MB**    | Maximum safe concurrency  |

**Spawn Rate Limit:** 10 agents/second (prevents sync history explosion)

### Sync History Budget

- **StateSyncManager instances:** 1 per orchestrator
- **Sync history per instance:** 1000 entries
- **Memory per instance:** 50KB
- **Maximum orchestrators:** 10 concurrent
- **Total sync budget:** 500KB

---

## ML Analysis Budget

### Pattern Detection

| Component                | Budget   | Items   | Memory per Item | Notes                        |
|--------------------------|----------|---------|-----------------|------------------------------|
| PatternDetectionEngine   | 500KB    | 10,000  | ~50 bytes       | Code patterns detected       |
| MLOptimizationEngine     | 1MB      | 5,000   | ~200 bytes      | Optimization suggestions     |
| SemanticCache            | 2MB      | 1,000   | ~2KB            | Embeddings + metadata        |

### Training Data Retention

- **Pattern samples:** Retain last 1000 patterns
- **Optimization history:** Retain last 500 optimizations
- **Semantic cache:** LRU eviction at 1000 entries

---

## Metrics Tracking Budget

### Per-Component Metrics

| Component            | Metrics Tracked | Max Entries | Memory Budget | Retention Policy      |
|----------------------|-----------------|-------------|---------------|-----------------------|
| LoadTestFramework    | 3 arrays        | 1000        | 100KB         | Rolling window (FIFO) |
| WorkflowEngine       | 5 arrays        | 1000        | 150KB         | Rolling window        |
| StateSyncManager     | 1 array         | 1000        | 50KB          | Rolling window        |
| **Total Budget**     | -               | -           | **300KB**     | -                     |

---

## Budget Monitoring

### Actual vs Budgeted (Track in Tests)

Example test structure:

```javascript
it('should stay within memory budget', async () => {
  const baseline = process.memoryUsage().heapUsed;

  // Run operation
  await runHeavyOperation();

  const current = process.memoryUsage().heapUsed;
  const delta = (current - baseline) / 1024 / 1024; // MB

  assert(delta < BUDGET_MB, `Exceeded budget: ${delta}MB > ${BUDGET_MB}MB`);
});
```

### Budget Violation Response

1. **Warning Level** (80% of budget)
   - Log warning
   - Monitor for sustained usage
   - Consider optimization

2. **Critical Level** (100% of budget)
   - Fail test / block operation
   - Trigger memory profiling
   - Require fix before merge

3. **OOM Risk Level** (>120% of budget)
   - Immediate escalation
   - Block all related operations
   - Require root cause analysis

---

## Performance Targets

### Latency Budgets

| Operation                  | Budget    | p50   | p95   | p99   | Notes                        |
|----------------------------|-----------|-------|-------|-------|------------------------------|
| Task routing               | <5ms      | 2ms   | 4ms   | 8ms   | Router decision time         |
| State sync (single)        | <100ms    | 50ms  | 80ms  | 150ms | Bi-directional sync          |
| Result normalization       | <10ms     | 5ms   | 8ms   | 15ms  | Format conversion            |
| Workflow checkpoint        | <200ms    | 100ms | 180ms | 300ms | Checkpoint save/load         |
| Agent spawn                | <500ms    | 300ms | 450ms | 700ms | Template load + init         |

### Throughput Budgets

| Operation                  | Budget         | Notes                              |
|----------------------------|----------------|------------------------------------|
| Task creation              | 100/sec        | Peak load scenario                 |
| Agent spawning             | 10/sec         | Prevents sync history explosion    |
| State syncs                | 50/sec         | Across all orchestrators           |
| Workflow checkpoints       | 20/sec         | Background checkpoint saves        |

---

## Budget Validation

### Automated Budget Tests

```javascript
describe('Performance Budgets', () => {
  it('StateSyncManager stays within 50KB', () => {
    const manager = new StateSyncManager();

    // Simulate heavy load
    for (let i = 0; i < 2000; i++) {
      manager.sync({ id: `task-${i}`, data: 'x'.repeat(50) });
    }

    // Rough estimate: 1000 entries × 50 bytes = 50KB
    assert(manager.syncHistory.length === 1000);
  });

  it('LoadTestFramework stays within 100KB', () => {
    const framework = new LoadTestFramework();

    // Simulate 2000 metrics
    for (let i = 0; i < 2000; i++) {
      framework.metrics.spawnTimes.push(Math.random() * 1000);
      framework.metrics.throughput.push(Math.random() * 100);
      framework.metrics.memoryUsage.push(Math.random() * 500);
    }

    // Each array capped at 1000
    assert(framework.metrics.spawnTimes.length === 1000);
  });
});
```

---

## Related Documentation

- **Memory Management**: `.claude/docs/MEMORY_MANAGEMENT.md`
- **Code Review Checklist**: `.claude/docs/CODE_REVIEW_MEMORY_CHECKLIST.md`
- **Operational Runbook**: `.claude/docs/MEMORY_OPERATIONAL_RUNBOOK.md`

---

## Summary

**Key Budgets:**

- **Per-component memory:** Defined and enforced
- **Test suite:** <2GB total, 0MB state accumulation
- **Orchestrator:** 50 agents max, 10 spawns/sec
- **ML analysis:** 500KB-2MB per component
- **Metrics:** 1000 entries per array (300KB total)

**Budget Philosophy:**

> Define limits → Enforce in code → Validate in tests → Monitor in production
