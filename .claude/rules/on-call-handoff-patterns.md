# On-Call Handoff Patterns Rules

## Core Principles

- Document everything during shift - memory fails under stress
- Escalate early when uncertain - better safe than catastrophic
- Keep handoffs synchronous - async loses critical context
- Test setup before incidents - not during emergencies
- Blameless culture - focus on systems, not people

## Input Requirements

- Active incidents or investigations
- Recent system changes (deployments, configs)
- Known issues and workarounds
- Upcoming events (maintenance, releases)
- On-call rotation schedule

## Output Standards

### Required Handoff Elements
1. **Active Incidents**: Currently broken systems with severity and status
2. **Ongoing Investigations**: Issues being debugged with next steps
3. **Recent Changes**: Deployments, config changes, infrastructure updates
4. **Known Issues**: Workarounds in place with ticket references
5. **Upcoming Events**: Scheduled maintenance, releases, expected load

### Handoff Document Structure

```markdown
# On-Call Handoff: [Team Name]

**Outgoing**: @name ([date] to [date])
**Incoming**: @name ([date] to [date])
**Handoff Time**: [ISO timestamp]

---

## Active Incidents

### [None | Incident Title] (SEV[1-4])
**Status**: [Investigating | Mitigating | Resolved]
**Impact**: [Specific user impact]
**Current State**: [What's happening now]
**Next Steps**: [Immediate actions needed]
**Resources**: [Dashboard links, Slack threads]

---

## Ongoing Investigations

### [Issue Title] (TICKET-ID)
**Status**: [Status]
**Started**: [Date]
**Impact**: [Impact level]
**Context**: [What you know]
**Next Steps**: [Action items]
**Resources**: [Links]

---

## Resolved This Shift

### [Issue Title] ([Date])
- **Duration**: [time]
- **Root Cause**: [Brief explanation]
- **Resolution**: [What fixed it]
- **Postmortem**: [Link]
- **Follow-up tickets**: [Links]

---

## Recent Changes

### Deployments
| Service | Version | Time | Notes |
|---------|---------|------|-------|
| ... | ... | ... | ... |

### Configuration Changes
- [Date]: [Change description]

### Infrastructure
- [Date]: [Infrastructure change]

---

## Known Issues & Workarounds

### [Issue Title]
**Issue**: [Description]
**Workaround**: [How to handle]
**Ticket**: [Link]

---

## Upcoming Events

| Date | Event | Impact | Contact |
|------|-------|--------|---------|
| ... | ... | ... | ... |

---

## Escalation Reminders

| Issue Type | First Escalation | Second Escalation |
|------------|------------------|-------------------|
| Payment | @payments-oncall | @payments-manager |
| Auth | @auth-oncall | @security-team |
| Database | @dba-team | @infra-manager |
| Unknown/severe | @engineering-manager | @vp-engineering |

---

## Quick Reference

### Common Commands
```bash
# Service health
kubectl get pods -A | grep -v Running

# Recent deployments
kubectl get events --sort-by='.lastTimestamp' | tail -20

# Database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"
```

### Important Links
- [Runbooks](https://...)
- [Service Catalog](https://...)
- [Incident Slack](https://...)
- [PagerDuty](https://...)

---

## Handoff Checklist

### Outgoing Engineer
- [x] Document active incidents
- [x] Document ongoing investigations
- [x] List recent changes
- [x] Note known issues
- [x] Add upcoming events
- [x] Sync with incoming engineer

### Incoming Engineer
- [ ] Read this document
- [ ] Join sync call
- [ ] Verify PagerDuty routing
- [ ] Verify Slack notifications
- [ ] Check VPN/access working
- [ ] Review critical dashboards
```

## Handoff Timing Standards

**Recommended**: 30 minutes overlap between shifts

```
Overlap Period:
├── 15 min: Outgoing writes handoff document
└── 15 min: Sync call with incoming

Incoming Preparation:
├── 15 min: Review handoff document
├── 15 min: Sync call with outgoing
└── 5 min: Verify alerting setup
```

## Incident Handoff Pattern (Mid-Incident)

When handing off during an active incident:

```markdown
# INCIDENT HANDOFF: [Incident Title]

**Incident Start**: [ISO timestamp]
**Current Status**: [Investigating | Mitigating | Recovering]
**Severity**: SEV[1-4]

---

## Current State
- Error rate: [X%] (direction: [increasing/decreasing/stable])
- Mitigation in progress: [What's being done]
- ETA to resolution: [Best estimate]

## What We Know
1. Root cause: [Known or suspected]
2. Triggered by: [Event that started it]
3. Contributing factors: [Other factors]

## What We've Done
- [Action 1 with timestamp]
- [Action 2 with timestamp]
- [Action 3 with timestamp]

## What Needs to Happen
1. [Immediate next step]
2. [Escalation trigger if needed]
3. [Post-recovery actions]

## Key People
- Incident Commander: @outgoing (handing off)
- Comms Lead: @person
- Technical Lead: @incoming

## Communication
- Status page: [Last update time]
- Customer support: [Notification status]
- Exec team: [Awareness status]

## Resources
- Incident channel: #inc-[date]-[name]
- Dashboard: [Link]
- Runbook: [Link]

---

**Incoming on-call (@name) - Please confirm you have:**
- [ ] Joined incident channel
- [ ] Access to dashboards
- [ ] Understand current state
- [ ] Know escalation path
```

## Async Handoff Pattern (Quick Handoff)

For routine handoffs with minimal activity:

```markdown
# Quick Handoff: @outgoing → @incoming

## TL;DR
- [Status summary: No active incidents | X investigations ongoing]
- [Key watch item]
- [Upcoming event to monitor]

## Watch List
1. [Item 1 with why it needs attention]
2. [Item 2 with why it needs attention]

## Recent
- [Recent change 1]
- [Recent change 2]

## Coming Up
- [Date Time] - [Event] ([Expected impact])

## Questions?
I'll be available on Slack until [time] today.
```

## Pre-Shift Checklist

**Before your shift starts:**

```markdown
## Pre-Shift Checklist

### Access Verification
- [ ] VPN working
- [ ] kubectl access to all clusters
- [ ] Database read access
- [ ] Log aggregator access (Splunk/Datadog)
- [ ] PagerDuty app installed and logged in

### Alerting Setup
- [ ] PagerDuty schedule shows you as primary
- [ ] Phone notifications enabled
- [ ] Slack notifications for incident channels
- [ ] Test alert received and acknowledged

### Knowledge Refresh
- [ ] Review recent incidents (past 2 weeks)
- [ ] Check service changelog
- [ ] Skim critical runbooks
- [ ] Know escalation contacts

### Environment Ready
- [ ] Laptop charged and accessible
- [ ] Phone charged
- [ ] Quiet space available for calls
- [ ] Secondary contact identified (if traveling)
```

## During-Shift Daily Routine

```markdown
## Daily On-Call Routine

### Morning (start of day)
- [ ] Check overnight alerts
- [ ] Review dashboards for anomalies
- [ ] Check for any P0/P1 tickets created
- [ ] Skim incident channels for context

### Throughout Day
- [ ] Respond to alerts within SLA
- [ ] Document investigation progress
- [ ] Update team on significant issues
- [ ] Triage incoming pages

### End of Day
- [ ] Hand off any active issues
- [ ] Update investigation docs
- [ ] Note anything for next shift
```

## Post-Shift Checklist

**After your shift ends:**

```markdown
## Post-Shift Checklist
- [ ] Complete handoff document
- [ ] Sync with incoming on-call
- [ ] Verify PagerDuty routing changed
- [ ] Close/update investigation tickets
- [ ] File postmortems for any incidents
- [ ] Take time off if shift was stressful
```

## Escalation Guidelines

### When to Escalate

```markdown
## Escalation Triggers

### Immediate Escalation
- SEV1 incident declared
- Data breach suspected
- Unable to diagnose within 30 min
- Customer or legal escalation received

### Consider Escalation
- Issue spans multiple teams
- Requires expertise you don't have
- Business impact exceeds threshold
- You're uncertain about next steps

### How to Escalate
1. Page the appropriate escalation path
2. Provide brief context in Slack
3. Stay engaged until escalation acknowledges
4. Hand off cleanly, don't just disappear
```

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Async handoff only | Context loss causes incidents | Always do sync call (15 min minimum) |
| No documentation | New on-call blind | Write detailed handoff document |
| Skipping verification | Alerting broken during incident | Test alerts before incidents |
| Hero culture | Burnout and poor decisions | Escalate early when uncertain |
| Blame individuals | Fear culture, hidden issues | Focus on system improvements |
| No postmortems | Repeat incidents | Write postmortem for every incident |
| Disappeared after handoff | New on-call struggles alone | Stay available for questions |

## Iron Laws

### 1. The Documentation Law
```
NO HANDOFF WITHOUT WRITTEN DOCUMENTATION
```
Sync call alone is insufficient. Document everything.

### 2. The Escalation Law
```
ESCALATE WITHIN 30 MINUTES IF STUCK
```
Spending hours stuck helps no one. Escalate early.

### 3. The Blameless Law
```
NO BLAME IN INCIDENT RESPONSE OR POSTMORTEMS
```
Focus on systems, not people. Blame prevents learning.

### 4. The Testing Law
```
TEST ALERTING SETUP BEFORE SHIFT, NOT DURING INCIDENT
```
Verify everything works while calm, not under stress.

## Integration Points

### Agents Using This Skill
- **devops-troubleshooter** (primary): On-call incident response
- **incident-responder**: Structured incident management
- **devops**: Operational procedures
- **sre-engineer**: SLO tracking and on-call rotation

### Related Skills
- **incident-runbook-templates**: Runbook creation for known issues
- **postmortem-writing**: Post-incident analysis and learnings
- **sentry-monitoring**: Error tracking and alerting

### Workflows
- **incident-response-workflow.md**: Structured incident handling
- **operational-procedures.md**: Standard operating procedures

## Related References

- `.claude/skills/on-call-handoff-patterns/SKILL.md` - Complete skill documentation
- [Google SRE - Being On-Call](https://sre.google/sre-book/being-on-call/)
- [PagerDuty On-Call Guide](https://www.pagerduty.com/resources/learn/on-call-management/)
