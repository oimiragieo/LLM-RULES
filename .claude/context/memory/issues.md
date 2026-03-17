# Active Issues — 2026-03-16

## Skill Registration Gap: cron-decision (2026-03-16)

- [ ] Catalog: MISSING — cron-decision not in .claude/docs/skill-catalog.md
- [ ] Index: PRESENT (agentPrimary: developer only, but SKILL.md frontmatter lists 4 agents)
- [ ] Agent assignment: MISSING — no agent .md file lists cron-decision in skills: frontmatter
      Source: reflection of task 23 (Step 4.7 check)

**Fix**: (1) Add cron-decision to skill-catalog.md under DevOps & Infrastructure; (2) Wire into heartbeat-orchestrator, developer, planner, architect agent frontmatter; (3) Update artifact-graph.json

---

## P2: Architect Review Missing Catalog+Wiring Check (2026-03-16)

**Issue**: Task 24 architect review approved cron-decision skill without flagging missing catalog entry or agent frontmatter wiring.
**Impact**: New skills can pass architect review with integration gaps.
**Fix**: Add catalog + agent wiring verification to architect skill review checklist.

---

## P2: Plan File Staleness — 3rd Recurrence (2026-03-16)

**Issue**: Executing agent (nodejs-pro) committed Waves 1-2 of Telegram UX EPIC but left ALL plan tasks marked `- [ ]` in the plan file. This is the 3rd observed recurrence across sessions.
**Root Cause**: Agent calls `TaskUpdate(completed)` BEFORE updating plan file markers. The plan-file-update.md rule states markers must be updated BEFORE TaskUpdate.
**Impact**: Plan files become unreliable as progress indicators. Reflection agent must retroactively fix markers.
**Fix**: Reinforce plan file update instruction in nodejs-pro spawn prompts. Consider adding a pre-completion hook that checks plan file staleness before allowing TaskUpdate(completed).
**Status**: OPEN (systemic)

---

## P2: Wave 2 Commit Scope Drift (2026-03-16)

**Issue**: Wave 2 commit (4752d04a) modified 9 files including agent-registry.json (1071+/- lines), rule-index.json, researcher.md, skill-index.json, user-prompt-orchestrator.cjs, and init SKILL.md. Only telegram-poll.cjs changes were wave-2-scoped.
**Impact**: Commit is not atomic to the task. Side-effect changes make rollback risky and git history harder to follow.
**Fix**: Enforce single-concern commits. Registry regeneration should be a separate chore commit.
**Status**: OPEN

---

## P1: Cleanup Findings — Systemic Slop Pattern

**Issue**: Developer agent creates temp scripts in project root instead of `.claude/context/tmp/`. cleanup-always.md rules not enforced.

**Impact**: Recurring project root pollution (test-out.txt, run_main.js, etc.).

**Prevention**: Add write-path validation to developer spawn prompt; audit post-task cleanup.

**Status**: OPEN

---

## P1: TaskUpdate Metadata Contract Not Enforced — Reflections 1-2 (2026-03-17)

**Issue**: Tasks 1 and 2 completed without `metadata.summary` field. Reflection agent cannot score these tasks.

**Pattern**: 2 tasks completed; both defaulted to fallback string ("Task X completed without summary metadata").

**Root Cause**: `TaskUpdate(completed)` call did not include the `metadata` object with required fields. No enforcement mechanism blocks empty summaries.

**Impact**: Reflection agent withholds scores; quality data lost; no learnings persist.

**Fix**: Implement pre-completion hook (pre-completion-validation.cjs) to require non-empty `metadata.summary` before allowing TaskUpdate(completed) to succeed.

**Status**: OPEN (metric-level)

---

## P2: evolution-check.cjs QUEUED_ACTIONS:1 — Recurring Pattern (2026-03-16)

**Issue**: `evolution-check.cjs` has reported `QUEUED_ACTIONS: 1` across 6 consecutive reflection entries in session 2026-03-16 (tasks 10, 11, 12, 13, 14, 15). The same single queued action persists across all task completions.
**Source**: session-gap-log.jsonl — all 6 reflection prompts reference the same evolution-check gap observation.
**Classification**: Systemic pattern — the queued action is not being consumed/cleared between sessions.
**Impact**: Stale evolution queue entry may cause misleading signals or unnecessary evolution-orchestrator spawns.
**Fix**: Inspect `.claude/context/runtime/evolution-requests.jsonl` to identify the stale queued action. If it has been actioned or is invalid, clear it. If valid, spawn evolution-orchestrator to process it.
**Status**: OPEN (3rd+ recurrence this session — escalated to systemic)

---

## P2: Gate 4 Deferred Artifacts Pattern (2026-03-16)

**Issue**: Task 10 was completed with summary "Deferred to next session — Gate 4 artifacts require creator skills". This indicates a pipeline planning gap where Gate 4 artifacts (skills, hooks, schemas) were included in a task scope without pre-allocating creator skill invocation time.
**Impact**: Lib code completes but skills/hooks/schemas are orphaned as "Wave 3 follow-up" — integration gaps accumulate.
**Fix**: Planner must identify Gate 4 artifacts at task-creation time and allocate dedicated creator skill tasks. Never bundle lib code + Gate 4 artifacts in the same task.
**Status**: OPEN

---

## P1: Rule-Creator Gaps — Missing Fallback Logic

**Issue**: When rule file doesn't exist, skill-creator fails silently. No manifest validation before writing.

**Impact**: Partial skill registrations; skill-updater can't detect incomplete writes.

**Fix**: Implement pre-write manifest check in skill-creator.

**Status**: OPEN

---

## P1: Skill Registration Gaps — Index Staleness

**Issue**: `.claude/context/agent-registry.json` reflects old agent count (72 agents, should be 74). ecosystem-auditor and token-saver-context-compression missing.

**Impact**: Routing table out-of-sync; health check tests fail.

**Action**: Regenerate registry via `pnpm agents:registry`; validate count assertion in CI.

**Status**: OPEN

---

## P1: Reflection-Agent TaskUpdate Failures

**Issue**: reflection-agent calls `TaskUpdate(completed)` but processedReflectionIds not persisted if hook fails silently.

**Impact**: Stale reflections in queue; re-process same items on next session.

**Fix**: Add explicit ACK checkpoint before reflection cleanup.

**Status**: OPEN

---

## P1: Router — Missing Task Summary Metadata

**Issue**: Some completed tasks lack `metadata.summary`. Router completion report is incomplete without summaries.

**Impact**: Drain gate can't validate work quality; orchestrators lose context.

**Fix**: Add mandatory summary validation in pre-completion-validation.cjs.

**Status**: OPEN

---

## P1: Router — Duplicate Trigger Fallback

**Issue**: Session handoff can trigger both via env var AND reflection queue; may spawn 2x reflection-agent instances.

**Impact**: Duplicate processing; race conditions in state machine.

**Fix**: Make reflection queue authoritative; remove env var trigger.

**Status**: OPEN

---

## P1: Router Task Execution — Failure Retry Loop

**Issue**: When devops fails to commit (50% failure rate), router spawns devops-troubleshooter but doesn't validate fix before retrying. Can loop infinitely.

**Impact**: Stuck tasks; user intervention required.

**Fix**: Add retry counter + escalate to user after 2 failures.

**Status**: OPEN

---

## Context Overflow Prevention

**Pattern**: EPIC pipelines with 3+ analysis phases hit 150K context limit before implementation can begin.

**Prevention rule**: Plan explicit session boundary between analysis + implementation phases.

**Status**: DOCUMENTED (not actionable; context reset on new session)

---

## Archival Criteria

Issues archived to `.claude/context/memory/archive/issues-2026-03-15.md`:

- Resolved (marked RESOLVED, FIXED, or CLOSED)
- Dated before 2026-03-01 with no active blockers
- P2/P3 that are closed or deferred indefinitely
- Superseded by newer tracking entries

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-16T00:04:48.887Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-16T00:04:48.904Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-16T00:04:48.922Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-16T00:07:55.771Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-16T00:07:55.792Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-16T00:07:55.811Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-16T00:16:18.230Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-16T00:16:18.246Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-16T00:16:18.263Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-17T05:27:01.439Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-17T05:27:01.475Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-17T05:27:01.500Z

- [ROUTING WARN] Developer task routing warned. Keyword "design the system" suggests specialist "architect". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:38.957Z

- [ROUTING WARN] Developer task routing warned. Keyword "break down this" suggests specialist "planner". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:38.993Z

- [ROUTING WARN] Developer task routing warned. Keyword "user stories" suggests specialist "pm". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.025Z

- [ROUTING WARN] Developer task routing warned. Keyword "review the pr" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.053Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.080Z

- [ROUTING WARN] Developer task routing warned. Keyword "security audit" suggests specialist "security-architect". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.103Z

- [ROUTING WARN] Developer task routing warned. Keyword "deploy to production" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.125Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.143Z

- [ROUTING WARN] Developer task routing warned. Keyword "troubleshoot the" suggests specialist "devops-troubleshooter". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.162Z

- [ROUTING WARN] Developer task routing warned. Keyword "production incident" suggests specialist "incident-responder". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.179Z

- [ROUTING WARN] Developer task routing warned. Keyword "api documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.201Z

- [ROUTING WARN] Developer task routing warned. Keyword "ux review" suggests specialist "mobile-ux-reviewer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.220Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.240Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.257Z

- [ROUTING WARN] Developer task routing warned. Keyword "reverse engineer" suggests specialist "reverse-engineer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.275Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 context diagram" suggests specialist "c4-context". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.294Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 container diagram" suggests specialist "c4-container". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.322Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 component diagram" suggests specialist "c4-component". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.340Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 code documentation" suggests specialist "c4-code". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.362Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.385Z

- [ROUTING WARN] Developer task routing warned. Keyword "train the" suggests specialist "ai-ml-specialist". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.408Z

- [ROUTING WARN] Developer task routing warned. Keyword "smart contract" suggests specialist "web3-blockchain-expert". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.434Z

- [ROUTING WARN] Developer task routing warned. Keyword "genomic analysis" suggests specialist "scientific-research-expert". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.461Z

- [ROUTING WARN] Developer task routing warned. Keyword "game physics" suggests specialist "gamedev-pro". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.489Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.513Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.539Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.852Z

- [ROUTING WARN] Developer task routing warned. Keyword "simplify the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.872Z

- [ROUTING WARN] Developer task routing warned. Keyword "review code" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.897Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.924Z

- [ROUTING WARN] Developer task routing warned. Keyword "set up docker" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.944Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.966Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:39.988Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:40.006Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:40.049Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-17T05:28:40.066Z
