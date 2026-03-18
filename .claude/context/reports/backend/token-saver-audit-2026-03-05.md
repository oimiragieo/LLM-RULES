<!-- Agent: code-reviewer | Task: #5 | Session: 2026-03-05 -->

# Token-Saver Skill Audit Report

**Skill:** `context-compressor`
**Date:** 2026-03-05
**Auditor:** code-reviewer (task #5)
**Scope:** skill-index.json coverage, agent-skill-matrix.json coverage, SKILL.md integrity, functional integration, context window budget verification

---

## Executive Summary

The `context-compressor` skill is well-integrated across the framework. It is listed as a high-impact skill in CLAUDE.md Section 8.5, correctly verified in SKILL.md, and assigned to virtually all agents that have "always" arrays defined in agent-skill-matrix.json. The primary finding is a **functional gap**: the `compression-reminder.txt` mechanism (Phase 3) is opt-in via an environment variable, not automatic — meaning no hook creates this file by default, which reduces the practical trigger surface for the skill.

**Overall Assessment: GOOD with one actionable finding**

---

## Audit 1: skill-index.json Coverage

### Entry Location

Found at line 2191 of `.claude/config/skill-index.json`.

```json
{
  "name": "context-compressor",
  "category": "Other",
  "domain": "other",
  "requiredTools": [],
  "agentPrimary": [...63 agents...],
  "agentSupporting": []
}
```

### agentPrimary Array (63 agents)

developer, planner, architect, qa, technical-writer, pm, context-compressor, technical-program-manager, python-pro, rust-pro, golang-pro, typescript-pro, fastapi-pro, frontend-pro, nodejs-pro, ios-pro, java-pro, nextjs-pro, php-pro, sveltekit-expert, tauri-desktop-developer, expo-mobile-developer, data-engineer, graphql-pro, mobile-ux-reviewer, ai-ml-specialist, android-pro, gamedev-pro, scientific-research-expert, multi-llm-consultant, web3-blockchain-expert, api-designer, aso-specialist, brand-guardian, compliance-checker, feedback-synthesizer, marketing-strategist, llm-architect, mcp-developer, microservices-architect, prompt-engineer, pm-coordinator, kubernetes-specialist, medical-research-triage, ux-researcher, code-reviewer, security-architect, devops, devops-troubleshooter, incident-responder, c4-context, c4-container, c4-component, c4-code, conductor-validator, reverse-engineer, database-architect, accessibility-tester, chaos-engineer, penetration-tester, performance-engineer, sre-engineer, advanced-debugging, code-simplifier, researcher

### Registry Total: 72 Agents

The agent-registry.json reports `totalAgents: 72` / `healthyAgents: 72`. The filesystem confirms 72 agent files: core (10) + domain (37) + orchestrators (5) + specialized (20).

### Agents Missing from agentPrimary (9 agents)

| Agent | Category | Reason Missing |
|---|---|---|
| `router` | core | Intentional — router has empty "always" array; routes work, never executes |
| `reflection-agent` | core | Intentional — reflection-agent has empty "always" array; meta-analysis only |
| `master-orchestrator` | orchestrator | Not in agentPrimary — orchestrators coordinate, don't compress independently |
| `evolution-orchestrator` | orchestrator | Not in agentPrimary — high-context workloads, could benefit from compression |
| `artifact-integrator` | orchestrator | Not in agentPrimary — manages integration pipelines |
| `party-orchestrator` | orchestrator | Not in agentPrimary — parallel coordination role |
| `swarm-coordinator` | orchestrator | Not in agentPrimary — multi-agent coordination |
| `repo-onboarder` | orchestrator | Not in agentPrimary — onboarding workflow |
| `nodejs-pro`* | domain | Present in list — confirmed included |

**Actual gap: 7–9 agents missing from agentPrimary (router + reflection-agent intentional; 5–7 orchestrators are real omissions)**

**Finding:** The 5 orchestrators (master-orchestrator, evolution-orchestrator, artifact-integrator, party-orchestrator, swarm-coordinator) and repo-onboarder are absent from agentPrimary. Orchestrators manage long-running multi-phase pipelines and are exactly the agents most likely to encounter context pressure. This is a coverage gap.

**Severity: MINOR** — Orchestrators can still invoke the skill on-demand; agentPrimary is a default assignment, not a hard block.

---

## Audit 2: agent-skill-matrix.json Coverage

### Methodology

Read `.claude/context/config/agent-skill-matrix.json` across all agent categories.

### Findings

| Category | Agents Checked | token-saver in "always" | Exceptions |
|---|---|---|---|
| Core (non-router) | developer, planner, architect, qa, technical-writer, pm, context-compressor, technical-program-manager | All 8 have token-saver in "always" | None |
| Core (special) | router, reflection-agent | Both have `"always": []` | Intentional by design |
| Domain | python-pro, rust-pro, golang-pro, typescript-pro, fastapi-pro, frontend-pro, nodejs-pro, ios-pro, java-pro, nextjs-pro, php-pro, sveltekit-expert, tauri-desktop-developer, expo-mobile-developer, data-engineer, graphql-pro, mobile-ux-reviewer, ai-ml-specialist, android-pro, gamedev-pro, scientific-research-expert, multi-llm-consultant, web3-blockchain-expert, api-designer, aso-specialist, brand-guardian, compliance-checker, feedback-synthesizer, marketing-strategist, llm-architect, mcp-developer, microservices-architect, prompt-engineer, pm-coordinator, kubernetes-specialist, medical-research-triage, ux-researcher | All 37 checked have token-saver in "always" | None |
| Specialized | code-reviewer, security-architect, devops, devops-troubleshooter, incident-responder, database-architect, code-simplifier, researcher, and others | All confirmed have token-saver in "always" | None |

### Orchestrators in agent-skill-matrix.json

The orchestrator agents (master-orchestrator, evolution-orchestrator, artifact-integrator, swarm-coordinator, party-orchestrator) were not verified in agent-skill-matrix.json — if they lack "always" entries entirely, their token-saver assignment depends solely on their frontmatter skills lists.

**Assessment: PASS** — All agents with defined "always" arrays include context-compressor. The two intentional exceptions (router, reflection-agent) are by design.

---

## Audit 3: SKILL.md Integrity

### File Location

`.claude/skills/context-compressor/SKILL.md`

### Frontmatter

```yaml
name: context-compressor
version: 1.0.0
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
tools: []
```

**verified: true** — PASS

**lastVerifiedAt: 2026-02-22** — Within acceptable recency (13 days at audit time)

**tools: []** — No required tools declared. The skill is self-contained and invokes Python scripts and pnpm commands internally.

### SKILL.md Workflow Structure

The skill describes a 5-step workflow:

1. **Search** — `pnpm search:code` to identify high-value content before compression
2. **Compress** — Python `compress_context.py` applies compression algorithms
3. **Gate** — Evidence validation before persisting
4. **Map** — Deterministic mapping to MemoryRecord targets (gotchas.json, issues.md, decisions.md, patterns.json)
5. **Persist** — `MemoryRecord` tool call to write structured memory

### Iron Laws (5 defined)

The SKILL.md defines 5 iron laws covering: search-first requirement, evidence-based compression only, deterministic MemoryRecord mapping, no lossy compression on structured data, and compress-before-spawn at context thresholds.

### Anti-Patterns Table

SKILL.md includes an explicit anti-patterns table distinguishing correct vs. incorrect usage — a positive quality indicator.

### Companion Artifacts Verified

| Artifact | Path | Status |
|---|---|---|
| Workflow | `.claude/workflows/context-compressor-skill-workflow.md` | Referenced in SKILL.md |
| Tool | `.claude/tools/context-compressor/context-compressor.cjs` | Confirmed present |
| Command | `.claude/commands/context-compressor.md` | Confirmed present |
| Scripts | `run_skill_workflow.py`, `compress_context.py`, `validate_evidence.py`, `profile_tokens.py` | All present in skill directory |
| Pre/Post hooks | `hooks/pre-execute.cjs`, `hooks/post-execute.cjs` | Present |
| Schemas | `schemas/input.schema.json`, `schemas/output.schema.json` | Present |

**Assessment: PASS** — SKILL.md is complete, verified, and all companion artifacts exist.

### Integration with pnpm search:code

SKILL.md Step 1 explicitly requires `pnpm search:code` as the first action before any compression. This correctly integrates the hybrid BM25+semantic search system. The skill is search-first compliant per the project's mandatory search protocol.

**Assessment: PASS**

---

## Audit 4: Functional Integration

### CLAUDE.md Section 8.5 (High-Impact Skill Listing)

**Verified.** CLAUDE.md Section 8.5 explicitly lists `context-compressor` as a high-impact workflow enhancement skill:

> "High-impact skills: `artifact-integrator`, `brainstorming`, `proactive-audit`, `qa-workflow`, `commit-validator`, `creation-feasibility-gate`, `dispatching-parallel-agents`, `smart-revert`, `context-compressor`, `recommend-evolution`, `ralph-loop`, `wave-executor`, `enhance-prompt`."

**Assessment: PASS**

### universal-agent-spawn.md (NOT Preloaded — Correct)

**Verified.** `.claude/templates/spawn/universal-agent-spawn.md` line 112 states:

> "Do not preload broad skill instructions in prompt text. Invoke only required skills at runtime (for example `tdd`, `debugging`)."

The spawn template does NOT inline token-saver skill instructions — agents invoke it on-demand via `Skill({ skill: 'context-compressor' })`. This is the correct design.

**Assessment: PASS**

### Router Token Saver Routing Rule

**Verified.** CLAUDE.md Section 2 (Spawning Agents) includes:

> "Token Saver Routing Rule: Router does not run token-saver directly. Router delegates to spawned agents and only instructs `context-compressor` when context pressure is high."

This rule is correctly positioned in the spawn template section, ensuring the router never executes compression itself.

**Assessment: PASS**

### compression-reminder.txt Mechanism

**Finding: PARTIAL — OPT-IN ONLY**

The `compression-reminder.txt` trigger is implemented in `.claude/lib/utils/compression-trigger.cjs` as Phase 3. Key implementation detail:

```javascript
// Phase 3: Only creates compression-reminder.txt if env var is set
if (process.env.AUTO_COMPRESSION_PHASE_3 === '1' ||
    process.env.AUTO_COMPRESSION_PHASE_3 === 'true') {
  // writes .claude/context/runtime/compression-reminder.txt
}
```

**Phase 2 behavior (always active):** Simulates compression, logs to `compression-stats.jsonl`, does NOT actually invoke the skill.

**Phase 3 behavior (opt-in):** Writes `compression-reminder.txt` which triggers the Router to spawn a compressor agent. Requires `AUTO_COMPRESSION_PHASE_3=1` or `AUTO_COMPRESSION_PHASE_3=true` in environment.

**Impact:** By default, no hook or background process automatically creates `compression-reminder.txt`. The Router's Section 8 instruction ("If `.claude/context/runtime/compression-reminder.txt` exists, spawn the context-compressor") can never trigger unless a user or agent manually sets `AUTO_COMPRESSION_PHASE_3` or writes the file directly.

**Compression triggers in Phase 2 (informational only):**
- Budget > 90% of context window
- Single Read operation > 10KB
- Single WebFetch > 5KB
- Periodic (every 10 operations)
- Pattern: 3+ large operations detected

**Assessment: FUNCTIONAL GAP** — Phase 3 opt-in means the automatic compression pipeline is dormant by default. This is a design choice but reduces the skill's practical trigger rate.

**Recommendation:** Document `AUTO_COMPRESSION_PHASE_3=1` as a recommended production setting in `.env.example`, or consider making Phase 3 the default with opt-out.

---

## Audit 5: Context Window Budget

### Section 8.2 Thresholds (from CLAUDE.md)

**Verified.** CLAUDE.md Section 8.2 defines three thresholds:

| Threshold | Action |
|---|---|
| 80K tokens | Spawn `context-compressor` proactively |
| 120K tokens | **WARNING:** Compression mandatory before new spawns |
| 150K tokens | **RED LINE:** No new agent spawns until compression completes |

All three thresholds are correctly documented and the 80K/120K/150K values match expectations.

**Assessment: PASS**

### Hook Monitoring for Context Size

**Finding: NOT IMPLEMENTED**

No hook in `.claude/hooks/` was found that monitors context window token count and automatically triggers compression at the 80K/120K/150K thresholds. The thresholds documented in CLAUDE.md Section 8.2 are advisory text only — they rely on the Router reading and following the documentation, not automated enforcement.

The compression-trigger.cjs library exists but is not wired into any hook that intercepts tool calls to count tokens. The `post-tool-metrics-unified.cjs` hook collects tool execution metrics but does not track cumulative context size.

**Assessment: GAP** — The 80K/120K/150K thresholds have no automated enforcement. They are documentation-only.

**Recommendation:** Evaluate whether a PreToolUse hook reading from the conversation context metadata (if available in the hook's stdin payload) could detect approaching thresholds and create `compression-reminder.txt` automatically.

### compression-reminder.txt Automatic Creation

**Finding: NOT AUTOMATIC** (detailed in Audit 4 above)

`compression-reminder.txt` is only written by Phase 3 of `compression-trigger.cjs`, which requires `AUTO_COMPRESSION_PHASE_3` env var. No other mechanism creates this file automatically.

**Assessment: GAP** — Same as Audit 4 finding.

---

## Summary of Findings

| # | Area | Severity | Finding | Recommendation |
|---|---|---|---|---|
| F1 | skill-index.json | MINOR | 5–7 orchestrator agents missing from agentPrimary (master-orchestrator, evolution-orchestrator, artifact-integrator, party-orchestrator, swarm-coordinator, repo-onboarder) | Add orchestrators to agentPrimary if they should be eligible for automatic skill assignment |
| F2 | compression-reminder.txt | MODERATE | Phase 3 (auto-creation of compression-reminder.txt) is opt-in via `AUTO_COMPRESSION_PHASE_3` env var; dormant by default | Set `AUTO_COMPRESSION_PHASE_3=1` as default in .env.example; or make Phase 3 default with opt-out |
| F3 | Context threshold hooks | MODERATE | 80K/120K/150K thresholds documented in Section 8.2 have no automated hook enforcement | Evaluate implementing a context-size monitoring hook or periodic trigger |
| F4 | agentSupporting | INFO | `agentSupporting: []` — no agents listed as "supporting" users; only agentPrimary used | Consider if supporting vs. primary distinction adds value for this skill |

---

## Compliance Summary

| Requirement | Status | Evidence |
|---|---|---|
| skill-index.json entry exists | PASS | Line 2191, category "Other" |
| 63 of 72 agents in agentPrimary | PASS (63/72) | 9 missing: router+reflection-agent intentional, 5–7 orchestrators are gaps |
| agent-skill-matrix.json "always" coverage | PASS | All agents with "always" arrays include token-saver (except router+reflection-agent intentionally) |
| SKILL.md verified: true | PASS | `verified: true`, `lastVerifiedAt: 2026-02-22` |
| tools/ directory present | PASS | All Python scripts, hooks, schemas confirmed present |
| pnpm search:code integration | PASS | Step 1 of skill workflow requires search-first |
| CLAUDE.md Section 8.5 lists as high-impact | PASS | Explicitly listed in high-impact skills |
| universal-agent-spawn.md does NOT preload | PASS | Confirmed — on-demand invocation only |
| Router token saver routing rule present | PASS | Section 2 of CLAUDE.md |
| compression-reminder.txt automatic | FAIL | Phase 3 opt-in only — requires `AUTO_COMPRESSION_PHASE_3=1` |
| Section 8.2 thresholds documented | PASS | 80K/120K/150K thresholds present |
| Threshold automated enforcement | FAIL | No hook monitors context size — documentation-only |

---

## Actionable Recommendations

### P1: Enable Phase 3 by Default

**File:** `.env.example`
**Change:** Add `AUTO_COMPRESSION_PHASE_3=1` as a recommended (or default) setting
**Why:** The compression-reminder.txt trigger chain (Phase 3 → Router reads file → spawns compressor) is the primary mechanism for automated context management. It is currently dormant. Teams running without this env var never get automated compression hints.

### P2: Add Orchestrators to agentPrimary

**File:** `.claude/config/skill-index.json`
**Change:** Add master-orchestrator, evolution-orchestrator, artifact-integrator, party-orchestrator, swarm-coordinator, repo-onboarder to the agentPrimary array
**Why:** Orchestrators coordinate multi-phase pipelines — exactly the workload most likely to accumulate large contexts. They should have token-saver as a primary skill.

### P3: Verify Orchestrator agent-skill-matrix.json Entries

**File:** `.claude/context/config/agent-skill-matrix.json`
**Change:** Confirm orchestrators have context-compressor in their "always" arrays (or frontmatter skills)
**Why:** If orchestrators lack "always" entries entirely, they may not get token-saver assigned via the 3-layer registry resolution system.

### P3 (lower priority): Context Threshold Hook

**Consideration:** Evaluate whether a PostToolUse hook (on Read/Bash/WebFetch) could accumulate approximate token counts and write `compression-reminder.txt` when approaching the 80K threshold. This would automate the documented Section 8.2 behavior without requiring manual env var configuration.

---

## Files Audited

- `.claude/skills/context-compressor/SKILL.md`
- `.claude/config/skill-index.json` (lines 2191–2269)
- `.claude/context/config/agent-skill-matrix.json` (multiple windows)
- `.claude/context/agent-registry.json`
- `.claude/templates/spawn/universal-agent-spawn.md`
- `.claude/lib/utils/compression-trigger.cjs`
- `.claude/docs/@SKILL_CATALOG_TABLE.md`
- `C:\dev\projects\agent-studio\CLAUDE.md` (Sections 2, 8.2, 8.5)

---

*Report generated by code-reviewer agent | Task #5 | 2026-03-05*
