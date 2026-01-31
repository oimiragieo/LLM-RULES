# Phase 3 Performance Roadmap: Profiling & Optimization

**Document ID**: `phase-3-performance-roadmap`
**Created**: 2026-01-29
**Author**: PLANNER Agent (Task #17)
**Purpose**: Establish performance baselines, identify bottlenecks, set optimization targets

---

## Current Performance Baselines (Phase 2 Completion)

### Track Analytics (SPEC-008)

| Metric                              | Value           | Measurement Method     | Date       |
| ----------------------------------- | --------------- | ---------------------- | ---------- |
| Schema validation                   | <1ms per object | 1000 iterations, avg   | 2026-01-29 |
| queryByPhase (1000 tracks)          | <100ms          | Single query benchmark | 2026-01-29 |
| computeProjectMetrics (1000 tracks) | <200ms          | Single call benchmark  | 2026-01-29 |
| generateReport (1000 tracks)        | <500ms          | Full report generation | 2026-01-29 |
| Memory (1000 tracks)                | ~45MB           | heap snapshot          | 2026-01-29 |

**Assessment**: All targets met. Excellent foundation for scale testing.

### Workflow State Checkpointing (SPEC-003)

| Metric                    | Value | Measurement Method    | Date       |
| ------------------------- | ----- | --------------------- | ---------- |
| State save (atomic write) | ~80ms | Per-phase measurement | 2026-01-30 |
| State load                | ~15ms | Single load benchmark | 2026-01-30 |
| Resume detection          | ~5ms  | canResume() call      | 2026-01-30 |
| State cleanup             | ~3ms  | unlink operation      | 2026-01-30 |

**Assessment**: Save slightly high, investigate atomic write overhead.

### Git Notes Audit (SPEC-002)

| Metric                | Value                 | Measurement Method  | Date       |
| --------------------- | --------------------- | ------------------- | ---------- |
| Note attachment       | ~45ms                 | Per-commit overhead | 2026-01-29 |
| Verification (single) | ~30ms                 | Hash computation    | 2026-01-29 |
| Verification (range)  | ~150ms for 10 commits | Range verification  | 2026-01-29 |
| CLI report generation | ~500ms for 50 commits | Full audit report   | 2026-01-29 |

**Assessment**: Within targets. Monitor at scale.

### Brownfield Detection (SPEC-005)

| Metric                          | Value  | Measurement Method   | Date       |
| ------------------------------- | ------ | -------------------- | ---------- |
| Package.json parse              | ~5ms   | Single file          | 2026-01-30 |
| Requirements.txt parse          | ~3ms   | Single file          | 2026-01-30 |
| Full detection (Node project)   | ~150ms | Tech stack analyzer  | 2026-01-30 |
| Full detection (Python project) | ~180ms | Tech stack analyzer  | 2026-01-30 |
| Monorepo detection              | ~500ms | 5 package.json files | 2026-01-30 |

**Assessment**: Good performance. Monorepo needs optimization for larger codebases.

### Progressive Disclosure v2 (SPEC-009)

| Metric                     | Value               | Measurement Method | Date       |
| -------------------------- | ------------------- | ------------------ | ---------- |
| Context accumulation       | ~50ms               | Full context load  | 2026-01-30 |
| Inference evaluation       | ~10ms per question  | skipIfInferred()   | 2026-01-30 |
| Memory load (learnings.md) | ~30ms               | File read + parse  | 2026-01-30 |
| Total question flow        | ~300ms per question | End-to-end         | 2026-01-30 |

**Assessment**: Good baseline. Total flow could be faster with caching.

---

## Phase 3 Performance Targets

### Tier 1: Critical Path (Must Meet)

| Component         | Metric                           | Target       | Current | Gap     |
| ----------------- | -------------------------------- | ------------ | ------- | ------- |
| Track Analytics   | 10,000 tracks query              | <2s          | Unknown | Measure |
| Workflow State    | Parallel save (10 workflows)     | <500ms total | Unknown | Measure |
| Git Notes         | Range verification (100 commits) | <1s          | Unknown | Measure |
| Memory            | Steady state (10,000 tracks)     | <200MB       | Unknown | Measure |
| Integration Tests | Full suite                       | <5 minutes   | Unknown | Measure |

### Tier 2: Important (Should Meet)

| Component  | Metric                       | Target | Current | Gap     |
| ---------- | ---------------------------- | ------ | ------- | ------- |
| Brownfield | Large project (50,000 files) | <60s   | Unknown | Measure |
| Adaptive   | Context accumulation         | <100ms | ~50ms   | Met     |
| Dashboard  | Render cycle                 | <100ms | N/A     | New     |
| Migration  | State transform              | <10s   | N/A     | New     |

### Tier 3: Aspirational (Nice to Have)

| Component | Metric               | Target         | Current | Gap |
| --------- | -------------------- | -------------- | ------- | --- |
| Analytics | Report caching       | <50ms (cached) | N/A     | New |
| Workflow  | Transaction rollback | <100ms         | N/A     | New |
| Git Notes | Async attachment     | 0ms blocking   | ~45ms   | New |

---

## Identified Bottlenecks (Phase 2 Analysis)

### Bottleneck 1: Workflow State Atomic Write

**Component**: SPEC-003 WorkflowStateManager
**Metric**: 80ms per state save
**Target**: <50ms

**Analysis**:

- Current implementation uses synchronous fs.writeFileSync
- Atomic write library adds ~30ms overhead for temp file + rename
- JSON.stringify adds ~5ms for large state objects

**Proposed Optimizations**:

1. **Incremental State Save**: Only write changed fields (delta compression)
2. **Async Write with Callback**: Non-blocking write with completion callback
3. **State Batching**: Batch multiple updates before save

**Expected Improvement**: 50-70% reduction (80ms --> 25-40ms)

**Implementation Priority**: HIGH (affects all workflows)

### Bottleneck 2: Track Metadata File I/O

**Component**: SPEC-007, SPEC-008 track metadata queries
**Metric**: ~2ms per file read
**Target**: <0.5ms with caching

**Analysis**:

- Each query reads all metadata files from disk
- No caching layer between queries
- File system calls dominate query time

**Proposed Optimizations**:

1. **In-Memory Cache**: Cache metadata objects after first read
2. **Cache Invalidation**: Invalidate on write/edit operations
3. **Lazy Loading**: Load metadata on demand, not all at once

**Expected Improvement**: 80-90% reduction for repeated queries

**Implementation Priority**: HIGH (analytics critical path)

### Bottleneck 3: Git Notes Verification Hash

**Component**: SPEC-002 verification
**Metric**: ~30ms per commit verification
**Target**: <10ms

**Analysis**:

- SHA-256 computation is fast (~1ms)
- Git notes fetch adds ~25ms per commit
- Sequential verification (no parallelism)

**Proposed Optimizations**:

1. **Batch Notes Fetch**: Fetch all notes in range with single git command
2. **Parallel Verification**: Verify multiple commits in parallel
3. **Hash Caching**: Cache computed hashes for unchanged commits

**Expected Improvement**: 60-70% reduction for range verification

**Implementation Priority**: MEDIUM (affects audit reports)

### Bottleneck 4: Context Accumulation

**Component**: SPEC-009 adaptive questioning
**Metric**: ~50ms for full context
**Target**: <20ms

**Analysis**:

- Reads multiple files (tech-stack.md, learnings.md, session state)
- No combined cache for context sources
- Repeated reads within same session

**Proposed Optimizations**:

1. **Session Context Cache**: Cache accumulated context for session duration
2. **Lazy Source Loading**: Only load sources when needed
3. **Priority Sorting**: Load high-priority sources first

**Expected Improvement**: 60-80% reduction with caching

**Implementation Priority**: MEDIUM (affects user experience)

### Bottleneck 5: Monorepo Detection

**Component**: SPEC-005 brownfield detection
**Metric**: ~100ms per package.json
**Target**: <20ms per file with parallel processing

**Analysis**:

- Sequential file traversal
- Full parsing even for simple detection
- No early termination when confident

**Proposed Optimizations**:

1. **Parallel File Processing**: Process package files in parallel
2. **Quick Detection Mode**: Stop when confidence > 0.95
3. **Manifest Caching**: Cache parsed manifests for session

**Expected Improvement**: 50-70% reduction for monorepos

**Implementation Priority**: LOW (affects onboarding only)

---

## Performance Profiling Methodology

### Profiling Tools

| Tool                  | Purpose         | Usage                  |
| --------------------- | --------------- | ---------------------- |
| Node.js --inspect     | CPU profiling   | Identify hot functions |
| process.memoryUsage() | Memory tracking | Detect leaks           |
| performance.now()     | Timing          | Micro-benchmarks       |
| clinic.js             | Full analysis   | Production profiling   |
| node --trace-gc       | GC analysis     | Memory optimization    |

### Benchmark Harness

```javascript
// .claude/tools/cli/performance-benchmark.cjs

const { performance } = require('perf_hooks');

class Benchmark {
  constructor(name) {
    this.name = name;
    this.samples = [];
  }

  async run(fn, iterations = 100) {
    // Warmup
    for (let i = 0; i < 10; i++) await fn();

    // Measure
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      this.samples.push(end - start);
    }

    return this.stats();
  }

  stats() {
    const sorted = this.samples.sort((a, b) => a - b);
    return {
      name: this.name,
      iterations: this.samples.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      mean: this.samples.reduce((a, b) => a + b, 0) / this.samples.length,
    };
  }
}

module.exports = { Benchmark };
```

### Memory Profiling

```javascript
// .claude/tools/cli/memory-profile.cjs

function measureMemory(fn, label) {
  global.gc && global.gc(); // Force GC before measurement
  const before = process.memoryUsage().heapUsed;

  fn();

  global.gc && global.gc(); // Force GC after measurement
  const after = process.memoryUsage().heapUsed;

  return {
    label,
    before: `${Math.round(before / 1024 / 1024)}MB`,
    after: `${Math.round(after / 1024 / 1024)}MB`,
    delta: `${Math.round((after - before) / 1024 / 1024)}MB`,
  };
}

async function trackMemoryOverTime(fn, intervalMs = 1000, durationMs = 60000) {
  const snapshots = [];

  const interval = setInterval(() => {
    snapshots.push({
      timestamp: Date.now(),
      heapUsed: process.memoryUsage().heapUsed,
      heapTotal: process.memoryUsage().heapTotal,
      external: process.memoryUsage().external,
    });
  }, intervalMs);

  await fn();

  clearInterval(interval);
  return snapshots;
}

module.exports = { measureMemory, trackMemoryOverTime };
```

---

## Optimization Implementation Plan

### Phase 3 Week 1: Profiling

**Day 1-2: Establish Baselines**

- [ ] Run full benchmark suite against Phase 2 code
- [ ] Document all baseline metrics
- [ ] Identify top 5 hotspots

**Day 3-4: Scale Testing**

- [ ] Generate 10,000 track test data
- [ ] Profile at scale
- [ ] Identify scale-specific bottlenecks

**Day 5: Memory Profiling**

- [ ] Run memory leak detection
- [ ] Profile GC behavior
- [ ] Document memory characteristics

### Phase 3 Week 2: Optimization

**Day 1-2: Track Metadata Caching**

- [ ] Implement in-memory cache
- [ ] Add cache invalidation
- [ ] Benchmark improvement

**Day 3: Workflow State Optimization**

- [ ] Implement incremental save
- [ ] Test async write option
- [ ] Benchmark improvement

**Day 4: Git Notes Batching**

- [ ] Implement batch fetch
- [ ] Add parallel verification
- [ ] Benchmark improvement

**Day 5: Context Caching**

- [ ] Implement session cache
- [ ] Add lazy loading
- [ ] Benchmark improvement

### Phase 3 Week 3: Validation

**Day 1-2: Regression Testing**

- [ ] Verify all tests pass with optimizations
- [ ] Compare before/after benchmarks
- [ ] Document improvements

**Day 3: Documentation**

- [ ] Update performance documentation
- [ ] Create optimization guide
- [ ] Set up monitoring

---

## Performance Test Suite

### Test Categories

#### 1. Unit Performance Tests

**File**: `tests/performance/unit-benchmarks.test.cjs`

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { Benchmark } = require('../.claude/tools/cli/performance-benchmark.cjs');

describe('Track Analytics Performance', () => {
  it('queryByPhase should complete in <100ms for 1000 tracks', async () => {
    const benchmark = new Benchmark('queryByPhase-1000');
    const tracks = generateTracks(1000);

    const stats = await benchmark.run(() => queryByPhase('phase-1', tracks));

    assert(stats.p95 < 100, `p95 (${stats.p95}ms) exceeds 100ms target`);
  });

  it('computeProjectMetrics should complete in <200ms for 1000 tracks', async () => {
    const benchmark = new Benchmark('computeMetrics-1000');
    const tracks = generateTracks(1000);

    const stats = await benchmark.run(() => computeProjectMetrics(tracks));

    assert(stats.p95 < 200, `p95 (${stats.p95}ms) exceeds 200ms target`);
  });

  it('generateReport should complete in <500ms for 1000 tracks', async () => {
    const benchmark = new Benchmark('generateReport-1000');
    const tracks = generateTracks(1000);

    const stats = await benchmark.run(() => generateReport(tracks));

    assert(stats.p95 < 500, `p95 (${stats.p95}ms) exceeds 500ms target`);
  });
});
```

#### 2. Scale Performance Tests

**File**: `tests/performance/scale-benchmarks.test.cjs`

```javascript
describe('Scale Performance', () => {
  it('should handle 10,000 tracks with <200MB memory', async () => {
    const tracks = generateTracks(10000);

    global.gc && global.gc();
    const memBefore = process.memoryUsage().heapUsed;

    await computeProjectMetrics(tracks);

    global.gc && global.gc();
    const memAfter = process.memoryUsage().heapUsed;
    const memDelta = memAfter - memBefore;

    assert(
      memDelta < 200 * 1024 * 1024,
      `Memory delta (${Math.round(memDelta / 1024 / 1024)}MB) exceeds 200MB`
    );
  });

  it('should query 10,000 tracks in <2s', async () => {
    const benchmark = new Benchmark('query-10000');
    const tracks = generateTracks(10000);

    const stats = await benchmark.run(() => queryByStatus('completed', tracks), 10);

    assert(stats.p95 < 2000, `p95 (${stats.p95}ms) exceeds 2000ms target`);
  });
});
```

#### 3. Stress Performance Tests

**File**: `tests/performance/stress-benchmarks.test.cjs`

```javascript
describe('Stress Performance', () => {
  it('should handle 100 concurrent state saves', async () => {
    const workflows = Array(100)
      .fill(0)
      .map((_, i) => new WorkflowStateManager(`workflow-${i}`));

    const start = performance.now();
    await Promise.all(workflows.map(wf => wf.save({ phase: 1, status: 'in_progress' })));
    const elapsed = performance.now() - start;

    assert(elapsed < 500, `Concurrent saves took ${elapsed}ms (target: <500ms)`);
  });

  it('should handle rapid state updates without corruption', async () => {
    const wf = new WorkflowStateManager('rapid-test');

    for (let i = 0; i < 1000; i++) {
      await wf.save({ iteration: i, data: `test-${i}` });
    }

    const final = await wf.load();
    assert.strictEqual(final.iteration, 999);
    assert.strictEqual(final.data, 'test-999');
  });
});
```

#### 4. Memory Leak Tests

**File**: `tests/performance/memory-leak.test.cjs`

```javascript
describe('Memory Leak Detection', () => {
  it('should not leak memory over 1000 analytics cycles', async () => {
    const snapshots = [];

    for (let cycle = 0; cycle < 1000; cycle++) {
      const tracks = generateTracks(100);
      await computeProjectMetrics(tracks);
      await generateReport(tracks);

      if (cycle % 100 === 0) {
        global.gc && global.gc();
        snapshots.push({
          cycle,
          heap: process.memoryUsage().heapUsed,
        });
      }
    }

    // Check heap growth is <10% across cycles
    const firstHeap = snapshots[0].heap;
    const lastHeap = snapshots[snapshots.length - 1].heap;
    const growth = (lastHeap - firstHeap) / firstHeap;

    assert(growth < 0.1, `Memory grew by ${Math.round(growth * 100)}% (target: <10%)`);
  });
});
```

---

## Performance Monitoring (Production)

### Metrics to Track

| Metric               | Collection Method     | Alert Threshold |
| -------------------- | --------------------- | --------------- |
| Analytics query time | Instrumentation       | >1s             |
| State save time      | Instrumentation       | >200ms          |
| Memory usage         | process.memoryUsage() | >250MB          |
| GC pause time        | --trace-gc            | >100ms          |
| Error rate           | Error counter         | >5%             |

### Monitoring Implementation

```javascript
// .claude/lib/monitoring/performance-tracker.cjs

class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
  }

  track(name, fn) {
    return async (...args) => {
      const start = performance.now();
      try {
        return await fn(...args);
      } finally {
        const elapsed = performance.now() - start;
        this.record(name, elapsed);
      }
    };
  }

  record(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    const samples = this.metrics.get(name);
    samples.push({ timestamp: Date.now(), value });

    // Keep last 1000 samples
    if (samples.length > 1000) samples.shift();
  }

  getStats(name) {
    const samples = this.metrics.get(name) || [];
    if (samples.length === 0) return null;

    const values = samples.map(s => s.value).sort((a, b) => a - b);
    return {
      count: values.length,
      min: values[0],
      max: values[values.length - 1],
      median: values[Math.floor(values.length / 2)],
      p95: values[Math.floor(values.length * 0.95)],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
    };
  }

  report() {
    const report = {};
    for (const [name, _] of this.metrics) {
      report[name] = this.getStats(name);
    }
    return report;
  }
}

module.exports = { PerformanceTracker };
```

### Dashboard Integration

```javascript
// Add to SPEC-016 monitoring dashboard

function renderPerformanceView(tracker) {
  const report = tracker.report();

  console.log('+----------------------------------------------------------+');
  console.log('| PERFORMANCE METRICS                                       |');
  console.log('+----------------------------------------------------------+');
  console.log('| Metric            | p95     | mean    | Status           |');
  console.log('|-------------------|---------|---------|------------------|');

  for (const [name, stats] of Object.entries(report)) {
    const status = getStatus(name, stats.p95);
    console.log(
      `| ${name.padEnd(17)} | ${stats.p95.toFixed(0).padStart(5)}ms | ${stats.mean.toFixed(0).padStart(5)}ms | ${status.padEnd(16)} |`
    );
  }

  console.log('+----------------------------------------------------------+');
}

function getStatus(name, p95) {
  const thresholds = {
    'analytics-query': 500,
    'state-save': 100,
    'git-notes': 50,
    'context-load': 100,
  };

  const threshold = thresholds[name] || 1000;
  if (p95 < threshold * 0.5) return 'EXCELLENT';
  if (p95 < threshold) return 'OK';
  if (p95 < threshold * 1.5) return 'WARNING';
  return 'CRITICAL';
}
```

---

## Success Metrics

### Phase 3 Performance Goals

| Goal                            | Target                         | Measurement     |
| ------------------------------- | ------------------------------ | --------------- |
| Track analytics at 10,000 scale | <2s query, <200MB memory       | Benchmark suite |
| Workflow state parallel saves   | <500ms for 10 workflows        | Stress test     |
| Git notes batch verification    | <1s for 100 commits            | Benchmark       |
| Memory stability                | <10% growth over 1000 cycles   | Leak test       |
| Performance monitoring          | Real-time tracking operational | Dashboard       |

### Optimization Success Criteria

| Bottleneck           | Before       | Target           | Achieved |
| -------------------- | ------------ | ---------------- | -------- |
| State atomic write   | 80ms         | <50ms            | TBD      |
| Track metadata query | ~2ms/file    | <0.5ms (cached)  | TBD      |
| Git notes verify     | ~30ms/commit | <10ms            | TBD      |
| Context accumulation | ~50ms        | <20ms            | TBD      |
| Monorepo detection   | ~100ms/file  | <20ms (parallel) | TBD      |

---

## Risk Mitigation

### Performance Regression Risk

**Detection**: Automated benchmark suite in CI
**Mitigation**: Block merge if p95 regresses >10%
**Rollback**: Feature flag to disable optimization

### Memory Leak Risk

**Detection**: Memory leak tests with --expose-gc
**Mitigation**: Bounded caches with LRU eviction
**Rollback**: Disable caching, return to direct file I/O

### Optimization Complexity Risk

**Detection**: Code review for optimization PRs
**Mitigation**: Keep original code path behind feature flag
**Rollback**: Disable optimization, use original implementation

---

**End of Phase 3 Performance Roadmap**

Generated by: PLANNER Agent
Task ID: 17
Date: 2026-01-29
Location: C:\dev\projects\agent-studio\.claude\context\plans\phase-3-performance-roadmap.md
