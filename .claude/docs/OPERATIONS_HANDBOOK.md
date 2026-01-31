# Operations Handbook

**Version:** 1.0.0
**Last Updated:** 2026-01-30
**Target Audience:** Operations engineers, SREs, and DevOps personnel responsible for running agent-studio in production

---

## Table of Contents

1. [Daily Operations Checklist](#daily-operations-checklist)
2. [Health Checks](#health-checks)
3. [Troubleshooting Guide](#troubleshooting-guide)
4. [Scaling Guide](#scaling-guide)
5. [Monitoring and Alerting Setup](#monitoring-and-alerting-setup)

---

## Daily Operations Checklist

### Morning Health Check (5-10 minutes)

Complete this checklist at the start of each operational day:

**Step 1: Review Overnight Alerts (2 minutes)**

```bash
# Check Pagerduty for overnight incidents
# Review Slack #incidents channel
# Check email for any automated alerts
```

If any alerts fired overnight:

- [ ] Acknowledge or close resolved alerts
- [ ] Create follow-up tickets for unresolved issues
- [ ] Note any patterns (recurring alerts = systemic issue)

**Step 2: Dashboard Health Review (2 minutes)**

Open the monitoring dashboard and verify:

- [ ] **Heap Usage**: Should be <70% (yellow zone: 70-85%, red zone: >85%)
- [ ] **Error Rate**: Should be <0.1% in last 24 hours
- [ ] **Concurrent Workflows**: Should be <150 (warning at 150, critical at 200)
- [ ] **ML Feature Latency**: All modules <10ms

**Step 3: Log Review (2 minutes)**

```bash
# Check for ERROR patterns in last 24 hours
tail -n 1000 /var/log/agent-studio/app.log | grep ERROR | wc -l

# If errors > 10, investigate further
tail -n 1000 /var/log/agent-studio/app.log | grep ERROR
```

**Step 4: Test Health Endpoints (1 minute)**

```bash
# Overall system health
curl -s http://localhost:3000/api/health | jq '.status'
# Expected: "healthy"

# ML features health
curl -s http://localhost:3000/api/health/ml | jq '.'
# Expected: All modules showing "OK"
```

**Step 5: Check Recent Deployments (1 minute)**

```bash
# List recent deployments
git log --oneline -5 --since="24 hours ago"

# If deployments exist, correlate with any alerts
```

### Weekly Maintenance Tasks

**Monday:**

- [ ] Review past week's incident reports
- [ ] Check for pending security updates
- [ ] Verify backup procedures

**Wednesday:**

- [ ] Run full test suite in staging
- [ ] Review memory usage trends
- [ ] Check disk space on log volumes

**Friday:**

- [ ] Generate weekly operations report
- [ ] Review SLO compliance
- [ ] Plan for next week's maintenance windows

### Monthly Tasks

- [ ] Review and rotate secrets/credentials
- [ ] Analyze performance trends
- [ ] Update runbook with new learnings
- [ ] Conduct incident response drill

---

## Health Checks

### Heap Monitoring

**What to Check:**

- Current heap usage (percentage of limit)
- Heap growth rate (MB/minute)
- GC frequency and duration

**Normal Operation:**

- Heap usage <70%
- Growth rate <5MB/minute sustained
- GC runs <10 times/minute

**Commands:**

```bash
# Check current heap usage
curl -s http://localhost:3000/api/health/memory | jq '.'

# Response format:
# {
#   "heapUsed": 50331648,
#   "heapTotal": 402653184,
#   "heapLimit": 4294967296,
#   "heapPercent": 12.5
# }

# Enable GC logging for diagnostics
NODE_OPTIONS="--trace-gc" pm2 restart agent-studio
```

**Thresholds:**

| Level    | Percentage | Action                                  |
| -------- | ---------- | --------------------------------------- |
| Normal   | <70%       | No action                               |
| Warning  | 70-85%     | Monitor closely, prepare scaling        |
| Critical | 85-95%     | Block spawning, investigate immediately |
| Shutdown | >95%       | Emergency restart, scale horizontally   |

### Agent Spawn Rate

**What to Check:**

- Spawns per second
- Spawn success rate
- Queue depth (if applicable)

**Normal Operation:**

- <10 spawns/second
- > 99% success rate

**Commands:**

```bash
# Check spawn metrics (if endpoint available)
curl -s http://localhost:3000/api/metrics | grep spawn

# Check task system for in-flight tasks
curl -s http://localhost:3000/api/health/tasks | jq '.inProgress'
```

**Warning Signs:**

- Spawn rate >10/sec sustained = sync history explosion risk
- Spawn failures >1% = check routing guard, agent templates

### Error Rate Monitoring

**What to Check:**

- Total errors per time window
- Error rate percentage
- Error categorization

**Normal Operation:**

- <0.1% error rate
- No repeating error patterns

**Commands:**

```bash
# Quick error rate check
ERROR_COUNT=$(tail -n 10000 /var/log/agent-studio/app.log | grep ERROR | wc -l)
TOTAL_LINES=10000
echo "Error rate: $(echo "scale=2; $ERROR_COUNT * 100 / $TOTAL_LINES" | bc)%"

# Categorize errors
tail -n 10000 /var/log/agent-studio/app.log | grep ERROR | \
  cut -d']' -f2 | sort | uniq -c | sort -rn | head -10
```

**Thresholds:**

| Level     | Rate     | Action                      |
| --------- | -------- | --------------------------- |
| Normal    | <0.1%    | No action                   |
| Warning   | 0.1-0.5% | Investigate error patterns  |
| Critical  | 0.5-1%   | Escalate, prepare rollback  |
| Emergency | >1%      | Immediate rollback decision |

### ML Module Health

**What to Check:**

- All 5 ML modules responding
- Module latency within targets
- Feature flags correctly applied

**Commands:**

```bash
# Check ML health endpoint
curl -s http://localhost:3000/api/health/ml | jq '.'

# Expected response:
# {
#   "patternDetection": { "enabled": true, "latency": 1.23, "status": "OK" },
#   "costPrediction": { "enabled": true, "latency": 0.01, "status": "OK" },
#   "adaptiveExecutor": { "enabled": true, "latency": 0.001, "status": "OK" },
#   "performanceProfiling": { "enabled": true, "latency": 0.5, "status": "OK" },
#   "patternLibrary": { "enabled": true, "status": "OK" }
# }

# Check feature flags
env | grep -E '(PATTERN|COST|ADAPTIVE|PERFORMANCE|PATTERN_LIBRARY)_ENABLED'
```

**Latency Targets:**

| Module            | Target | Warning | Critical |
| ----------------- | ------ | ------- | -------- |
| Pattern Detection | <10ms  | 10-50ms | >50ms    |
| Cost Prediction   | <5ms   | 5-20ms  | >20ms    |
| Adaptive Executor | <10ms  | 10-50ms | >50ms    |

### Workflow Throughput

**What to Check:**

- Workflows completed per hour
- Average workflow duration
- Workflow queue depth

**Normal Operation:**

- Stable throughput matching load
- Duration within SLO targets

**Commands:**

```bash
# Check workflow metrics
curl -s http://localhost:3000/api/metrics/workflows | jq '.'

# Check workflow state
cat .claude/context/workflow-state.json | jq '.active | length'
```

---

## Troubleshooting Guide

### Heap OOM Incidents

**Symptoms:**

- Process crash with "FATAL ERROR: Reached heap limit"
- Sudden service unavailability
- Incomplete task results

**Immediate Response (0-5 minutes):**

```bash
# 1. Check if process is still running
pm2 status agent-studio

# 2. If crashed, restart immediately
pm2 restart agent-studio

# 3. Check for heap snapshot (if configured)
ls -la /var/log/agent-studio/*.heapsnapshot
```

**Root Cause Investigation:**

```bash
# Check heap usage leading up to crash
grep "heapUsed" /var/log/agent-studio/app.log | tail -100

# Check for unbounded array growth patterns
grep -E "(syncHistory|testResults|metrics)" /var/log/agent-studio/app.log | tail -50

# Check spawn rate at crash time
grep "spawn" /var/log/agent-studio/app.log | tail -100
```

**Common Causes and Fixes:**

| Cause                 | Evidence                     | Fix                                       |
| --------------------- | ---------------------------- | ----------------------------------------- |
| Unbounded syncHistory | >1000 entries logged         | Verify maxHistorySize in StateSyncManager |
| Missing test cleanup  | Heap grows during tests      | Add afterEach cleanup hooks               |
| Large workflow state  | Workflow files >1MB          | Use context-compressor skill              |
| Event listener leak   | Warning about listener count | Check for removeAllListeners calls        |

**Prevention:**

Follow MEMORY_MANAGEMENT.md for all new code:

- All arrays MUST have max size limits
- All classes MUST implement cleanup() methods
- All tests MUST use afterEach cleanup hooks

### Agent Spawn Failures

**Symptoms:**

- Tasks stuck in "pending" status
- Router logs showing spawn blocks
- User requests not being processed

**Diagnostic Steps:**

```bash
# 1. Check routing guard status
grep "routing-guard" /var/log/agent-studio/app.log | tail -50

# 2. Check memory pressure (common cause)
curl -s http://localhost:3000/api/health/memory | jq '.heapPercent'

# 3. Check task list for blocked tasks
# (Use TaskList via Claude Code CLI)
```

**Common Causes:**

| Cause            | Evidence                     | Fix                           |
| ---------------- | ---------------------------- | ----------------------------- |
| Memory pressure  | heapPercent >85%             | Restart or scale horizontally |
| Missing template | "Template not found" error   | Verify template exists        |
| Gate 1 failure   | "Multi-step task" in logs    | Ensure PLANNER spawned first  |
| Gate 2 failure   | "Security-sensitive" in logs | Include SECURITY-ARCHITECT    |

**Recovery:**

```bash
# If memory pressure:
pm2 restart agent-studio

# If template missing:
git checkout HEAD -- .claude/templates/spawn/

# If gate failures, correct routing in CLAUDE.md
```

### ML Module Errors

**Pattern Detector Timeout:**

```bash
# Symptom: Pattern detection latency >100ms

# 1. Check pattern library size
ls -lh .claude/lib/ml/patterns.json
# If >10MB, library needs cleanup

# 2. Disable feature temporarily
export PATTERN_DETECTION_ENABLED=false
pm2 restart agent-studio

# 3. Clean pattern library
# (Backup first)
cp .claude/lib/ml/patterns.json .claude/lib/ml/patterns.json.bak
echo '[]' > .claude/lib/ml/patterns.json

# 4. Re-enable
export PATTERN_DETECTION_ENABLED=true
pm2 restart agent-studio
```

**Cost Predictor Bounds:**

```bash
# Symptom: Cost prediction returning NaN or extreme values

# 1. Check input validation
grep "estimateCost" /var/log/agent-studio/app.log | tail -20

# 2. Verify model pricing is configured
grep "PRICING" .claude/lib/ml/cost-predictor.cjs

# 3. If corrupted, restart with defaults
pm2 restart agent-studio
```

### Memory Leaks

**Detection:**

```bash
# Enable heap profiling
NODE_OPTIONS="--max-old-space-size=4096 --trace-gc --heapsnapshot-on-oom" \
  pm2 restart agent-studio

# Monitor heap growth over time
watch -n 60 'curl -s http://localhost:3000/api/health/memory | jq .heapPercent'
```

**Investigation:**

```bash
# If heap grows continuously:
# 1. Take baseline snapshot
kill -USR2 $(pgrep -f agent-studio)

# 2. Wait 5 minutes, take second snapshot
# 3. Compare in Chrome DevTools (Memory tab)
# Look for: Growing arrays, unreleased closures, event listeners
```

**Common Leak Sources (Fixed in Production):**

| Source               | Pattern                  | Status                      |
| -------------------- | ------------------------ | --------------------------- |
| StateSyncManager     | syncHistory unbounded    | FIXED - maxHistorySize=1000 |
| LoadTestFramework    | metrics arrays           | FIXED - MAX_METRICS=1000    |
| ChaosEngineer        | testResults accumulation | FIXED - afterEach cleanup   |
| ErrorPatternDetector | Large input processing   | FIXED - input validation    |
| PatternDetector      | N-gram explosion         | FIXED - early termination   |
| CheckpointManager    | workflowStepCounters     | FIXED - LRU eviction        |

### Deadlocks and Hangs

**Symptoms:**

- Workflows stuck in "in_progress" indefinitely
- No progress on tasks for >1 hour
- System responsive but work not completing

**Diagnostic Steps:**

```bash
# 1. Check for stuck workflows
cat .claude/context/workflow-state.json | jq '.workflows[] | select(.status == "in_progress")'

# 2. Check for circular dependencies
cat .claude/context/workflow-state.json | jq '.workflows[] | {id, blockedBy}'

# 3. Check orchestrator state
grep "orchestrator" /var/log/agent-studio/app.log | tail -100
```

**Recovery:**

```bash
# Kill stuck workflows (if CLI available)
node .claude/lib/workflow/workflow-cli.cjs kill --stuck --timeout 7200

# Or restart service (clears in-memory state)
pm2 restart agent-studio
```

**Prevention:**

- Set workflow timeouts
- Implement heartbeat for long-running workflows
- Monitor "in_progress" duration

---

## Scaling Guide

### Increasing Agent Spawn Rate

**Current Limit:** 10 agents/second

**Why the Limit:** Higher spawn rates cause sync history explosion, leading to heap OOM.

**If You Need Higher Throughput:**

```bash
# Option 1: Horizontal scaling (recommended)
# Add more workers
pm2 scale agent-studio +2

# Each worker handles 10 spawns/second
# 3 workers = 30 spawns/second capacity

# Option 2: Increase history size (more memory)
# In code: maxHistorySize = 2000
# Requires: Additional heap (8GB minimum)
```

### Adding New Agent Types

**Step 1: Create Agent Definition**

```bash
# Create new agent file
cat > .claude/agents/domain/new-agent.md << 'EOF'
---
name: new-agent
version: 1.0.0
description: Description of agent purpose
model: sonnet
tools: [Read, Write, Edit, Bash, TaskUpdate, TaskList, Skill]
---

# New Agent

## Purpose
[What this agent does]

## Capabilities
[List of capabilities]

## Workflow
[How the agent operates]
EOF
```

**Step 2: Update Routing Table**

Add to `.claude/CLAUDE.md` Section 3 (Agent Routing Table):

```markdown
| New capability | `new-agent` | `.claude/agents/domain/new-agent.md` |
```

**Step 3: Add Intent Keywords**

Update `.claude/hooks/routing/router-enforcer.cjs`:

```javascript
intentKeywords['new-agent'] = ['keyword1', 'keyword2', 'keyword3'];
```

**Step 4: Test Routing**

```bash
# Test that requests route correctly
# (Via Claude Code CLI, ask a question using your keywords)
```

### Tuning Memory Limits

**Increase Heap for Larger Scale:**

```bash
# Development (default)
NODE_OPTIONS="--max-old-space-size=4096"  # 4GB

# Production
NODE_OPTIONS="--max-old-space-size=12288" # 12GB

# High-scale production
NODE_OPTIONS="--max-old-space-size=32768" # 32GB
```

**Adjust Component Budgets:**

If increasing overall heap, also increase component limits proportionally:

```javascript
// StateSyncManager - increase from 1000 to 5000
this.maxHistorySize = config.maxHistorySize || 5000;

// LoadTestFramework - increase from 1000 to 5000
const MAX_METRICS = 5000;

// Update PERFORMANCE_BUDGETS.md accordingly
```

### Optimizing ML Modules for Workloads

**High-Volume Pattern Detection:**

```bash
# Increase pattern library size
export PATTERN_LIBRARY_MAX_SIZE=5000  # Default: 1000

# Reduce pattern detection frequency
export PATTERN_DETECTION_SAMPLE_RATE=0.1  # Analyze 10% of workflows
```

**Cost-Sensitive Workloads:**

```bash
# Lower cost alert threshold
export COST_BUDGET_ALERT_USD=5.00  # Default: 10.00

# Enable cost-based task rejection
export COST_REJECTION_ENABLED=true
export COST_REJECTION_THRESHOLD_USD=50.00
```

**High-Parallelism Workloads:**

```bash
# Increase adaptive executor concurrency
export ADAPTIVE_MAX_CONCURRENCY=20  # Default: 10

# Note: Higher concurrency requires more memory
# Budget ~10MB per concurrent task
```

---

## Monitoring and Alerting Setup

### Production Alerts Configuration

**Alert Configuration File:** `.claude/lib/monitoring/production-alerts.cjs`

**Alert Levels:**

| Level    | Response Time | Escalation |
| -------- | ------------- | ---------- |
| INFO     | No SLA        | None       |
| WARNING  | 15 minutes    | On-call    |
| CRITICAL | 5 minutes     | Immediate  |

### Dashboard Setup

**Grafana Dashboard:**

Import dashboard from `.claude/context/artifacts/monitoring/grafana-dashboard.json`

**Key Panels:**

- System Health: Heap, CPU, Disk
- ML Features: Latency per module
- Workflow Metrics: Throughput, Duration
- Error Rate: Per hour trend

**DataDog Configuration:**

```yaml
# datadog.yaml
logs_enabled: true
logs_config:
  container_collect_all: true

apm_config:
  enabled: true

instances:
  - host: localhost
    port: 3000
    name: agent-studio
```

**CloudWatch Alarms:**

```bash
# Heap usage alarm
aws cloudwatch put-metric-alarm \
  --alarm-name agent-studio-heap-warning \
  --metric-name HeapUsedPercent \
  --namespace AgentStudio \
  --statistic Average \
  --period 300 \
  --threshold 70 \
  --comparison-operator GreaterThanThreshold

# Error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name agent-studio-error-rate \
  --metric-name ErrorRate \
  --namespace AgentStudio \
  --statistic Average \
  --period 300 \
  --threshold 0.5 \
  --comparison-operator GreaterThanThreshold
```

### Alert Routing and Escalation

**Pagerduty Integration:**

```yaml
# pagerduty.yaml
service_key: YOUR_SERVICE_KEY
routing_key: YOUR_ROUTING_KEY

severity_mapping:
  WARNING: warning
  CRITICAL: critical
```

**Escalation Policy:**

| Time Since Alert | Escalation           |
| ---------------- | -------------------- |
| 0-5 minutes      | On-call engineer     |
| 5-15 minutes     | Senior DevOps        |
| 15-30 minutes    | Engineering Manager  |
| 30+ minutes      | Executive escalation |

**Slack Integration:**

```bash
# Send alert to #incidents channel
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-type: application/json' \
  -d '{
    "channel": "#incidents",
    "text": "CRITICAL: agent-studio heap usage at 87%",
    "attachments": [{
      "color": "danger",
      "title": "Action Required",
      "text": "Heap usage exceeds critical threshold. Follow runbook."
    }]
  }'
```

### Health Check Endpoints

| Endpoint             | Purpose           | Response                                    |
| -------------------- | ----------------- | ------------------------------------------- |
| `/api/health`        | Overall health    | `{ status, uptime, memory }`                |
| `/api/health/ml`     | ML features       | `{ patternDetection, costPrediction, ... }` |
| `/api/health/memory` | Memory details    | `{ heapUsed, heapTotal, heapPercent }`      |
| `/api/metrics`       | Prometheus format | `agent_studio_*` metrics                    |

### Prometheus Scrape Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'agent-studio'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics'
```

**Available Metrics:**

```
agent_studio_heap_used_bytes
agent_studio_heap_limit_bytes
agent_studio_concurrent_workflows
agent_studio_error_rate
agent_studio_ml_latency_ms{feature="patternDetection"}
agent_studio_ml_latency_ms{feature="costPrediction"}
agent_studio_ml_latency_ms{feature="adaptiveExecutor"}
agent_studio_spawn_rate_per_second
agent_studio_task_completion_rate
```

---

## Quick Reference

### Emergency Commands

```bash
# Restart service
pm2 restart agent-studio

# Check status
pm2 status agent-studio

# View logs
pm2 logs agent-studio --lines 100

# Scale horizontally
pm2 scale agent-studio +2

# Full restart (clear state)
pm2 delete agent-studio && pm2 start ecosystem.config.js
```

### Feature Flag Toggles

```bash
# Disable ML features (instant rollback)
export PATTERN_DETECTION_ENABLED=false
export COST_PREDICTION_ENABLED=false
export ADAPTIVE_EXECUTION_ENABLED=false
pm2 restart agent-studio

# Re-enable
export PATTERN_DETECTION_ENABLED=true
# ... etc
pm2 restart agent-studio
```

### Rollback Commands

```bash
# Feature flag rollback (<1 minute)
export PATTERN_DETECTION_ENABLED=false
pm2 restart agent-studio

# Code rollback (1-5 minutes)
git revert HEAD
pm2 restart agent-studio

# Full version rollback (10-30 minutes)
git checkout v2.3.0  # Previous tag
npm install
pm2 restart agent-studio
```

### Contact Information

**On-Call:**

- Pagerduty: Rotation schedule
- Phone: +1-555-ON-CALL

**Senior DevOps:**

- Slack: @devops-senior
- Phone: +1-555-DEVOPS

**Engineering Manager:**

- Email: eng-manager@company.com
- Phone: +1-555-EXEC

---

**Document Version:** 1.0.0
**Last Updated:** 2026-01-30
**Next Review:** After first production incident or 30 days
