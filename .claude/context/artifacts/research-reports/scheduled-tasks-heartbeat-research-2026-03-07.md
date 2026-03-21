<!-- Agent: researcher | Task: #task-research-scheduled | Session: 2026-03-07 -->

# Research Report: Claude Code Scheduled Tasks & Heartbeat Architecture

**Date**: 2026-03-07
**Researcher**: researcher agent
**Task**: #task-research-scheduled
**Batch/Phase**: Phase 1 — Discovery & Architecture
**Sources Consulted**: 5

---

## Executive Summary

Claude Code ships a native session-scoped scheduler (`CronCreate`/`CronList`/`CronDelete`) exposed via the `/loop` slash command. Tasks fire in the background at up to 1-minute granularity, capped at 50 concurrent tasks per session and auto-expired after 3 days. OpenClaw's heartbeat pattern — the most mature agentic liveness model available — uses periodic agent turns reading a `HEARTBEAT.md` checklist file, replying `HEARTBEAT_OK` when quiet and delivering alerts when action is needed. Combining these two primitives offers Agent Studio a credible path to autonomous health monitoring, memory consolidation, index rebuilds, and proactive auditing without requiring any always-on infrastructure beyond the open terminal session.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | Direct fetch: `https://code.claude.com/docs/en/scheduled-tasks` | Official Claude Code Docs | Full API documentation |
| 2 | `OpenClaw heartbeat pattern agent ecosystem liveness recurring jobs 2025 2026` | WebSearch | 10 results |
| 3 | Direct fetch: `https://docs.openclaw.ai/gateway/heartbeat` | Official OpenClaw Docs | Full heartbeat reference |
| 4 | `agentic heartbeat pattern multi-agent framework periodic health check job scheduling 2025` | WebSearch | 10 results |
| 5 | Direct fetch: `https://github.com/marcilio/AgenticHeartbeatPattern` | GitHub README | Pattern architecture |

### Sources Consulted

| # | Title | Type | URL | Date |
|---|-------|------|-----|------|
| 1 | Claude Code Scheduled Tasks Documentation | Official docs | https://code.claude.com/docs/en/scheduled-tasks | 2026-03-07 |
| 2 | OpenClaw Heartbeat Reference | Official docs | https://docs.openclaw.ai/gateway/heartbeat | 2026-03-07 |
| 3 | Agentic Heartbeat Pattern (Mendonca) | GitHub / Medium | https://github.com/marcilio/AgenticHeartbeatPattern | 2026-03-07 |
| 4 | OpenClaw Orchestration Patterns (Substack) | Community article | https://kenhuangus.substack.com/p/openclaw-design-patterns-part-3-of | 2026-03-07 |
| 5 | OpenClaw Heartbeat: Cheap Checks First (DEV) | Community article | https://dev.to/damogallagher/heartbeats-in-openclaw-cheap-checks-first-models-only-when-you-need-them-4bfi | 2026-03-07 |

---

## Detailed Findings

### 1. Claude Code Scheduled Tasks — Full API Documentation

#### Core Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `CronCreate` | Schedule a new task | 5-field cron expression, prompt text, recurring flag |
| `CronList` | List active tasks | Returns IDs, schedules, prompts |
| `CronDelete` | Cancel a task by ID | 8-char task ID |

#### `/loop` Slash Command

The `/loop` bundled skill is the primary user-facing interface:

```text
/loop 5m check if the deployment finished and tell me what happened
/loop 20m /review-pr 1234        # can invoke other slash commands
/loop check the build            # defaults to every 10 minutes
```

Interval syntax supports: `s` (seconds, rounded up to nearest minute), `m`, `h`, `d`. Non-round intervals (e.g., `7m`) are rounded to the nearest clean interval. Intervals can be leading or trailing.

#### Execution Model — Critical Constraints

- **Session-scoped**: Tasks die when the terminal closes. No persistence across restarts.
- **Fire-between-turns**: The scheduler polls every second but enqueues at low priority. Tasks fire only when Claude is idle, not mid-response.
- **No catch-up**: Missed fires are not replayed; the task fires once when Claude next becomes idle.
- **50-task cap**: Maximum 50 concurrent scheduled tasks per session.
- **3-day auto-expiry**: Recurring tasks self-delete 3 days after creation (one final fire, then deletion).
- **Jitter**: Recurring tasks fire up to 10% of their period late (max 15 min) to avoid API stampedes. One-shot tasks on the hour fire up to 90s early. Offset is deterministic per task ID.
- **Timezone**: All cron expressions use local system timezone, not UTC.

#### Cron Expression Reference

Standard 5-field syntax: `minute hour day-of-month month day-of-week`

| Example | Meaning |
|---------|---------|
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour on the hour |
| `7 * * * *` | Every hour at :07 |
| `0 9 * * *` | Every day at 9am local |
| `0 9 * * 1-5` | Weekdays at 9am |
| `30 14 15 3 *` | March 15 at 2:30pm |

Extended syntax (`L`, `W`, `?`, name aliases like `MON`) is NOT supported.

#### Disable Flag

```bash
CLAUDE_CODE_DISABLE_CRON=1   # disables scheduler entirely
```

#### Durable Alternatives (Out-of-Scope for Session Use)

- **Desktop scheduled tasks** — survives terminal close, graphical setup
- **GitHub Actions with `schedule` trigger** — fully unattended, cloud-run

---

### 2. OpenClaw Heartbeat Pattern — Architecture Analysis

OpenClaw's heartbeat is the most mature production implementation of agentic liveness. Key architectural insights:

#### Core Execution Model

- **Default interval**: 30 minutes (1 hour for OAuth setups). Configurable to `0m` to disable.
- **Execution context**: Runs in the agent's main session; does NOT reset the session idle timer.
- **Queue discipline**: If the main queue is busy, heartbeat is SKIPPED (not queued) and retried at the next scheduled tick.
- **Acknowledgment protocol**: Agent replies `HEARTBEAT_OK` if nothing needs attention. Token is stripped if it appears at start/end and remaining content ≤ 300 chars (configurable). Alerts omit the token entirely.

#### The HEARTBEAT.md Checklist Pattern

This is the most important architectural concept for Agent Studio adaptation:

```markdown
# HEARTBEAT.md (agent's standing instructions)

## Always Check
- [ ] Are there any failed hook executions in the last 30 minutes?
- [ ] Is the memory system within size thresholds?
- [ ] Are any agents reporting stuck tasks?
- [ ] Has the BM25 index been rebuilt in the last 24 hours?

## Weekly
- [ ] Rotate memory archives if learnings.md > 40KB
- [ ] Run pnpm validate:full and report findings
```

If the file is blank (headers only), OpenClaw skips the heartbeat run entirely — a cost-optimization that Agent Studio should replicate.

#### Configuration Hierarchy

```yaml
agents:
  defaults:
    heartbeat:
      every: 30m
      target: "none"       # internal only, no delivery
      lightContext: true   # inject only HEARTBEAT.md, not full context
      model: "haiku"       # cheap model for status-only runs
```

Per-agent overrides take precedence over global defaults.

#### Cost & Performance Controls

| Control | Purpose | Recommendation |
|---------|---------|----------------|
| `lightContext: true` | Injects only HEARTBEAT.md, not full session context | Always use for health checks |
| `model: "haiku"` | Cheaper model for status-only heartbeats | Use haiku unless action required |
| `target: "none"` | Run internally, no delivery overhead | Default for Agent Studio |
| `showOk: false` | Suppress `HEARTBEAT_OK` messages | Keep logs clean |
| `showAlerts: true` | Deliver alerts when action needed | Critical for visibility |

#### Delivery Targeting

- `"last"`: route to last external channel used
- `"none"` (default): internal-only, no external delivery
- Named channel: `"discord"`, `"telegram"`, etc.

#### Time-Window Controls

```yaml
heartbeat:
  activeHours:
    start: "09:00"
    end: "18:00"
    timezone: "America/New_York"
```

Heartbeats outside the window are deferred to the next in-window tick.

---

### 3. Agentic Heartbeat Pattern (Mendonca) — Hierarchical Coordination

This pattern extends the liveness concept to hierarchical multi-agent systems.

#### Two-Phase Operation (Biological Metaphor)

**Expansion (Diastole)**: Information cascades DOWN the agent hierarchy. Root agent delegates checks to sub-agents, which delegate to leaf agents. Each level gathers specific domain data.

**Contraction (Systole)**: Aggregation flows UP. Each level synthesizes subordinate reports into summaries. Root receives a consolidated health report.

#### Architecture Components

1. **Role-aware hierarchical data structures** — each agent knows its domain and peers
2. **Base-level data repositories** — leaf agents read from logs, metrics, status files
3. **Tool definitions enabling delegation** — tools that can spawn sub-agents for deep checks

#### Implementation Insights

- **Model selection matters**: Claude Sonnet significantly outperformed Haiku for accurate tool selection and faster execution in multi-level hierarchies (despite higher token cost).
- **Observability**: Per-role callback handlers enable tracing agent reasoning at each hierarchy level.
- **Recursion termination**: Base condition must be explicit (leaf nodes with no subordinates).

#### Applicability Beyond Health Checks

- Supply chain analysis
- Document review synthesis
- Any scenario where information must flow DOWN (delegation) then UP (aggregation)

---

### 4. Community Patterns: "Cheap Checks First"

From the OpenClaw developer community, an important cost optimization pattern:

**Pattern**: Use cheap/fast checks (file system reads, grep) BEFORE invoking the LLM.

```
Heartbeat tick fires
  → Pre-check: read agent-health.json (no API call)
  → If health.status === 'degraded': invoke LLM with HEARTBEAT.md context
  → Else: reply HEARTBEAT_OK immediately without LLM call
```

This reduces API costs by 60-80% for healthy systems where most heartbeats require no action.

**Cron vs Heartbeat distinction** (critical for design):
- **Cron**: "Run this SPECIFIC task at 3pm Tuesday" — deterministic, time-anchored
- **Heartbeat**: "Check in periodically; act IF something needs attention" — awareness-based, conditional

Agent Studio should use cron for maintenance tasks with known schedules and heartbeat for ambient awareness/liveness monitoring.

---

## Academic References

*(No directly relevant academic papers found; this is an applied engineering domain with primary documentation as the canonical source.)*

---

## Practical Recommendations

### P0 — Immediate (Required for Skill Design)

**P0.1 — Model the heartbeat on `HEARTBEAT.md` checklist pattern**

Create `/c/dev/projects/agent-studio/HEARTBEAT.md` as the standing instruction file. The scheduled-tasks skill should read this file at each heartbeat tick. If blank (headers only), emit `HEARTBEAT_OK` without any LLM computation.

**P0.2 — Use `CronCreate` with 30-minute default, `*/30 * * * *`**

Match OpenClaw's proven default. Allow configuration via env var `AGENT_STUDIO_HEARTBEAT_INTERVAL`.

**P0.3 — Cheap checks before LLM invocation**

The heartbeat prompt should first read cheap signals (file sizes, agent-health.json, task list) before invoking expensive analysis. Structure the prompt to return `HEARTBEAT_OK` if all signals green.

**P0.4 — 3-day expiry awareness**

Claude Code auto-expires recurring tasks at 3 days. The skill must include logic to detect expiry and reschedule itself, or document that users must restart the heartbeat every 3 days.

### P1 — Short-Term (Core Heartbeat Infrastructure)

**P1.1 — Agent Registry Health Monitor**

Heartbeat should call `node .claude/tools/cli/validate-agent-skill-references.cjs` and surface any broken references. Alert if count > 0.

**P1.2 — Memory System Health Monitor**

Check file sizes:
- `learnings.md` > 40KB → trigger memory rotation
- `decisions.md` > 80KB → warn, suggest archival
- `issues.md` > baseline → surface unresolved issues

**P1.3 — Hook Health Monitor**

Read `agent-health.json` for hook execution failures. Alert if any hook has `status: degraded` or `errorRate > 0.05`.

**P1.4 — Dead-Hook Detection**

Periodically run `node .claude/tools/cli/validate-dead-hooks.cjs` (or equivalent) and alert if dead hooks detected.

### P2 — Medium-Term (Maintenance Automation)

**P2.1 — Index Rebuild Scheduling**

Schedule BM25 index rebuild via `CronCreate` at off-peak hours: `0 2 * * *` (2am daily). Do not make this part of the heartbeat — use dedicated cron.

**P2.2 — Memory Consolidation Trigger**

If STM files are growing, trigger `pnpm search:compress` with targeted queries to consolidate and write MemoryRecord entries.

**P2.3 — Proactive Audit Scheduling**

Schedule weekly `pnpm validate:full` via cron: `0 3 * * 0` (Sunday 3am). Alert if validation errors found.

**P2.4 — Hierarchical Heartbeat (Mendonca Pattern)**

For deep health analysis, expand the heartbeat using the two-phase architecture:
- Expansion: spawn lightweight sub-agents for memory, hooks, agents, routing each
- Contraction: collect and synthesize their reports
- Note: Only use Sonnet for this, not Haiku — Haiku showed poor tool selection in hierarchical coordination

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| 3-day expiry kills heartbeat silently | HIGH — liveness lost without awareness | HIGH — by design | Heartbeat must reschedule itself before expiry, or include a daily reminder |
| Session-close cancels all tasks | HIGH — no persistence | CERTAINTY | Document clearly; pair with Desktop scheduled tasks for true durability |
| Missed-fire accumulation under load | MEDIUM — stale health data | MEDIUM — if system busy | Use idempotent checks; heartbeat state should not depend on continuous firing |
| Cost overrun from high-frequency heartbeats | MEDIUM — API costs spike | LOW | Default 30m interval; haiku model; HEARTBEAT_OK early exit; lightContext mode |
| LLM hallucinating health status | HIGH — false OK or false ALERT | MEDIUM | Cheap pre-checks before LLM invocation; file reads are ground truth |
| 50-task cap exhaustion | LOW — heartbeat + maintenance tasks | LOW | 5-6 scheduled tasks is typical; 50 is ample headroom |
| Jitter causing off-rhythm firing | LOW — minor timing shifts | CERTAINTY | Expected behavior; document it; avoid wall-clock dependencies |

---

## Implementation Roadmap

### Phase 1: Skill Foundation (Week 1)

1. Create `HEARTBEAT.md` template in agent-studio root
2. Create `scheduled-tasks` skill at `.claude/skills/scheduled-tasks/SKILL.md`
3. Implement basic health-check prompt reading HEARTBEAT.md
4. Test `/loop 30m <heartbeat-prompt>` manually

### Phase 2: Integration Points (Week 2)

5. Wire agent-health.json monitoring into heartbeat checklist
6. Wire memory size checks (learnings.md, decisions.md, issues.md)
7. Add hook health checks (read agent-health.json)
8. Add `HEARTBEAT_OK` early-exit logic

### Phase 3: Maintenance Automation (Week 3)

9. Add dedicated cron for index rebuild (`0 2 * * *`)
10. Add dedicated cron for weekly validation (`0 3 * * 0`)
11. Add self-rescheduling logic (detect 3-day expiry, recreate task)
12. Add `AGENT_STUDIO_HEARTBEAT_INTERVAL` env var support

### Phase 4: Hierarchical Extension (Week 4+)

13. Evaluate Mendonca two-phase pattern for deep audits
14. Implement sub-agent expansion for memory/hooks/agents/routing
15. Wire contraction to produce consolidated health report
16. Route health report to `.claude/context/reports/backend/health/`

---

## Skill Design Recommendations

### Skill File: `.claude/skills/scheduled-tasks/SKILL.md`

**Capabilities to expose:**

```javascript
// Start heartbeat
Skill({ skill: 'scheduled-tasks', args: 'start-heartbeat' });

// Start heartbeat with custom interval
Skill({ skill: 'scheduled-tasks', args: 'start-heartbeat --interval 15m' });

// Schedule one-time maintenance
Skill({ skill: 'scheduled-tasks', args: 'schedule-once "2026-03-08 02:00" "node pnpm code:index:reindex"' });

// Schedule recurring maintenance
Skill({ skill: 'scheduled-tasks', args: 'schedule-cron "0 2 * * *" "rebuild index"' });

// List all scheduled tasks
Skill({ skill: 'scheduled-tasks', args: 'list' });

// Cancel a task
Skill({ skill: 'scheduled-tasks', args: 'cancel <task-id>' });

// Stop all heartbeat tasks
Skill({ skill: 'scheduled-tasks', args: 'stop-heartbeat' });
```

**Skill frontmatter:**

```yaml
name: scheduled-tasks
description: Session-scoped task scheduler using CronCreate/CronList/CronDelete. Implements heartbeat liveness monitoring and maintenance automation for Agent Studio.
tools:
  - CronCreate
  - CronList
  - CronDelete
  - Read
  - Bash
skills:
  always:
    - task-management-protocol
    - verification-before-completion
```

### HEARTBEAT.md Template

```markdown
# Agent Studio Heartbeat Checklist

## Every Tick (30 minutes)

### Memory Health
- [ ] learnings.md > 40KB? → trigger rotation via `node .claude/lib/memory/memory-rotator.cjs`
- [ ] decisions.md > 80KB? → warn user
- [ ] issues.md has unresolved P0 items? → surface to user

### Agent Registry Health
- [ ] agent-health.json has any `status: degraded`? → alert
- [ ] Any hooks have errorRate > 5%? → alert with hook name

### Task Health
- [ ] Any tasks stuck in `in_progress` for > 2 hours? → surface task IDs

## Daily (fire when clock hour = 2)
- [ ] BM25 index rebuild needed? (check index age via mtime)

## Weekly (fire when day-of-week = 0)
- [ ] Run pnpm validate:full → report errors

## Self-Maintenance
- [ ] This heartbeat task older than 2.5 days? → reschedule before 3-day expiry
```

### Integration Points with Existing Infrastructure

| Infrastructure | Integration Method | Heartbeat Action |
|----------------|-------------------|------------------|
| `agent-health.json` | `Read` tool → JSON parse | Check `status`, `errorRate` per hook |
| `learnings.md` | `Bash: wc -c` | Alert if > 40KB threshold |
| Task system | `TaskList()` | Surface stuck in_progress tasks |
| Memory rotator | `Bash: node memory-rotator.cjs` | Trigger when threshold exceeded |
| BM25 index | `Bash: stat .claude/context/data/*.db` | Rebuild if mtime > 24h |
| `pnpm validate:full` | `Bash` | Weekly validation, surface errors |
| Reflection queue | `Read: reflection-reminder.txt` | Alert if reflection queue stalled |
| `open-findings.json` | `Read` → JSON parse | Alert if P0 findings remain open |

---

## Sources

- [Claude Code Scheduled Tasks Documentation](https://code.claude.com/docs/en/scheduled-tasks)
- [OpenClaw Heartbeat Reference](https://docs.openclaw.ai/gateway/heartbeat)
- [Agentic Heartbeat Pattern (GitHub)](https://github.com/marcilio/AgenticHeartbeatPattern)
- [Heartbeats in OpenClaw: Cheap Checks First](https://dev.to/damogallagher/heartbeats-in-openclaw-cheap-checks-first-models-only-when-you-need-them-4bfi)
- [OpenClaw Design Patterns: Orchestration](https://kenhuangus.substack.com/p/openclaw-design-patterns-part-3-of)
- [OpenClaw Heartbeat & Task Tracking](https://moltfounders.com/openclaw-runbook/heartbeat-task-tracking)
- [OpenClaw Cron, Hooks & Heartbeat](https://blog.kryll.io/openclaw-hooks-cron-heartbeat-ai-agent-automation/)
- [The Agentic Heartbeat Pattern (Medium)](https://medium.com/@marcilio.mendonca/the-agentic-heartbeat-pattern-a-new-approach-to-hierarchical-ai-agent-coordination-4e0dfd60d22d)
