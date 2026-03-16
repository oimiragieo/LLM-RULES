# Active Issues — 2026-03-15

## P1: Cleanup Findings — Systemic Slop Pattern

**Issue**: Developer agent creates temp scripts in project root instead of `.claude/context/tmp/`. cleanup-always.md rules not enforced.

**Impact**: Recurring project root pollution (test-out.txt, run_main.js, etc.).

**Prevention**: Add write-path validation to developer spawn prompt; audit post-task cleanup.

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
