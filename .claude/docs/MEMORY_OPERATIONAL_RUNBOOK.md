# Memory Operational Runbook

**Last Updated:** 2026-01-30
**Version:** 1.0.0
**Last verified:** 2026-02-01 (Pre-deployment steps, headless/maintenance notes)

## Overview

This runbook provides step-by-step procedures for memory management in production, including pre-deployment checks, monitoring, incident response, and post-mortem analysis.

**When maintenance runs:** Maintenance runs on SessionEnd or when a user prompt occurs and weekly maintenance is overdue (7 days). For headless or rarely-used environments, run `pnpm run memory:weekly` (or `memory:daily`) periodically (e.g. cron or CI).

---

## Pre-Deployment Memory Checks

### Step 0: Verify LTM Retention / Cold Storage

The tiered memory system includes retention so hot LTM stays bounded:

- Hot LTM: `.claude/context/memory/ltm/summary_*.json` (capped by `MEMORY_LTM_MAX_SUMMARIES`, default 50)
- Cold archives: `.claude/context/memory/cold/ltm-*.jsonl.gz` (written per run; no gzip append)

```bash
# Run the weekly scheduler (includes cold archiving)
node .claude/lib/memory/memory-scheduler.cjs weekly
# OR: pnpm run memory:weekly

# Or run the task directly
node .claude/lib/memory/memory-scheduler.cjs task archiveOldLTM
# OR: pnpm run memory:daily (runs daily tasks)

# Confirm lastColdArchive is updated
cat .claude/context/memory/maintenance-status.json
```

**Pass Criteria:**

- [ ] `maintenance-status.json` includes `lastColdArchive`
- [ ] `ltm/` count stays within `MEMORY_LTM_MAX_SUMMARIES`
- [ ] Cold archive files appear under `cold/` when LTM exceeds the cap

### Step 1: Run Memory Budget Tests

```bash
# Run full test suite with memory monitoring
NODE_OPTIONS="--trace-gc --max-old-space-size=4096" pnpm test

# Check for warnings:
# - Heap size continuously increasing
# - GC running frequently (>1/second)
# - Tests failing with OOM
```

**Pass Criteria:**

- [ ] All tests pass
- [ ] Heap size stable (no continuous growth)
- [ ] GC frequency <10/second
- [ ] No OOM errors

---

### Step 2: Profile Memory Under Load

```bash
# Run load tests with memory profiling
NODE_OPTIONS="--trace-gc --max-old-space-size=4096" \
  node --test tests/scale/track-analytics-scale.test.cjs

# Monitor:
# - Peak heap usage
# - Heap growth rate
# - GC pause times
```

**Pass Criteria:**

- [ ] Peak heap <3GB (dev), <6GB (staging), <10GB (prod)
- [ ] Heap growth rate <5MB/sec
- [ ] GC pauses <100ms p99

---

### Step 3: Verify Cleanup Hooks

```bash
# Verify all test classes have cleanup
grep -r "beforeEach" tests/ | while read file; do
  if ! grep -q "afterEach" "$file"; then
    echo "MISSING afterEach: $file"
  fi
done

# Verify cleanup methods exist
grep -r "class.*{" .claude/lib/ | while read file; do
  if ! grep -q "cleanup()" "$file"; then
    echo "MISSING cleanup(): $file"
  fi
done
```

**Pass Criteria:**

- [ ] All test suites have `afterEach` cleanup
- [ ] All stateful classes have `cleanup()` method

---

### Step 4: Check Bounded Collections

```bash
# Find unbounded arrays
grep -r "\.push(" .claude/lib/ | while read match; do
  file=$(echo "$match" | cut -d: -f1)
  line=$(echo "$match" | cut -d: -f2)

  # Check if followed by shift/splice/trim
  if ! grep -A3 "\.push(" "$file" | grep -q "shift\|splice\|length >"; then
    echo "UNBOUNDED: $file:$line"
  fi
done
```

**Pass Criteria:**

- [ ] No unbounded arrays found
- [ ] All collections have max size limits
- [ ] Trimming logic present after push

---

## Environment-specific

- **Headless / no SessionEnd:** Run the reflection-queue-processor manually or simulate SessionEnd if reflection is required: `node .claude/hooks/reflection/reflection-queue-processor.cjs`
- **Headless / rarely-used:** Schedule `pnpm run memory:weekly` (e.g. cron) for LTM retention and cold storage so maintenance runs without UserPromptSubmit or SessionEnd

---

## Production Memory Monitoring

### Step 1: Enable Monitoring

```bash
# Production start command with monitoring
NODE_OPTIONS="--max-old-space-size=12288 --trace-gc" \
  node --expose-gc index.js
```

---

### Step 2: Monitor Metrics

**Key Metrics to Track:**

| Metric              | Warning Level | Critical Level | Action                       |
| ------------------- | ------------- | -------------- | ---------------------------- |
| Heap Used           | 8GB (80%)     | 10GB (95%)     | Investigate, prepare restart |
| Heap Growth Rate    | 10MB/sec      | 20MB/sec       | Identify leak source         |
| GC Frequency        | 10/sec        | 20/sec         | Memory pressure detected     |
| GC Pause Time (p99) | 100ms         | 500ms          | Performance degradation      |

**Monitoring Setup:**

```javascript
// Add to index.js
setInterval(() => {
  const mem = process.memoryUsage();
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      heapUsed: mem.heapUsed / 1024 / 1024, // MB
      heapTotal: mem.heapTotal / 1024 / 1024,
      external: mem.external / 1024 / 1024,
      rss: mem.rss / 1024 / 1024,
    })
  );
}, 60000); // Every minute
```

---

### Step 3: Set Up Alerts

**Datadog/CloudWatch/Prometheus:**

```yaml
alerts:
  - name: heap-usage-warning
    condition: heap_used_mb > 8000
    severity: warning
    action: notify-team

  - name: heap-usage-critical
    condition: heap_used_mb > 10000
    severity: critical
    action: page-oncall

  - name: gc-frequency-high
    condition: gc_per_sec > 10
    severity: warning
    action: investigate
```

---

## Heap OOM Incident Response

### Phase 1: Immediate Mitigation (0-5 minutes)

**Step 1: Capture State**

```bash
# If process still running, capture heap snapshot
kill -USR2 <pid>  # Triggers heapsnapshot if configured

# Or manually
node --inspect index.js
# In Chrome DevTools: Memory → Take snapshot
```

**Step 2: Restart Service**

```bash
# Graceful restart
pm2 restart index --update-env

# Or force restart if unresponsive
pm2 delete index
pm2 start index.js --max-memory-restart 12G
```

**Step 3: Notify Team**

```markdown
**INCIDENT**: Heap OOM in production

**Status**: Service restarted
**Heap Snapshot**: [link if captured]
**Next**: Root cause analysis

**Timeline**:

- 14:23 UTC: OOM detected
- 14:24 UTC: Snapshot captured
- 14:25 UTC: Service restarted
```

---

### Phase 2: Root Cause Analysis (5-60 minutes)

**Step 1: Analyze Heap Snapshot**

```bash
# Open heap snapshot in Chrome DevTools
# chrome://inspect → Open dedicated DevTools

# Look for:
# 1. Large arrays (>1000 entries)
# 2. Retained closures
# 3. Detached DOM nodes (if applicable)
# 4. Large strings/buffers
```

**Step 2: Review Recent Changes**

```bash
# Check commits since last deployment
git log --oneline --since="2 days ago"

# Look for:
# - New class additions
# - Array/Map/Set usage
# - Event listener additions
# - Long-running operations
```

**Step 3: Reproduce Locally**

```bash
# Run load test with memory profiling
NODE_OPTIONS="--trace-gc --heapsnapshot-on-oom --max-old-space-size=2048" \
  npm test

# Compare heap snapshots:
# 1. Before operation
# 2. After operation
# 3. Identify growth
```

---

### Phase 3: Containment (1-4 hours)

**Step 1: Identify Memory Hog**

Use heap snapshot comparison:

```
Objects allocated between Snapshot 1 and 2:
- Array (1500 objects, 45MB) ← SUSPECT
- Closure (500 objects, 15MB)
- String (10000 objects, 10MB)
```

**Step 2: Implement Quick Fix**

```javascript
// Example: Add bounded array immediately
class StateSyncManager {
  constructor() {
    this.syncHistory = [];
    this.maxHistorySize = 1000; // QUICK FIX
  }

  sync(state) {
    this.syncHistory.push(state);

    // QUICK FIX: Trim
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory.shift();
    }
  }
}
```

**Step 3: Deploy Hotfix**

```bash
# Create hotfix branch
git checkout -b hotfix/memory-leak-sync-manager

# Commit fix
git commit -m "hotfix: bound syncHistory to 1000 entries"

# Deploy
git push origin hotfix/memory-leak-sync-manager
# Create PR with "HOTFIX" label
# Fast-track review and merge
```

---

### Phase 4: Long-Term Fix (4-24 hours)

**Step 1: Add Regression Test**

```javascript
it('should prevent memory leak in sync history', () => {
  const manager = new StateSyncManager();

  // Simulate 2000 syncs
  for (let i = 0; i < 2000; i++) {
    manager.sync({ id: `task-${i}` });
  }

  // Verify bounded
  assert(manager.syncHistory.length <= 1000);
});
```

**Step 2: Update Documentation**

Add to `.claude/context/memory/learnings.md`:

```markdown
## Memory Leak Fix: StateSyncManager (YYYY-MM-DD)

**Issue**: syncHistory grows unbounded during multi-agent spawning

**Fix**: Added maxHistorySize limit + automatic trimming

**Impact**: 97% memory reduction (1.7MB → 50KB)

**Pattern**: All unbounded arrays need max size + trimming
```

---

## Post-Mortem Analysis

### Step 1: Create Post-Mortem Document

```markdown
# Post-Mortem: Production OOM (YYYY-MM-DD)

## Summary

Production heap OOM due to unbounded syncHistory growth in StateSyncManager.

## Timeline

- 14:23 UTC: OOM alert triggered
- 14:24 UTC: Heap snapshot captured
- 14:25 UTC: Service restarted
- 15:30 UTC: Root cause identified
- 16:45 UTC: Hotfix deployed
- 18:00 UTC: Regression test added

## Root Cause

StateSyncManager.syncHistory accumulated 34,000 entries during orchestrator
spawning 34 agents, causing ~1.7MB unbounded growth.

## Resolution

Added maxHistorySize limit (1000) + automatic trimming after push.

## Prevention

1. Added regression test
2. Updated code review checklist
3. Added pre-deployment memory check
4. Enhanced monitoring alerts

## Action Items

- [ ] Audit all classes for unbounded arrays (OWNER)
- [ ] Add memory budget tests (OWNER)
- [ ] Update developer training (OWNER)
```

---

### Step 2: Update Runbooks

Add incident to this runbook as case study:

```markdown
## Case Study: StateSyncManager OOM (2026-01-30)

**Symptom**: Production OOM during orchestrator spawning

**Root Cause**: Unbounded syncHistory array

**Detection Time**: 2 minutes (alert → snapshot → restart)

**Resolution Time**: 2.5 hours (root cause → hotfix → deploy)

**Lessons Learned**:

- Heap snapshots critical for rapid diagnosis
- Automated alerts enabled fast response
- Regression tests prevent recurrence
```

---

## Prevention Improvements

### Step 1: Enhance Pre-Deployment Checks

Add to CI/CD pipeline:

```yaml
# .github/workflows/memory-check.yml
name: Memory Check

on: [pull_request]

jobs:
  memory-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check for unbounded arrays
        run: |
          ./scripts/check-bounded-arrays.sh
      - name: Run memory budget tests
        run: |
          NODE_OPTIONS="--max-old-space-size=4096" npm test
```

---

### Step 2: Add Monitoring Dashboards

**Grafana Dashboard:**

```json
{
  "panels": [
    {
      "title": "Heap Usage",
      "targets": [
        {
          "expr": "nodejs_heap_used_bytes / 1024 / 1024"
        }
      ],
      "thresholds": [8000, 10000]
    },
    {
      "title": "GC Frequency",
      "targets": [
        {
          "expr": "rate(nodejs_gc_duration_seconds_count[1m])"
        }
      ],
      "thresholds": [10, 20]
    }
  ]
}
```

---

## Related Documentation

- **Memory Management Guide**: `.claude/docs/MEMORY_MANAGEMENT.md`
- **Performance Budgets**: `.claude/docs/PERFORMANCE_BUDGETS.md`
- **Code Review Checklist**: `.claude/docs/CODE_REVIEW_MEMORY_CHECKLIST.md`

---

## Summary

**Pre-Deployment:**

1. Run memory budget tests
2. Profile under load
3. Verify cleanup hooks
4. Check bounded collections

**Production Monitoring:**

1. Track heap usage, GC frequency, pause times
2. Set up alerts (warning: 80%, critical: 95%)
3. Enable heap snapshot on OOM

**Incident Response:**

1. **Immediate** (0-5 min): Capture snapshot, restart service
2. **Analysis** (5-60 min): Analyze snapshot, review changes, reproduce
3. **Containment** (1-4 hrs): Identify hog, implement quick fix, deploy hotfix
4. **Long-term** (4-24 hrs): Add regression test, update docs

**Post-Mortem:**

1. Create post-mortem document
2. Update runbooks with case study
3. Implement prevention improvements
