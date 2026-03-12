## Context Overflow at EPIC Pipeline Phase 3 (2026-03-12)

**Issue**: EPIC ecosystem audit plan (task #1, 22 atomic tasks, 3 phases) hit 150K token limit when router attempted to spawn Phase 3 implementation agents. Tasks 6, 7, 8 were blocked. All audit phases complete but implementation deferred to fresh session.

**Pattern**: This is a recurring P0 issue. Prior instance: "EPIC Plan Execution Context Risk - Task #25 (P1)" — same root cause (34 agent spawns, heavy context accumulation).

**Root Cause**: EPIC pipelines (22+ tasks, multiple audit/analysis phases) accumulate context from agent outputs. By Phase 3 the router context is saturated. Even with max-4-concurrent cap, each phase's results (returned inline or via TaskUpdate summaries) compound.

**Prevention**:

- Enforce wave-based execution: 2 agents max per wave (not 4 for heavy analysis)
- Agents must write detailed output to `.claude/context/reports/` files — return ONLY file path + 5-bullet summary (max 500 chars)
- Spawn `context-compressor` after each audit phase before moving to next
- In EPIC plan prompts, explicitly require agents to NOT return inline analysis — cite report file only

**Priority**: P0 (blocks implementation phase of every EPIC audit)

**Status**: Open — fresh session required for Phase 3 implementation

---

## EPIC Pipeline Context Overflow — Systemic Pattern (2026-03-12)

**Type**: context_overflow (router gap)
**Observed**: Phase 3 implementation spawn blocked for tasks 6, 7, 8 — session context exceeded 150K tokens during ecosystem-audit-epic pipeline. All audit phases completed but implementation phase could not start in same session.
**Pattern**: EPIC pipelines with 3+ analysis phases (security audit + structural audit + skill gap analysis) consistently exceed 150K token budget before reaching implementation spawns. This is the 3rd confirmed instance.
**Root cause**: Analysis agents return dense reports inline (or the router accumulates their outputs). By Phase 3, working context is saturated.
**Mitigation**: Split EPIC pipelines at Phase boundary explicitly — Phase 1-2 (audit/analysis) in Session A, Phase 3+ (implementation) in fresh Session B. Use session-handoff skill to transfer state. Do NOT attempt all phases in a single session for EPIC+ complexity.
**Status**: OPEN — no automated enforcement; requires manual discipline at pipeline design time.
**Evidence**: session-gap-log.jsonl entry 2026-03-12T00:00:00Z, context: ecosystem-audit-epic

---

## 2026-03-12 — Structural Ecosystem Audit Findings

- **CRITICAL: issues.md bloat** — was 441KB/4942 lines, 11x past threshold. Fixed 2026-03-12 (archived to issues-archive-2026-03-12.md). Fix: add rotation config to prevent recurrence.
- **P1: CLAUDE.md agent count stale** — States "73 agents" but 74 exist. Fix: update line 172 to "74 agents".
- **P1: shell-injection-validator.cjs** — Raw `JSON.parse` at line 427 before `safeParseJSON` at line 436. Prototype pollution window. Fix: remove raw parse, consolidate to single safeParseJSON.
- **P1: step0-reflection-enforcer.cjs unregistered** — Hook exists at `.claude/hooks/session/step0-reflection-enforcer.cjs` but not in settings.json. UserPromptSubmit Step 0 injection path inactive. Fix: register or archive.

---

## 2026-03-12 — Context Overflow: EPIC Audit Phase 3 Blocked

**Type**: `context_overflow` (router gap log entry)
**Context**: ecosystem-audit-epic pipeline, tasks 6, 7, 8
**Agent**: router

**Description**: After completing all 3 audit phases (security audit task #2, structural audit task #2, TDD/LSP gap analysis task #3), the router session context exceeded 150K tokens. Implementation spawns for Phase 3 (tasks 6, 7, 8) were blocked. All analysis phases had completed successfully; only implementation was blocked.

**Pattern classification**: Recurring systemic issue (confirmed in MEMORY.md, prior incidents 2026-02-09, 2026-03-10). EPIC audit pipelines that pack 3+ heavy analysis phases into one session consistently hit the 150K ceiling.

**Root cause**: Heavy audit agent outputs (security scan reports, structural scan reports, TDD gap analysis) each consume 10-30K tokens of inline context. Three consecutive phases exceed the budget before implementation phases can begin.

**Impact**: P1 findings from structural audit (unregistered hook, CLAUDE.md stale agent count, raw JSON.parse in shell-injection-validator, issues.md bloat) remain unimplemented. Requires fresh session to execute.

**Resolution**: Continue EPIC implementation in a fresh session. Reference report at `.claude/context/reports/` for P1/P2 finding details.

**Prevention rule**: For EPIC pipelines with 3+ analysis phases, plan an explicit session boundary between analysis and implementation in the pipeline plan document. Document this as a pipeline design constraint.

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T20:59:41.332Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T20:59:41.350Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T20:59:41.366Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:08.371Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:08.389Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:08.406Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:46.260Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:46.277Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:02:46.293Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:03:44.394Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:03:44.416Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:03:44.435Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:05:28.619Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:05:28.642Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:05:28.663Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:06:58.618Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:06:58.633Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:06:58.649Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:07:05.854Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:07:05.870Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:07:05.886Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:08:35.382Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:08:35.400Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:08:35.415Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:10:32.190Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:10:32.206Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:10:32.221Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:13:43.682Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:13:43.699Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:13:43.715Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:15:50.835Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:15:50.853Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:15:50.867Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:18:47.377Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:18:47.402Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:18:47.425Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:22:41.411Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:22:41.426Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:22:41.439Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:30:08.214Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:30:08.228Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:30:08.240Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:32:31.890Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:32:31.905Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:32:31.921Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:34:33.425Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:34:33.441Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:34:33.458Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:35:45.195Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:35:45.209Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:35:45.224Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:38:34.564Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:38:34.580Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:38:34.592Z

- [ROUTING WARN] Developer task routing warned. Keyword "update documentation" suggests specialist "technical-writer". Prompt triggered warning instead of block. Date: 2026-03-12T21:43:00.443Z

- [ROUTING WARN] Developer task routing warned. Keyword "refactor the" suggests specialist "code-simplifier". Prompt triggered warning instead of block. Date: 2026-03-12T21:43:00.464Z

- [ROUTING WARN] Developer task routing warned. Keyword "write tests" suggests specialist "qa". Prompt triggered warning instead of block. Date: 2026-03-12T21:43:00.483Z
