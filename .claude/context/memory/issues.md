## P1: Rule-Creator Gaps — Missing Fallback Logic

**Issue**: When rule file doesn't exist, skill-creator fails silently. No manifest validation before writing.

**Impact**: Partial skill registrations; skill-updater can't detect incomplete writes.

**Fix**: Added pre-write manifest validation in create-actions.cjs createSkill() -- checks SKILLS_DIR and CLAUDE.md exist before writing any files.

**Status**: FIXED (2026-03-22)

---

## P1: Skill Registration Gaps — Index Staleness

**Issue**: `.claude/context/agent-registry.json` reflected old agent count (72 agents, should be 107).

**Impact**: Routing table out-of-sync; health check tests fail.

**Action**: Regenerate registry via `pnpm agents:registry`; validate count assertion in CI.

**Status**: RESOLVED (2026-03-22 — registry now has 107 agents)

---

## P1: Reflection-Agent TaskUpdate Failures

**Issue**: reflection-agent calls `TaskUpdate(completed)` but processedReflectionIds not persisted if hook fails silently.

**Impact**: Stale reflections in queue; re-process same items on next session.

**Fix**: Added ACK verification in reflection-cleanup.cjs -- verifies IDs exist in spawn request file before removing, preventing silent data loss on stale batches.

**Status**: FIXED (2026-03-22)

---

## P1: Router — Missing Task Summary Metadata

**Issue**: Some completed tasks lack `metadata.summary`. Router completion report is incomplete without summaries.

**Impact**: Drain gate can't validate work quality; orchestrators lose context.

**Fix**: Add mandatory summary validation in pre-completion-validation.cjs.

**Status**: RESOLVED (2026-03-22 — P0 fix added exit(2) for summary enforcement)

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

## [2026-03-19] Multi-Model Audit Review — Additional Critical Findings

**Source:** Multi-LLM consultant task-6, Claude CLI cross-validation

### CRITICAL (not in original audit)

- router-tool-lockdown.cjs and write-pretool-bundle.cjs may have multiple block paths exiting 0 instead of 2 — systematic audit needed (grep: `grep -rn "process.exit(0)" .claude/hooks/`)
- bash-pretool-bundle.cjs only matches native Bash tool — MCP shell tools (mcp**shell**_, mcp**exec**_) bypass all bash safety validation

### HIGH (not in original audit)

- No retry counter on devops -> devops-troubleshooter loop — infinite loop risk
- issues.md had 155+ routing warning log lines obscuring real P1/P2 findings — cleaned 2026-03-22

### C-01 STATUS UPDATE

- evolution-state-guard.cjs fix IS in working tree (uncommitted) — action: commit it
- H-01 severity downgrade: runtime threshold IS 40KB, only JSDoc comment is wrong

### Omega CLI Notes

- Gemini: PATH-aware discovery needed in omega-gemini-cli wrapper (v0.33.1 installed but npx fallback fails)
- Codex: Stalled on 90s query — rate limiting or auth token expiry suspected

---

## Task 11 - Ecosystem Audit: Open Findings & Future Work

### F06 MEDIUM: ralph-loop State Persistence Gap

**Status:** OPEN
**Description:** ralph-loop (async state machine for background polling agents) not integrated with STM/MTM/LTM memory tiers. Polling state may not survive session boundaries or context resets.
**Impact:** Background agents (heartbeat-orchestrator, cron-runner) may lose work state across sessions.
**Files:** `.claude/tools/cron-runner/`, ralph-loop state machine
**Priority:** P1 (background agent reliability)
**Resolution:** Implement state persistence hook integrating ralph-loop checkpoints with MTM tier; add validation to reflect-agent

### F07 MEDIUM: Named Memory API Underutilization

**Status:** OPEN
**Description:** Named Memory API (`.claude/context/memory/named/`) supports topic-specific persistent notes but is used by only 1/101 agents. Pattern remains dormant.
**Impact:** Agents miss opportunity for structured topic memory; consolidation happens only via monolithic learnings.md
**Files:** `.claude/lib/memory/memory-manager.cjs` (API exists), `.claude/context/memory/named/` (mostly empty)
**Priority:** P2 (convenience, not blocking)
**Resolution:** Promote Named Memory pattern in spawn template documentation; add examples for routing, skill status, architecture decisions

### F08 MEDIUM: WAL Protocol Design-Only

**Status:** OPEN
**Description:** Write-Ahead Log (WAL) protocol for Agent Teams parallel execution is fully designed in .claude/CLAUDE.md Section 8 (Memory / Agent Teams) but not runtime-enforced. No PreToolUse hook validates queue isolation.
**Impact:** Agent Teams running concurrent sessions may have memory write collisions on canonical files (learnings.md, decisions.md, issues.md).
**Files:** `.claude/hooks/` (missing WAL enforcement hook), `.claude/context/memory/queue/` (queue infrastructure exists)
**Priority:** P1 (blocks Agent Teams feature)
**Resolution:** Implement `unified-memory-wal-enforcer.cjs` PreToolUse hook that redirects MemoryRecord writes to queue files during Agent Teams sessions

### F11 LOW: CLAUDE.md Tool Whitelist Omission

**Status:** OPEN
**Description:** CLAUDE.md Section 1.1 (TOOL LOCKDOWN) lists allowed tools but omits MemoryRecord in the explicit list (though it is allowed).
**Impact:** Minimal — MemoryRecord works, but documentation incomplete.
**Files:** `.claude/CLAUDE.md` Section 1.1
**Priority:** LOW (documentation only)
**Resolution:** Add MemoryRecord to allowed tools list with brief explanation (STM/MTM/LTM memory updates)

### F12 LOW: memory-protocol.md Environment Variable Prefix Mismatch

**Status:** OPEN
**Description:** memory-protocol.md mentions env var prefixes (LEARNINGS_ARCHIVE_THRESHOLD_KB, DECISIONS_WARN_THRESHOLD_KB) but actual env vars use different naming convention in some contexts.
**Impact:** Minimal — env vars work, but documentation may confuse future agents.
**Files:** `.claude/rules/memory-protocol.md`, `.env.example`
**Priority:** LOW (documentation only)
**Resolution:** Audit env var naming across codebase; add canonical list to memory-protocol.md with actual names

### General Note: Cosmetic Findings F02, F03

**F02:** 89/101 agents lack guarded-file warning in frontmatter. **Reason:** Universal warning already in spawn template; agent-level duplication unnecessary. No action needed.

**F03:** Only 2/101 agents declare MemoryRecord in frontmatter. **Reason:** MemoryRecord universally available; declaration not required. No action needed.

---

## 2026-03-20: Memory Sanitizer Returns Unsanitized Content (P0)

**Issue**: `sanitizeMemoryContent` function detects threats and logs to stderr but returns original toxic content in the `sanitized` field. Creates persistent prompt injection vector — poisoned memory entries affect every future agent session via `spawn-prompt-assembler.cjs`.

**Priority**: P0 — must fix before merges touching memory-reading code paths.

**Fix**: Iterate `detections` array and replace matched substrings with `[REDACTED_SECURITY_VIOLATION]` before returning. Add regression test that asserts sanitized field does not contain original malicious payload.

**Source**: Multi-LLM review (Gemini + Claude synthesis), Task #15, 2026-03-20

---

## 2026-03-20: MCP Tool Shell Bypass Elevated to CRITICAL

**Issue**: F-003 MCP shell tools (`mcp__filesystem__*`, `mcp__desktop-commander__*`) bypass hook enforcement entirely. Specific attack vector: `mcp__filesystem__write_file` can overwrite `.claude/hooks/safety/*.cjs` with `exit 0` to disable all security hooks. Also enables credential exfiltration via `.env` reads without hook interception.

**Priority**: P0 (elevated from HIGH by multi-LLM review).

**Fix**: Add `mcp__` prefix matcher to `pre-tool-unified.cjs`. Create `mcp-security-validator.cjs` to enforce path-filtering and injection-detection rules equivalent to Bash safety hooks.

**Source**: Multi-LLM review (Gemini + Claude synthesis), Task #15, 2026-03-20

---

## 2026-03-20: Codex CLI Large Prompt Delivery Failure on Windows

**Issue**: `omega-codex-cli/scripts/ask-codex.mjs` does not reliably deliver prompts >~2KB via positional argument on Windows. CLI responds requesting user to paste content rather than processing the provided prompt.

**Workaround**: Investigate stdin delivery (consistent with ask-gemini.mjs approach) for large payloads.

**Source**: Task #15, 2026-03-20

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:38.222Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:38.279Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:38.315Z

- [ROUTING WARN] Developer task routing warned. Keyword "design the system" suggests specialist "architect". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.550Z

- [ROUTING WARN] Developer task routing warned. Keyword "break down this" suggests specialist "planner". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.583Z

- [ROUTING WARN] Developer task routing warned. Keyword "user stories" suggests specialist "pm". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.623Z

- [ROUTING WARN] Developer task routing warned. Keyword "review the pr" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.649Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.680Z

- [ROUTING WARN] Developer task routing warned. Keyword "security audit" suggests specialist "security-architect". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.817Z

- [ROUTING WARN] Developer task routing warned. Keyword "deploy to production" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.851Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.883Z

- [ROUTING WARN] Developer task routing warned. Keyword "troubleshoot the" suggests specialist "devops-troubleshooter". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.920Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.920Z

- [ROUTING WARN] Developer task routing warned. Keyword "simplify the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.951Z

- [ROUTING WARN] Developer task routing warned. Keyword "production incident" suggests specialist "incident-responder". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.956Z

- [ROUTING WARN] Developer task routing warned. Keyword "api documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.992Z

- [ROUTING WARN] Developer task routing warned. Keyword "review code" suggests specialist "code-reviewer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:47.992Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.035Z

- [ROUTING WARN] Developer task routing warned. Keyword "ux review" suggests specialist "mobile-ux-reviewer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.037Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.069Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.107Z

- [ROUTING WARN] Developer task routing warned. Keyword "reverse engineer" suggests specialist "reverse-engineer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.135Z

- [ROUTING WARN] Developer task routing warned. Keyword "set up docker" suggests specialist "devops". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.174Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 context diagram" suggests specialist "c4-context". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.277Z

- [ROUTING WARN] Developer task routing warned. Keyword "database schema" suggests specialist "database-architect". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.278Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 container diagram" suggests specialist "c4-container". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.427Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 component diagram" suggests specialist "c4-component". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.449Z

- [ROUTING WARN] Developer task routing warned. Keyword "research" suggests specialist "researcher". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.449Z

- [ROUTING WARN] Developer task routing warned. Keyword "c4 code documentation" suggests specialist "c4-code". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.481Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.483Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.509Z

- [ROUTING WARN] Developer task routing warned. Keyword "train the" suggests specialist "ai-ml-specialist". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.546Z

- [ROUTING WARN] Developer task routing warned. Keyword "smart contract" suggests specialist "web3-blockchain-expert". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.630Z

- [ROUTING WARN] Developer task routing warned. Keyword "genomic analysis" suggests specialist "scientific-research-expert". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.659Z

- [ROUTING WARN] Developer task routing warned. Keyword "game physics" suggests specialist "gamedev-pro". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.694Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.727Z

- [ROUTING WARN] Developer task routing warned. Keyword "data pipeline" suggests specialist "data-engineer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.761Z

- [ROUTING WARN] Developer task routing warned. Keyword "write documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.831Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-22T17:16:48.834Z
