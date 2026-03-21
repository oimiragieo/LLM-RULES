<!-- Agent: developer | Task: #task-26 | Session: 2026-03-15 -->

# Research Report: task-manager Agent

## Executive Summary

The task-manager agent fills a post-pipeline hygiene role in the Agent Studio framework — auditing task state, verifying framework health invariants, and creating fix tasks for violations. Existing specialized agents (ecosystem-auditor, reflection-agent) provide strong structural templates for this pattern. The agent should use haiku model (lightweight audit role), TaskList/TaskGet/TaskCreate tools, and follow the evidence-first audit methodology used by ecosystem-auditor.

## Research Methodology

| # | Query | Source |
|---|-------|--------|
| 1 | Existing specialized agent patterns | `.claude/agents/specialized/ecosystem-auditor.md` |
| 2 | Task protocol and audit patterns | `.claude/agents/core/reflection-agent.md` |
| 3 | Framework health check locations | `.claude/settings.json`, `.claude/hooks/` glob |

## Existing Codebase Patterns

**Similar Artifacts Found:**

- `.claude/agents/specialized/ecosystem-auditor.md` — proactive auditor with TaskCreate for evolution gaps; uses `context_strategy: lazy_load`, `model: sonnet`, maxTurns: 25, `verified: true`
- `.claude/agents/core/reflection-agent.md` — quality assessor with RECE loop; uses `model: sonnet`, `context_strategy: lazy_load`, TaskUpdate/TaskCreate tools, version: 1.1.0

**Conventions Identified:**

- Naming: `lowercase-kebab.md` in appropriate category
- Frontmatter: `verified: true`, `lastVerifiedAt`, `version`, `context_strategy: lazy_load`, `model`, `maxTurns`, `permissionMode: default`
- Structure: `<!-- agent-template-contract:v1 -->`, Enforcement Hooks table, Core Persona, Workflow phases, Memory Protocol
- Tools: audit-only agents use `Read, Bash, TaskList, TaskGet, TaskCreate, TaskUpdate, MemoryRecord` (no Write/Edit — they create tasks rather than fix directly)
- Output: Agent creates fix TaskCreate entries, does not self-modify framework files

## Best Practices Identified

| # | Practice | Source | Confidence |
|---|----------|--------|------------|
| 1 | Use TaskCreate for CRITICAL/HIGH issues rather than self-fixing | ecosystem-auditor pattern | High |
| 2 | Verify via TaskGet before closing any task | reflection-agent TaskUpdate protocol | High |
| 3 | Never close blindly — always read task details first | task-tracking.md rules | High |
| 4 | Haiku model appropriate for lightweight audit/hygiene agents | model-selection ADR-075 | High |
| 5 | context_strategy: lazy_load for agents that don't need full context upfront | ecosystem-auditor, reflection-agent | High |

## Design Decisions

| Decision | Rationale | Source | Alternatives Considered |
|----------|-----------|--------|------------------------|
| model: haiku | Audit/hygiene role — no complex reasoning needed, reduce cost | ADR-075 model selection | sonnet (overkill for list/check ops) |
| tools: Read + Bash + TaskUpdate + TaskList + TaskGet + TaskCreate + MemoryRecord | Needs task inspection (Get/List), issue reporting (Create), framework file reads (Read, Bash for hooks check), no direct file writes | ecosystem-auditor pattern | Adding Write (rejected: audit agents don't fix directly) |
| 8-phase workflow | Matches complexity: audit → check → compliance → create fixes → close stale → re-audit → report | reflection-agent RECE loop pattern | Simpler 4-phase (rejected: misses agent compliance audit) |
| NEVER close blindly rule | Prevents accidental loss of in-progress work; TaskGet must confirm before close | task-tracking iron laws | Auto-close on time threshold (rejected: too risky) |

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| False positive stale task close | HIGH — destroys in-progress work | Medium | Always TaskGet before close; only close if truly orphaned |
| Duplicate fix task creation | Medium — clutters task list | Low | Check TaskList for existing fix tasks before creating |
| Reflection queue buildup ignored | HIGH — breaks Step 0 enforcement | Low | Explicit check in Phase 2; always create fix task |

## Recommended Implementation

**File Location**: `.claude/agents/specialized/task-manager.md`
**Category**: specialized (post-pipeline hygiene)
**Invoke via**: `agent-creator` skill

**Workflow Phases:**
1. Phase 1: Task System Audit (TaskList + TaskGet on in_progress/pending tasks)
2. Phase 2: Framework Rules Checklist (9 hooks, reflection workflow, stale tasks, heartbeat, registry count 74+, integration queue)
3. Phase 3: Agent Compliance Audit (verify TaskUpdate protocol adherence)
4. Phase 4: Create Fix Tasks (TaskCreate for each CRITICAL/HIGH issue)
5. Phase 5: Close Stale Tasks (verify via TaskGet before closing)
6. Phase 6: Re-audit and Report

## Research Handoff to: agent-creator

**Report Location**: `.claude/context/artifacts/research-reports/task-manager-agent-research-2026-03-15.md`

**Summary**: task-manager is a lightweight (haiku) post-pipeline hygiene agent that audits task state and framework health invariants, creates fix tasks for violations, and closes truly stale orphaned tasks. Pattern follows ecosystem-auditor for audit-without-fix discipline.

**Critical Decisions:**
1. model: haiku (lightweight audit role)
2. No Write/Edit tools — creates TaskCreate entries instead of self-fixing
3. NEVER close blindly — always TaskGet to verify before closing

**Proceed with creation**: YES
**Confidence Level**: High
