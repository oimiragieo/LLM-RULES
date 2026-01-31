# Monitoring & Alerting Runbook - Phase 4-5 Production

**Version:** 1.0
**Date:** 2026-01-30
**Prepared By:** QA Agent
**Target:** Production Operations

---

## Table of Contents

- [Overview](#overview)
- [Alert Types](#alert-types)
- [Response Procedures](#response-procedures)
- [Monitoring Dashboard](#monitoring-dashboard)
- [Incident Response](#incident-response)
- [Escalation Matrix](#escalation-matrix)

---

## Overview

This runbook provides operational procedures for monitoring and responding to alerts in the Phase 4-5 production environment.

**Monitoring Scope:**

- Phase 5 ML Features (Pattern Detection, Cost Prediction, Adaptive Execution)
- Phase 4 Advanced Workflows (SPEC-017 through SPEC-022)
- System Health (Memory, Concurrency, Error Rate)

**Alert Levels:**

- **INFO:** Informational, no action required
- **WARNING:** Potential issue, monitor closely
- **CRITICAL:** Immediate action required

---

## Alert Types

### 1. Memory Alerts

#### 1.1 Heap Usage WARNING (70% threshold)

**Alert:**

```
Heap usage WARNING: 72.3% (2890 MB / 4000 MB)
```

**Cause:**

- High concurrent workflow count
- Memory leak in long-running process
- Large workflow state accumulation

**Response Procedure:**

1. **Check current load** (30 seconds)

   ```bash
   # Check concurrent workflow count
   curl http://localhost:3000/api/health/concurrency
   ```

2. **Review recent deployments** (1 minute)
   - Was there a recent deployment in last 24 hours?
   - Check deployment logs for correlation

3. **Monitor for 15 minutes**
   - If heap stabilizes below 75%: **No action**
   - If heap continues growing: **Escalate to CRITICAL**

4. **Prepare for scaling** (proactive)
   - Notify DevOps team
   - Prepare horizontal scaling plan

**Resolution Time:** 15 minutes (monitor) or escalate

---

#### 1.2 Heap Usage CRITICAL (85% threshold)

**Alert:**

```
Heap usage CRITICAL: 87.1% (3484 MB / 4000 MB)
```

**Cause:**

- Memory leak reached critical levels
- Sustained high load exceeding capacity
- Bounded collections not working

**Response Procedure:**

1. **Immediate action** (0-2 minutes)

   ```bash
   # Scale horizontally (add worker)
   pm2 scale agent-studio +1

   # OR restart service (if scaling unavailable)
   pm2 restart agent-studio
   ```

2. **Capture heap snapshot** (before restart)

   ```bash
   # Save heap dump for analysis
   kill -USR2 <pid>
   # Heap dump saved to: heap-YYYY-MM-DD-HH-MM-SS.heapsnapshot
   ```

3. **Verify recovery** (2-5 minutes)

   ```bash
   # Check heap after restart
   curl http://localhost:3000/api/health/memory
   ```

4. **Root cause analysis** (post-incident)
   - Analyze heap snapshot with Chrome DevTools
   - Check for memory leaks in recent code changes
   - Review bounded collection limits

**Resolution Time:** 5 minutes (restart) + post-mortem

---

### 2. ML Feature Health Alerts

#### 2.1 Pattern Detection Latency WARNING (>10ms)

**Alert:**

```
patternDetection latency WARNING: 12ms (threshold: 10ms)
```

**Cause:**

- Large workflow history (>1000 workflows)
- Combinatorial explosion (too many patterns)
- Disk I/O bottleneck (pattern library persistence)

**Response Procedure:**

1. **Check pattern library size** (1 minute)

   ```bash
   # Check pattern file size
   ls -lh .claude/lib/ml/patterns.json

   # Expected: <10 MB
   # If >10 MB: Pattern library needs cleanup
   ```

2. **Monitor for sustained latency** (5 minutes)
   - Single spike: **No action** (transient)
   - Sustained >10ms for 5 minutes: **Investigate**

3. **Disable feature if critical** (if latency >50ms sustained)
   ```bash
   # Disable pattern detection
   export PATTERN_DETECTION_ENABLED=false
   pm2 restart agent-studio
   ```

**Resolution Time:** 5 minutes (monitor) or 1 minute (disable)

---

#### 2.2 Pattern Detection Latency CRITICAL (>100ms)

**Alert:**

```
patternDetection latency CRITICAL: 127ms (threshold: 100ms)
```

**Cause:**

- Pattern library corrupted
- Disk I/O failure
- CPU overload

**Response Procedure:**

1. **Disable feature immediately** (30 seconds)

   ```bash
   export PATTERN_DETECTION_ENABLED=false
   pm2 restart agent-studio
   ```

2. **Verify degradation** (1 minute)

   ```bash
   # System should work without pattern detection
   curl http://localhost:3000/api/health/features | jq '.ml.patternDetection'
   # Expected: { "enabled": false }
   ```

3. **Investigate root cause** (post-incident)
   - Check pattern library file for corruption
   - Review recent pattern detection logs
   - Analyze CPU/disk metrics

**Resolution Time:** 2 minutes (disable) + post-mortem

---

### 3. Error Rate Alerts

#### 3.1 Error Rate WARNING (>0.1%)

**Alert:**

```
Error rate WARNING: 0.15% (15/10000 in 60s)
```

**Cause:**

- Transient network issues
- Flaky tests in production (edge case)
- External dependency failure

**Response Procedure:**

1. **Check error logs** (2 minutes)

   ```bash
   # Recent errors
   tail -n 100 /var/log/agent-studio/app.log | grep ERROR
   ```

2. **Categorize errors** (3 minutes)
   - Are errors from same operation? → Specific bug
   - Are errors random? → Transient issue

3. **Monitor for 10 minutes**
   - If error rate drops below 0.1%: **No action**
   - If error rate persists or increases: **Escalate to CRITICAL**

**Resolution Time:** 10 minutes (monitor) or escalate

---

#### 3.2 Error Rate CRITICAL (>1%)

**Alert:**

```
Error rate CRITICAL: 2.34% (234/10000 in 60s)
```

**Cause:**

- Recent deployment introduced bug
- External dependency failed
- Database connection issues

**Response Procedure:**

1. **Immediate rollback decision** (2 minutes)

   ```bash
   # Check deployment timestamp
   git log --oneline -1

   # If deployed <4 hours ago: ROLLBACK
   # If deployed >4 hours ago: INVESTIGATE
   ```

2. **Execute rollback** (if recent deployment)

   ```bash
   # Rollback to previous version
   git revert HEAD
   pm2 restart agent-studio
   ```

3. **Disable failing feature** (if specific feature)

   ```bash
   # Example: Disable Phase 4 SPEC-019 if that's failing
   export SPEC_019_ENABLED=false
   pm2 restart agent-studio
   ```

4. **Notify stakeholders** (immediate)
   - Email: operations@company.com
   - Slack: #incidents
   - Status page: Update to "Degraded"

**Resolution Time:** 5 minutes (rollback) + post-mortem

---

### 4. Concurrent Workflow Alerts

#### 4.1 Concurrent Workflows WARNING (>150)

**Alert:**

```
Concurrent workflows WARNING: 163 (threshold: 150)
```

**Cause:**

- Traffic spike (legitimate)
- Slow workflow execution (backlog building)
- Stuck workflows (not completing)

**Response Procedure:**

1. **Check workflow completion rate** (2 minutes)

   ```bash
   # Check active workflows
   curl http://localhost:3000/api/health/workflows | jq '.active'

   # Check completion rate
   curl http://localhost:3000/api/metrics/workflows | jq '.completionRate'
   ```

2. **Identify stuck workflows** (3 minutes)

   ```bash
   # Workflows in_progress for >1 hour
   grep "in_progress" .claude/context/workflow-state.json | jq '.duration'
   ```

3. **Prepare scaling** (proactive)
   - Notify DevOps team
   - Prepare to add workers

**Resolution Time:** 5 minutes (assess) + prepare scaling

---

#### 4.2 Concurrent Workflows CRITICAL (>200)

**Alert:**

```
Concurrent workflows CRITICAL: 237 (threshold: 200)
```

**Cause:**

- Sustained high traffic
- Workflows not completing (deadlock)
- System overload

**Response Procedure:**

1. **Scale horizontally immediately** (2 minutes)

   ```bash
   # Add 2 workers
   pm2 scale agent-studio +2
   ```

2. **Enable load shedding** (if approaching 500)

   ```bash
   # Reject new workflows at 500 concurrent
   export LOAD_SHEDDING_ENABLED=true
   export LOAD_SHEDDING_THRESHOLD=500
   pm2 restart agent-studio
   ```

3. **Kill stuck workflows** (if deadlock detected)
   ```bash
   # Identify workflows stuck >2 hours
   # Manually terminate via workflow CLI
   node .claude/lib/workflow/workflow-cli.cjs kill --stuck --timeout 7200
   ```

**Resolution Time:** 5 minutes (scale) + investigate

---

## Monitoring Dashboard

### Key Metrics to Display

**System Health Panel:**

- Heap Usage (% of limit)
- Concurrent Workflows (count)
- Error Rate (% in last 5 minutes)
- Request Throughput (requests/second)

**ML Features Panel:**

- Pattern Detection Latency (ms)
- Cost Prediction Latency (ms)
- Adaptive Executor Latency (ms)
- ML Memory Overhead (MB)

**Phase 4 Workflows Panel:**

- Fan-Out Execution Latency (ms)
- Workflow Composition Latency (ms)
- Hybrid Execution Overhead (ms)
- Cache Hit Rate (%)

### Dashboard URLs

**Grafana:** `http://grafana.company.com/d/agent-studio-prod`
**Prometheus:** `http://prometheus.company.com/graph?g0.expr=agent_studio_*`
**CloudWatch:** `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=AgentStudio`

---

## Incident Response

### Severity Levels

| Severity     | Response Time | Escalation | Example                    |
| ------------ | ------------- | ---------- | -------------------------- |
| **INFO**     | No SLA        | None       | Workflow completed in 2s   |
| **WARNING**  | 15 minutes    | On-call    | Heap 72% (approaching 85%) |
| **CRITICAL** | 5 minutes     | Immediate  | Heap 87%, error rate 2.3%  |

### Incident Workflow

1. **Alert Triggered** (0 minutes)
   - Pagerduty/Slack/Email notification
   - Incident ticket created automatically

2. **Acknowledge** (0-2 minutes)
   - On-call engineer acknowledges alert
   - Incident status updated to "Investigating"

3. **Diagnose** (2-5 minutes)
   - Run diagnostic commands
   - Check recent deployments
   - Review error logs

4. **Mitigate** (5-10 minutes)
   - Execute runbook procedure
   - Scale/restart/rollback as needed
   - Verify mitigation

5. **Resolve** (10-15 minutes)
   - System stable
   - Alerts cleared
   - Incident status updated to "Resolved"

6. **Post-Mortem** (24-48 hours)
   - Root cause analysis
   - Document lessons learned
   - Update runbook if needed

---

## Escalation Matrix

### Level 1: On-Call Engineer (Initial Response)

**Responsibility:**

- Acknowledge alert within 5 minutes
- Execute runbook procedure
- Attempt initial mitigation

**Contact:**

- Pagerduty: rotation schedule
- Slack: #operations
- Phone: +1-555-ON-CALL

**Escalate If:**

- Mitigation fails after 15 minutes
- Multiple CRITICAL alerts simultaneously
- Unclear root cause

---

### Level 2: Senior DevOps Engineer

**Responsibility:**

- Deep dive diagnostics
- Complex mitigation (scaling, infrastructure changes)
- Coordinate with other teams

**Contact:**

- Pagerduty: escalation policy
- Slack: @devops-senior
- Phone: +1-555-DEVOPS

**Escalate If:**

- Incident impacts >50% of users
- Data integrity concerns
- Security incident suspected

---

### Level 3: Engineering Manager + CTO

**Responsibility:**

- Executive decision-making
- Stakeholder communication
- Resource allocation

**Contact:**

- Phone: +1-555-EXEC
- Email: leadership@company.com

**Escalate If:**

- Major outage (>1 hour)
- Data loss/corruption
- Security breach

---

## Health Check Endpoints

### `/api/health` - Overall System Health

**Response:**

```json
{
  "status": "healthy",
  "uptime": 3600,
  "memory": {
    "heapUsed": 50331648,
    "heapPercent": 12.5
  },
  "features": {
    "phase4": { "enabled": true },
    "phase5": { "enabled": true }
  }
}
```

### `/api/health/ml` - ML Feature Health

**Response:**

```json
{
  "patternDetection": {
    "enabled": true,
    "latency": 1.23,
    "status": "OK"
  },
  "costPrediction": {
    "enabled": true,
    "latency": 0.01,
    "status": "OK"
  },
  "adaptiveExecutor": {
    "enabled": true,
    "latency": 0.001,
    "status": "OK"
  }
}
```

### `/api/metrics` - Prometheus Metrics

**Metrics Exposed:**

- `agent_studio_heap_used_bytes` - Heap usage
- `agent_studio_concurrent_workflows` - Active workflow count
- `agent_studio_error_rate` - Error rate (%)
- `agent_studio_ml_latency_ms{feature="patternDetection"}` - ML latency

---

## Monitoring Tools Configuration

### Prometheus Scrape Config

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'agent-studio'
    scrape_interval: 15s
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/metrics'
```

### Grafana Dashboard JSON

See: `.claude/context/artifacts/monitoring/grafana-dashboard.json`

### CloudWatch Alarms

**Heap Usage Alarm:**

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name agent-studio-heap-warning \
  --metric-name HeapUsedPercent \
  --namespace AgentStudio \
  --statistic Average \
  --period 300 \
  --threshold 70 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

---

## Post-Incident Procedures

### 1. Post-Mortem Template

**Incident:** [Title]
**Date:** [YYYY-MM-DD]
**Duration:** [X hours]
**Impact:** [User-facing impact]
**Severity:** [INFO/WARNING/CRITICAL]

**Timeline:**

- [HH:MM] - Alert triggered
- [HH:MM] - Investigation started
- [HH:MM] - Mitigation applied
- [HH:MM] - Incident resolved

**Root Cause:**
[Detailed explanation]

**Contributing Factors:**

- [Factor 1]
- [Factor 2]

**Resolution:**
[What fixed it]

**Action Items:**

- [ ] [Action 1 - Owner - Due Date]
- [ ] [Action 2 - Owner - Due Date]

**Lessons Learned:**

- [Learning 1]
- [Learning 2]

---

### 2. Runbook Updates

After each incident, update this runbook if:

- New alert type encountered
- Existing procedure failed
- Better mitigation discovered

**Update Process:**

1. Create branch: `runbook/update-YYYY-MM-DD`
2. Update `.claude/docs/MONITORING_RUNBOOK.md`
3. Test updated procedure
4. Submit PR for review
5. Merge and deploy

---

## Monitoring Checklist (Daily)

- [ ] Check overnight alerts (review Pagerduty)
- [ ] Verify heap usage <70% (check dashboard)
- [ ] Validate error rate <0.1% (check logs)
- [ ] Confirm concurrent workflows <150 (check metrics)
- [ ] Review ML feature latency (all <10ms)
- [ ] Check recent deployments (any correlation with alerts?)
- [ ] Test health check endpoints (all returning 200)

---

**Version:** 1.0
**Last Updated:** 2026-01-30
**Next Review:** 2026-02-15 (or after first production incident)
