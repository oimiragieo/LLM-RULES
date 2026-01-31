# Memory Management Guide

**Last Updated:** 2026-01-30
**Version:** 1.1.0

## Overview

This guide documents memory management best practices, common leak patterns, and prevention strategies for the agent-studio framework. It consolidates learnings from heap out-of-memory (OOM) incidents and provides practical guidance for developers.

### What is Heap Out of Memory (OOM)?

Node.js applications run in a V8 JavaScript engine with a limited heap size. When memory usage exceeds this limit, the process crashes with:

```
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

### Why It Happened

Root causes of memory leaks in agent-studio:

1. **Unbounded Array Growth**: Arrays accumulating data without size limits
2. **Missing Cleanup**: Test classes not clearing state between tests
3. **Long-Running Operations**: Metrics/history accumulating during load tests
4. **Agent Spawning**: 34+ concurrent agents accumulating sync history

### How We Prevented It

Four safeguards implemented:

1. **Bounded Collections**: All arrays have max size limits (1000 entries default)
2. **Automatic Trimming**: After each push, trim to max size
3. **Test Cleanup**: `afterEach` hooks clear test state
4. **Memory Budgets**: Per-component memory limits defined

---

## Memory Limits by Environment

```bash
# Development (default)
NODE_OPTIONS="--max-old-space-size=4096"  # 4GB

# Staging
NODE_OPTIONS="--max-old-space-size=8192"  # 8GB

# Production
NODE_OPTIONS="--max-old-space-size=12288" # 12GB
```

**Setting in package.json:**

```json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--max-old-space-size=4096' node index.js",
    "test": "NODE_OPTIONS='--max-old-space-size=4096' node --test tests/**/*.test.{cjs,mjs}",
    "prod": "NODE_OPTIONS='--max-old-space-size=12288' node index.js"
  }
}
```

---

## Common Leak Patterns and Fixes

### Pattern 1: Unbounded Array Growth

**Symptom:** Array grows indefinitely during long operations

**Bad Code:**

```javascript
class StateSyncManager {
  constructor() {
    this.syncHistory = []; // UNBOUNDED
  }

  sync(state) {
    this.syncHistory.push({ timestamp: Date.now(), state }); // LEAK
  }
}
```

**Fix: Add Max Size + Automatic Trimming**

```javascript
class StateSyncManager {
  constructor(config = {}) {
    this.syncHistory = [];
    this.maxHistorySize = config.maxHistorySize || 1000; // BOUNDED
  }

  sync(state) {
    this.syncHistory.push({ timestamp: Date.now(), state });

    // TRIM after each push
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory.shift(); // Remove oldest
    }
  }
}
```

**Real Example: StateSyncManager**

- **Issue:** `syncHistory` accumulated 34,000 entries during 34 agent spawns
- **Impact:** ~1.7MB unbounded growth → heap OOM
- **Fix:** Added max size (1000) + trimming at 4 locations
- **Result:** 97% memory reduction (~50KB bounded)

### Pattern 2: Metrics Accumulation

**Symptom:** Metrics arrays grow during load testing (1000s of iterations)

**Bad Code:**

```javascript
class LoadTestFramework {
  constructor() {
    this.metrics = {
      spawnTimes: [],   // UNBOUNDED
      throughput: [],   // UNBOUNDED
      memoryUsage: []   // UNBOUNDED
    };
  }

  recordMetric(type, value) {
    this.metrics[type].push(value); // LEAK
  }
}
```

**Fix: Bounded Metrics with Helper**

```javascript
const MAX_METRICS = 1000;

class LoadTestFramework {
  constructor() {
    this.metrics = {
      spawnTimes: [],
      throughput: [],
      memoryUsage: []
    };
  }

  _boundMetricsArray(arrayName) {
    if (this.metrics[arrayName].length > MAX_METRICS) {
      this.metrics[arrayName].shift(); // Remove oldest
    }
  }

  recordMetric(type, value) {
    this.metrics[type].push(value);
    this._boundMetricsArray(type); // TRIM
  }
}
```

**Real Example: LoadTestFramework**

- **Issue:** 2000 workflows × ~30KB per metric = ~60MB unbounded
- **Impact:** Potential heap OOM during enterprise-scale testing
- **Fix:** MAX_METRICS constant + automatic trimming
- **Result:** Bounded at 1000 entries regardless of iteration count

### Pattern 3: Missing Test Cleanup

**Symptom:** Test class state accumulates across 20+ test runs

**Bad Code:**

```javascript
describe('Chaos Engineering', () => {
  let chaos;

  beforeEach(() => {
    chaos = new ChaosEngineer();
  });

  // NO afterEach cleanup - STATE LEAKS

  it('test 1', () => { /* chaos.testResults grows */ });
  it('test 2', () => { /* chaos.testResults grows */ });
  // ... 20 more tests = 20x accumulation
});
```

**Fix: Add afterEach Cleanup**

```javascript
describe('Chaos Engineering', () => {
  let chaos;

  beforeEach(() => {
    chaos = new ChaosEngineer();
  });

  afterEach(async () => {
    if (chaos) await chaos.cleanup(); // CLEAR STATE
  });

  it('test 1', () => { /* clean state */ });
  it('test 2', () => { /* clean state */ });
});
```

**Real Example: ChaosEngineer**

- **Issue:** `testResults` and `recoveryAttempts` accumulated across 1311 tests
- **Impact:** ~26MB memory growth over full test suite
- **Fix:** Added `afterEach` cleanup hook
- **Result:** State cleared after each test

### Pattern 4: Event Listener Leaks

**Symptom:** Event listeners not removed, holding references

**Bad Code:**

```javascript
class Workflow {
  start() {
    process.on('SIGINT', this.cleanup.bind(this)); // LEAK
    // Listener never removed
  }
}
```

**Fix: Remove Listeners on Cleanup**

```javascript
class Workflow {
  constructor() {
    this.cleanupHandler = this.cleanup.bind(this);
  }

  start() {
    process.on('SIGINT', this.cleanupHandler);
  }

  cleanup() {
    process.removeListener('SIGINT', this.cleanupHandler); // REMOVE
  }
}
```

---

## Memory Performance Budgets

| Component              | Max Memory | Notes                                    |
|------------------------|------------|------------------------------------------|
| **Task Spawn Rate**    | 10/second  | Prevents sync history explosion          |
| **Heap Growth**        | 5MB/sec    | During normal operations                 |
| **Agent Context**      | 2MB        | Per agent (use context-compressor if exceeded) |
| **Test Output**        | 50MB       | Per test run (use summarization)         |
| **Metrics Arrays**     | 1000 entries | All history/metrics arrays             |
| **Sync History**       | 1000 entries | Per manager instance                   |
| **Test Class State**   | 0 MB       | Must be cleared in `afterEach`           |

---

## Monitoring and Diagnostics

### Enable Garbage Collection Logs

```bash
# Show GC activity
NODE_OPTIONS="--trace-gc" node index.js

# Show heap snapshots on OOM
NODE_OPTIONS="--heapsnapshot-on-oom" node index.js
```

### Use Chrome DevTools for Profiling

```bash
# Enable inspector
node --inspect index.js

# Open chrome://inspect in Chrome
# Click "inspect" to open DevTools
# Go to Memory tab → Take heap snapshot
```

### Interpret GC Logs

```
[12345:0x5a8f000]    12345 ms: Scavenge 123.4 (145.6) -> 98.7 (145.6) MB, 2.3 / 0.0 ms
```

- **Scavenge**: Minor GC (young generation)
- **123.4**: Heap before GC (MB)
- **98.7**: Heap after GC (MB)
- **2.3 ms**: GC duration

**Warning Signs:**

- Heap size continuously increasing
- GC running frequently (every second)
- Large GC pauses (>100ms)

### Memory Profiling Commands

```bash
# Profile memory during test
NODE_OPTIONS="--trace-gc --max-old-space-size=4096" npm test

# Generate heap snapshot
node --expose-gc --inspect-brk index.js
# In DevTools: Trigger GC → Take snapshot → Compare snapshots
```

---

## Incident Response

### What to Do If Heap OOM Occurs

1. **Capture Error Details**
   - Note exact error message
   - Record heap size at crash
   - Save any heap snapshots generated

2. **Identify Memory Hog**
   ```bash
   # Enable heap profiling
   NODE_OPTIONS="--max-old-space-size=4096 --trace-gc --heapsnapshot-on-oom" npm test

   # Analyze heap snapshot (generated at crash)
   # Look for large arrays, retained closures
   ```

3. **Debug Commands**
   ```bash
   # Run single failing test with memory tracking
   node --trace-gc --max-old-space-size=2048 --test tests/failing-test.cjs

   # Check for memory leaks in specific file
   node --inspect --trace-gc .claude/lib/workflow/state-sync-manager.cjs
   ```

4. **Memory Profiling Steps**
   - Take baseline heap snapshot (before operation)
   - Run problematic code
   - Take second heap snapshot (after operation)
   - Compare snapshots in Chrome DevTools
   - Identify objects that grew unexpectedly

5. **Report Issue**
   - Create issue with heap snapshots
   - Include GC logs
   - Document reproduction steps
   - Tag with `memory-leak` label

---

## Prevention Checklist for New Code

### ✅ Use Bounded Collections

```javascript
// ❌ BAD
this.history = [];
this.history.push(data); // Unbounded

// ✅ GOOD
this.history = [];
this.maxHistory = 1000;
this.history.push(data);
if (this.history.length > this.maxHistory) {
  this.history.shift();
}
```

### ✅ Add Cleanup Methods

```javascript
class MyClass {
  constructor() {
    this.data = [];
    this.listeners = new Map();
  }

  // ✅ REQUIRED: cleanup method
  async cleanup() {
    this.data = [];
    this.listeners.clear();
    // Remove event listeners
    // Close file handles
    // Clear timers/intervals
  }
}
```

### ✅ Call Cleanup in Tests

```javascript
describe('MyClass', () => {
  let instance;

  beforeEach(() => {
    instance = new MyClass();
  });

  // ✅ REQUIRED: afterEach cleanup
  afterEach(async () => {
    if (instance) await instance.cleanup();
  });

  it('test', () => {
    // test logic
  });
});
```

### ✅ Monitor Memory During Development

```bash
# Run tests with memory monitoring
NODE_OPTIONS="--trace-gc --max-old-space-size=2048" npm test

# Watch for:
# - Heap size increasing continuously
# - GC running frequently
# - Large retained objects in heap snapshots
```

---

## TDD for Memory Leaks

Follow RED-GREEN-REFACTOR for memory leak fixes:

### RED: Write Failing Test

```javascript
it('should prevent memory leak in sync history', () => {
  const manager = new StateSyncManager();

  // Simulate 2000 syncs (would leak without fix)
  for (let i = 0; i < 2000; i++) {
    manager.sync({ id: `task-${i}` });
  }

  // Should be bounded to 1000
  assert(manager.syncHistory.length <= 1000,
    `Expected ≤1000, got ${manager.syncHistory.length}`);
});
```

### GREEN: Implement Fix

```javascript
class StateSyncManager {
  constructor() {
    this.maxHistorySize = 1000; // Add limit
  }

  sync(state) {
    this.syncHistory.push(state);

    // Trim to max size
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory.shift();
    }
  }
}
```

### REFACTOR: Verify All Tests Pass

```bash
npm test
# Verify: Original test passes + new regression test passes
```

---

---

## Real-Time Memory Monitoring

### MemoryMonitor Class

The `MemoryMonitor` class provides real-time heap monitoring with threshold-based event emission.

**Location:** `.claude/lib/utils/memory-monitor.cjs`

#### Features

- Configurable warning, critical, and shutdown thresholds
- Event-based notification system (warning, critical, recovery)
- Memory history tracking for trend analysis
- Statistics calculation (min, max, avg, trend)
- Integration with routing-guard for spawn throttling

#### Basic Usage

```javascript
const MemoryMonitor = require('./.claude/lib/utils/memory-monitor.cjs');

const monitor = new MemoryMonitor({
  warningThreshold: 0.70,  // 70%
  criticalThreshold: 0.85, // 85%
  shutdownThreshold: 0.95, // 95%
  interval: 5000,          // 5 seconds
});

monitor.on('warning', (data) => {
  console.warn(`Memory warning: ${(data.percent * 100).toFixed(1)}%`);
});

monitor.on('critical', (data) => {
  console.error(`Memory critical: ${data.level} - ${data.message}`);
});

monitor.on('recovery', (data) => {
  console.log(`Memory recovered from ${data.previousLevel}`);
});

monitor.start();
// ... later ...
monitor.stop();
```

#### Global Singleton

For framework-wide monitoring, use the singleton pattern:

```javascript
const { getGlobalMonitor } = require('./.claude/lib/utils/memory-monitor.cjs');

const monitor = getGlobalMonitor();
monitor.start();

// Check spawn feasibility
const { shouldPause, reason, stats } = monitor.shouldPauseSpawning();
if (shouldPause) {
  console.warn(`Cannot spawn: ${reason}`);
}
```

#### Event Reference

| Event    | When Fired                           | Data Fields                                  |
|----------|--------------------------------------|----------------------------------------------|
| check    | Every monitoring interval            | timestamp, heapUsed, heapLimit, heapPercent  |
| warning  | Heap exceeds warning threshold       | level, percent, heapUsedMB, message, entry   |
| critical | Heap exceeds critical/shutdown       | level, percent, heapUsedMB, message, entry   |
| recovery | Heap drops below warning threshold   | previousLevel, percent, message, entry       |

---

### Spawn Throttling Integration

The routing-guard hook includes a memory pressure check (Check 6) that automatically blocks `Task` tool invocations when heap usage exceeds the critical threshold.

**Location:** `.claude/hooks/routing/routing-guard.cjs`

#### Behavior

1. Before each Task spawn, `checkMemoryPressure()` is called
2. If heap > critical threshold (85%), spawn is blocked
3. If heap > warning threshold (70%) with increasing trend, spawn is blocked
4. User receives detailed error message with recovery actions
5. Audit log records the block event

#### Configuration

```bash
# Enable/disable spawn throttling (default: true)
MEMORY_SPAWN_THROTTLING=true

# Adjust thresholds
HEAP_WARNING_THRESHOLD=70
HEAP_CRITICAL_THRESHOLD=85
HEAP_SHUTDOWN_THRESHOLD=95
```

---

### TaskCleanupManager Class

Automatically cleans up completed and stale tasks to prevent memory leaks during long-running sessions.

**Location:** `.claude/lib/workflow/task-cleanup-manager.cjs`

#### Features

- Configurable retention period for completed tasks
- Batch cleanup to avoid memory churn
- Safe cleanup (never removes in-progress tasks)
- Integration with external task systems
- Event emission for cleanup operations

#### Basic Usage

```javascript
const TaskCleanupManager = require('./.claude/lib/workflow/task-cleanup-manager.cjs');

const manager = new TaskCleanupManager({
  retentionMs: 30 * 60 * 1000, // 30 minutes
  interval: 60 * 1000,          // 1 minute
  batchSize: 100,
});

manager.on('cleanup', (result) => {
  console.log(`Cleaned up ${result.count} tasks`);
});

manager.start();
```

#### Configuration Environment Variables

| Variable                    | Default  | Description                              |
| --------------------------- | -------- | ---------------------------------------- |
| `TASK_CLEANUP_RETENTION_MS` | 1800000  | Retention period (30 min)                |
| `TASK_CLEANUP_INTERVAL_MS`  | 60000    | Cleanup interval (1 min)                 |
| `TASK_CLEANUP_BATCH_SIZE`   | 100      | Max tasks per cleanup                    |

---

## Environment Variables Reference

### Memory Monitoring

| Variable                     | Default  | Description                              |
| ---------------------------- | -------- | ---------------------------------------- |
| `HEAP_WARNING_THRESHOLD`     | 70       | Warning threshold (%)                    |
| `HEAP_CRITICAL_THRESHOLD`    | 85       | Critical threshold (%)                   |
| `HEAP_SHUTDOWN_THRESHOLD`    | 95       | Shutdown threshold (%)                   |
| `MEMORY_MONITOR_INTERVAL_MS` | 5000     | Monitor interval (ms)                    |
| `MEMORY_HISTORY_SIZE`        | 100      | Max history entries                      |
| `MEMORY_SPAWN_THROTTLING`    | true     | Enable spawn throttling                  |

---

## Token Budget & Memory Stats Dashboard

**CLI Tool**: `.claude/tools/cli/memory-dashboard.cjs`

The memory stats dashboard provides visual monitoring of token usage, compression events, and budget status across all agents.

### Features

1. **Overall Metrics**: Active agents, average token usage, total compressions
2. **Per-Agent Breakdown**: Token usage, budget percentage, compression count, status
3. **Compression Timeline**: Recent compression events with reasons and bytes freed
4. **Alerts**: Warnings for agents approaching token limits

### Usage

```bash
# Show latest summary (ASCII dashboard)
node .claude/tools/cli/memory-dashboard.cjs

# Export as JSON
node .claude/tools/cli/memory-dashboard.cjs --json

# Filter by specific agent
node .claude/tools/cli/memory-dashboard.cjs --agent researcher

# Time period filter (7 days)
node .claude/tools/cli/memory-dashboard.cjs --period 7d

# Export full report to file
node .claude/tools/cli/memory-dashboard.cjs --export memory-report.txt
```

### Example Output

```
╔════════════════════════════════════════════════════════════════╗
║                    MEMORY DASHBOARD SUMMARY                    ║
╚════════════════════════════════════════════════════════════════╝

📊 OVERALL METRICS
├─ Active Agents: 3
├─ Avg Token Usage: 45,000 / 200,000 (22.5%)
├─ Total Compressions: 2
└─ Memory Status: ✅ HEALTHY

🤖 PER-AGENT BREAKDOWN
├─ researcher
│  ├─ Tokens: 95,000 / 200,000 (47.5%)
│  ├─ Status: ⚠️  WARNING
│  ├─ Compressions: 2
│  └─ Last operation: Read
└─ developer
   ├─ Tokens: 42,000 / 200,000 (21.0%)
   ├─ Status: ✅ OK
   ├─ Compressions: 0
   └─ Last operation: Read

📈 COMPRESSION TIMELINE
├─ 2026-01-30 14:35 → Budget > 90% (freed: 45 KB)
└─ 2026-01-30 12:10 → Read > 10KB (10.5KB) (freed: 11 KB)

⚠️  ALERTS
└─ researcher token usage at 47.5% (approaching 50% threshold)
```

### Data Sources

The dashboard reads from three JSONL log files:

1. **Token Usage**: `.claude/context/token-usage.jsonl`
   - Tracks token consumption per agent
   - Event types: spawn, tool_result, prompt, compression, completion

2. **Compression Stats**: `.claude/context/compression-stats.jsonl`
   - Records compression events (reason, urgency, bytes freed, success)

3. **Compression Triggers**: `.claude/context/compression-triggers.jsonl`
   - Logs compression trigger events per agent

### JSON Export Format

```json
{
  "activeAgents": 3,
  "avgTokenUsage": 45000,
  "totalCompressions": 2,
  "status": "HEALTHY",
  "agents": {
    "researcher": {
      "totalTokens": 95000,
      "budget": 200000,
      "budgetPercent": 47.5,
      "status": "WARNING",
      "compressionCount": 2,
      "eventCount": 15
    }
  },
  "compressions": [
    {
      "timestamp": "2026-01-30T14:35:00.000Z",
      "reason": "Budget > 90%",
      "urgency": "high",
      "bytesFreed": 45000,
      "success": true
    }
  ]
}
```

### Best Practices

**1. Regular Monitoring**

```bash
# Daily review
node .claude/tools/cli/memory-dashboard.cjs --period 1d

# Weekly summary
node .claude/tools/cli/memory-dashboard.cjs --period 7d --export weekly-report.txt
```

**2. Pre-Deployment Checks**

```bash
# Before spawning complex workflows
node .claude/tools/cli/memory-dashboard.cjs --json | jq '.activeAgents'

# Check for high-usage agents
node .claude/tools/cli/memory-dashboard.cjs --json | jq '.agents | to_entries | map(select(.value.budgetPercent > 80))'
```

**3. Alert Monitoring**

```bash
# Check if any agents need attention
node .claude/tools/cli/memory-dashboard.cjs | grep "ALERTS"
```

---

## Related Documentation

- **Performance Budgets**: `.claude/docs/PERFORMANCE_BUDGETS.md`
- **Code Review Checklist**: `.claude/docs/CODE_REVIEW_MEMORY_CHECKLIST.md`
- **Operational Runbook**: `.claude/docs/MEMORY_OPERATIONAL_RUNBOOK.md`
- **Agent Spawn Template**: `.claude/templates/spawn/universal-agent-spawn.md`
- **MemoryMonitor Tests**: `tests/memory-monitor.test.cjs`
- **TaskCleanupManager Tests**: `tests/task-cleanup-manager.test.cjs`
- **Memory Dashboard Tests**: `tests/cli/memory-dashboard.test.cjs`

---

## Summary

**Key Takeaways:**

1. All arrays MUST have max size limits
2. Trim arrays automatically after push operations
3. Test classes MUST implement cleanup methods
4. Always add `afterEach` cleanup in test suites
5. Monitor memory during development with `--trace-gc`
6. Use TDD to prevent regressions (RED-GREEN-REFACTOR)

**Pattern to Remember:**

```
Unbounded collection → Add max size → Trim after push → Test cleanup
```
