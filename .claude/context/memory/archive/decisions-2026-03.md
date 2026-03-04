# decisions Archive (2026-03)

## ADR-2026-03-03-110: Memory Injection Defaults Architecture (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED (commit a7ad75f4)
**Trigger**: Task 5 — memory system remediation (6 phases)

**Architecture Decisions**:

1. **Injection defaults ON** (opt-out model): `SPAWN_PROMPT_MEMORY_QUERY` and `MEMORY_INTENT_ANALYSIS` are now on by default. Agents receive memory context unless explicitly disabled.
2. **Token budget cap**: `MEMORY_INJECTION_MAX_CHARS=3600` (~900 tokens) per injection section. Prevents memory injection bloat from degrading spawn prompt quality.
3. **Session promotion hook**: `.claude/hooks/lifecycle/session-end-memory-promotion.cjs` calls `consolidateSession()` on session end. STM → MTM promotion is now automatic.
4. **Extraction trigger**: `post-completion-chain.cjs` auto-extracts from `TaskUpdate(completed)` metadata with 0.7 confidence gate. Only high-confidence signals enter memory.
5. **Spawn template**: `universal-agent-spawn.md` now includes explicit MemoryRecord usage instructions (pattern/gotcha/discovery).
6. **memory-search promoted**: From `contextual` to `always` for 9 core agents (developer, qa, architect, code-reviewer, code-simplifier, planner, devops, devops-troubleshooter, incident-responder).
7. **Named Memory API deferred**: readMemory/writeMemory still unused — defer until specific use case emerges.

**Evidence**: Multi-LLM consensus (Gemini+Codex): MemGPT/Letta pattern is gold standard; RAG injection > full dump; confidence-gate all writes.

**Validation**: Confirmed via commit a7ad75f4, +1522/-281 lines, 15 files, lint/format clean.

---

## ADR-2026-03-03-109: Multi-LLM Council Pipeline Pattern (VALIDATED)

**Date**: 2026-03-03
**Status**: VALIDATED (session-2 council review + fix confirmed effectiveness)
**Trigger**: Reflection on Tasks 1, 3, 4 — council review + implementation pipeline

**Pattern Confirmed**: Multi-LLM Council → Architect Synthesis → Developer Implementation is a high-quality pipeline for codebase review:

1. Council (multiple LLMs) identifies findings across SE categories
2. Architect synthesizes, resolves false positives with code evidence, writes ADR + evolution plan
3. Developer implements fixes from plan, referencing ADR decisions
4. Devops validates: tests, lint, format, commit, push

**Key Decision**: Add mandatory code cross-check step BEFORE including HIGH/CRITICAL findings in council report. Pattern: `rg -F 'symbol' file` to confirm declared/undeclared. Architect caught H2 false positive (bytesRead line 43) but this should be caught earlier.

**Secondary Decision**: Worktree-isolated agent spawn prompts MUST include inline summary contract. Without it, router has no visibility into worktree output and must verify manually via git.

---

## ADR-2026-03-03-108: Skill System & Worktree Lifecycle Hardening Plan

**Date**: 2026-03-03
**Status**: APPROVED (plan written, pending implementation in task-4)
**Trigger**: Multi-LLM council review + internal code review of commits 4138e4f0..4c290b7d

**Decisions:**

1. NaN gate bypass in validate-skill-ecosystem.cjs requires `Number.isFinite()` guard + range validation (0-100)
2. All JSON.parse in hooks/tools MUST use safeParseJSON (SE-02 unconditional). ESLint rule proposed for enforcement.
3. Worktree utilities to be extracted into `.claude/lib/worktree/worktree-utils.cjs` (DRY: listWorktrees, isStale, detectDefaultBranch, normalizeWorktreesDir)
4. Default branch detection via `git symbolic-ref refs/remotes/origin/HEAD` instead of hardcoded 'main'
5. Date arithmetic must use UTC normalization per SE-06 (new utility: `.claude/lib/utils/date-utils.cjs`)
6. Council finding H2 (bytesRead ReferenceError) is a FALSE POSITIVE -- variable IS declared at line 43. Windows stdin fragility remains as minor item.
7. Report tools must output to `.claude/context/reports/backend/` per workspace conventions

**Plan**: `.claude/context/plans/skill-worktree-evolution-plan-2026-03-03.md`
**Implementation**: 4 phases, merge gate after Phase 2, estimated 4.5 hours total

---

## ADR-2026-03-02-107: Self-Healing Loop Evidence Integration (PROPOSED)

**Date**: 2026-03-02
**Status**: PROPOSED (awaiting implementation validation in next session)
**Trigger**: Evolution deep-dive synthesis (Tasks 1-4, 2026-03-02) identified critical gap in self-healing maturity

**Finding**: Agent-studio achieves only **3.5 out of 7 gold-standard properties** for self-improving AI systems. Gap analysis:

- ✅ Atomic trials, Memory dedup, Actionable feedback (partial)
- ❌ Staleness decay, HITL checkpoints
- ⚠️ Eval-gated promotion (partial)

**Root Cause**: Self-healing loop is **operationally closed but evidentially broken**. System executes Reflection → Evolution → Creation → Validation, but **outcome signals do not feedback into reflection context**. This causes:

1. Duplicate learnings re-discovered across sessions (no outcome tracking prevents downweighting failures)
2. Same evolution recommendations repeated (no indication whether they succeeded)
3. Staleness decay cannot be implemented without success/failure signals

**Decision**: Implement outcome signal injection to close evidence loop.

**What Changes**:

1. Add `outcome` field to reflection-log.jsonl schema (`outcome: "success" | "failure" | "pending"`)
2. Modify post-completion-chain.cjs to inject outcome when creator-triggered changes complete validation
3. Wire creator validation results (pass/fail) back to reflection spawn context
4. Implement dead-letter governance for failed creator attempts

**Why This Matters**:

- Solves for Gold-Standard Property #5 (Staleness decay): learnings marked with outcome enable temporal downweighting
- Solves for Gold-Standard Property #6 (HITL checkpoints): humans can verify whether recommendations succeeded before approving new ones
- Enables Property #7 (Separate judge/executor): reflection can now see validator feedback

**Effort**: ~8 hours total (modular; can be staged)

**Success Criteria**:

- Reflection-log.jsonl entries include `outcome` field populated for all creator-triggered cycles
- Next reflection cycle has visibility into outcome of prior recommendations
- Duplicate patterns no longer re-discovered if they failed in prior session
- Gold-standard property count increases from 3.5 to 5.0+

**Implementation Order**:

1. Register missing hooks (P0, blocks handshake) — 5 min
2. Add outcome field to schema (P0, enables tracking) — 1 hour
3. Modify post-completion-chain.cjs (P0, injects signals) — 3 hours
4. Wire validation results to reflection context (P1, closes loop) — 4 hours
5. Test full cycle with outcome tracking (P1) — 2 hours

**Alternatives Rejected**:

- Just add staleness decay without outcomes: insufficient — need both temporal AND success/failure signals
- Manual tracking via decisions.md: insufficient — requires automation to scale
- Out-of-band governance system: overly complex, should be native to reflection

**Next Steps**: Implement P0 items (hooks + schema) immediately; defer P1 items to sprint planning if complexity grows.

---

## ADR-2026-03-03-111: Cap-Based LTM Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Replace threshold-based LTM eviction with cap-based eviction.

**Rationale**:

- Threshold-based eviction could wipe ALL LTM entries in a single pass when many age past threshold (e.g., 180 days)
- Cap-based eviction only evicts when `files.length > LTM_MAX_FILES`, maintaining a bounded set
- Prevents mass extinction of useful learnings

**Implementation**:

- Eviction logic: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when needed)
- NaN guards on: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` (use `Number.isFinite()`)
- mtime fallback: entries missing `timestamp`/`mtime` fields default to `Date.now()`
- Eviction preview: console.error outputs entries before deletion for debugging

**Impact**: Prevents catastrophic data loss while maintaining memory size bounds.

---

## ADR-2026-03-03-112: Access Count Wiring for Utility-Based Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Wire `access_count` increment in memory search path to enable utility-based eviction prioritization.

**Rationale**:

- Previously all LTM entries had equal utility (no differentiation on access frequency)
- Access count enables prioritizing frequently-used learnings (highest utility) for retention
- Least-used entries (lowest utility) are evicted first when cap is exceeded

**Implementation**:

- Function: `incrementLTMAccessCount(entryId)` in `.claude/lib/memory/contextual-memory.cjs`
- Triggers on every LTM search hit (memory-search.cjs calls it)
- Utility calculation: combines `accessCount` with time decay for eviction priority

**Impact**: Ensures most-valuable learnings persist while space-constrained LTM can shed stale entries.

---

## ADR-2026-03-03-111: Cap-Based LTM Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Replace threshold-based LTM eviction with cap-based eviction.

**Rationale**:

- Threshold-based eviction could wipe ALL LTM entries in a single pass when many age past threshold (e.g., 180 days)
- Cap-based eviction only evicts when `files.length > LTM_MAX_FILES`, maintaining a bounded set
- Prevents mass extinction of useful learnings

**Implementation**:

- Eviction logic: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when needed)
- NaN guards on: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` (use `Number.isFinite()`)
- mtime fallback: entries missing `timestamp`/`mtime` fields default to `Date.now()`
- Eviction preview: console.error outputs entries before deletion for debugging

**Impact**: Prevents catastrophic data loss while maintaining memory size bounds.

---

## ADR-2026-03-03-112: Access Count Wiring for Utility-Based Eviction (IMPLEMENTED)

**Date**: 2026-03-03
**Status**: IMPLEMENTED
**Decision**: Wire `access_count` increment in memory search path to enable utility-based eviction prioritization.

**Rationale**:

- Previously all LTM entries had equal utility (no differentiation on access frequency)
- Access count enables prioritizing frequently-used learnings (highest utility) for retention
- Least-used entries (lowest utility) are evicted first when cap is exceeded

**Implementation**:

- Function: `incrementLTMAccessCount(entryId)` in `.claude/lib/memory/contextual-memory.cjs`
- Triggers on every LTM search hit (memory-search.cjs calls it)
- Utility calculation: combines `accessCount` with time decay for eviction priority

**Impact**: Ensures most-valuable learnings persist while space-constrained LTM can shed stale entries.
