# Observational Memory Plan — Thorough Audit: What Is Left

**Audit date:** 2026-02-11  
**Scope:** Full codebase vs TDD plan (MVP = Phase 1 + 2.1 + 3.1 + 3.2; Phase 4, 5, 7, rollout, docs, CI).

---

## Executive summary

**Nothing mandatory is left.** All plan steps are implemented and tested. Optional documentation tweaks are listed below.

---

## Phase-by-phase verification

### Phase 1: Observations module

| Plan step | Verification | Status |
|-----------|--------------|--------|
| 1.1 appendObservation | `.claude/lib/memory/observations.cjs`: appendObservation, path validation (validatePathWithinProject), required fields (timestamp, topic, fact, confidence, source_session), append to observations.jsonl | **Done** |
| 1.1b Concurrency | `tests/lib/memory/observations.test.cjs`: "appendObservation handles parallel appends without corrupting lines" — 10 parallel appends, 10 lines | **Done** |
| 1.2 readObservations | observations.cjs: limit, since, skip malformed lines, missing file → []; test "readObservations returns [] for missing files, skips malformed lines, and honors limit" | **Done** |
| 1.3 getByTopic | observations.cjs: filter by topic, most recent first, limit; test "getByTopic returns most recent observations for a topic with limit" | **Done** |
| 1.4 Migration/backfill | Fallback when missing: "observational mode falls back to legacy memory section when observational data is missing". Fallback when empty file: "observational mode falls back to legacy memory section when observations.jsonl exists but is empty" (spawn-prompt-memory-mode.test.cjs L178–206). Mixed: "MEMORY_MODE=observational uses observational section and excludes legacy gotchas/patterns" | **Done** |

### Phase 2.1: MEMORY_MODE and observational vs hybrid

| Plan step | Verification | Status |
|-----------|--------------|--------|
| 2.1.1–2.1.5 | prompt-assembler.cjs: getMemoryMode(), loadObservationalMemory(), formatObservationalSection(); observational branch when includeMemory + mode observational; fallback to legacy when missing/empty; headers "Observational summary", "Observational Memory Context" | **Done** |
| Defaults | MEMORY_MODE=hybrid, OBSERVATIONAL_MEMORY_ENABLED=on in code and @ENVIRONMENT_CONFIG.md, MEMORY_SYSTEM.md | **Done** |

### Phase 2.2–2.4: Tier B gate, memory_depth, e2e hook

| Plan step | Verification | Status |
|-----------|--------------|--------|
| 2.2 Tier B gate | spawn-prompt-assembler.cjs: shouldUseTierB(toolInput, basePrompt), OBSERVATIONAL_TIER_B_KEYWORDS (investigate, debug, explore, why, root cause, uncertain); Tier B only when observational + (keywords or memory_depth) | **Done** |
| 2.3 memory_depth | shouldUseTierB checks toolInput.memory_depth === true; test "memory_depth true forces Tier B" | **Done** |
| 2.4 E2E hook | spawn-prompt-memory-mode.test.cjs: "spawn-prompt-assembler hook e2e: observational mode returns valid modified tool_input prompt" — spawns hook, asserts status 0, tool_input.prompt includes "## Memory Protocol" and "PROJECT_ROOT" | **Done** |

### Phase 3: Section-based token budget

| Plan step | Verification | Status |
|-----------|--------------|--------|
| 3.1 Per-section caps | prompt-assembler.cjs: estimateTokens(text) = Math.ceil(length/4); applySectionTokenCap(sectionMarkdown, maxTokens, strategy); MEMORY_SUMMARY_BLOCK_MAX_TOKENS, MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS (default 400); spawn hook applies MEMORY_TIER_B_MAX_TOKENS (400) to Tier B block | **Done** |
| 3.2 Integration | Tests: "section-based caps bound observational summary and recent observations sections" (estimateTokens(summary) ≤ 31, estimateTokens(recent) ≤ 21); "Tier B semantic section respects MEMORY_TIER_B_MAX_TOKENS cap" | **Done** |

### Phase 4: Reflection compaction

| Plan step | Verification | Status |
|-----------|--------------|--------|
| 4.1 compactObservationsToSummary | observations.cjs: compactObservationsToSummary(root, options), writes observations_summary.md; observations.test.cjs: "compactObservationsToSummary writes summary and respects OBSERVATIONS_COMPACT_MAX" | **Done** |
| 4.2 SessionEnd | unified-reflection-handler.cjs: triggerObservationCompaction() after triggerMaintenance() on SessionEnd; OBSERVATIONS_COMPACT_ON_SESSION_END, OBSERVATIONS_COMPACT_MAX in ENVIRONMENT_CONFIG. unified-reflection-handler.test.cjs: "triggerObservationCompaction should compact observations on SessionEnd by default", "triggerObservationCompaction should skip when OBSERVATIONS_COMPACT_ON_SESSION_END=off" | **Done** |

### Phase 5: Confidence + decay, cache-stability

| Plan step | Verification | Status |
|-----------|--------------|--------|
| 5.1 scoreObservations | observations.cjs: scoreObservations with confidence * recency (exp decay), OBSERVATIONS_DECAY_PER_HOUR; tested in observations.test.cjs | **Done** |
| 5.2 recordMemoryBlockChurn | observations.cjs: recordMemoryBlockChurn(projectRoot, blockContent); appends to memory-cache-stability.jsonl (memory_block_hash, previous_hash, churned); prompt-assembler calls it after building memory section. spawn-prompt-memory-mode.test.cjs: "assembleSpawnPrompt records memory cache stability churn metrics" | **Done** |

### Phase 7: Contradiction (plan deferred; implemented)

| Plan step | Verification | Status |
|-----------|--------------|--------|
| 7.1 Contradiction/supersedes | observations.cjs: isContradictionEnabled() reads OBSERVATIONS_CONTRADICTION_ENABLED (default 'off'); when on, appendObservation uses getByTopic + findContradictedObservation, sets supersedes on new record | **Done** |
| Kill switch | OBSERVATIONS_CONTRADICTION_ENABLED=off default; documented in @ENVIRONMENT_CONFIG.md and MEMORY_SYSTEM.md | **Done** |

### Rollout guardrails

| Item | Verification | Status |
|------|--------------|--------|
| Default MEMORY_MODE=hybrid | prompt-assembler and spawn hook default to hybrid | **Done** |
| Feature flag / kill switch | OBSERVATIONAL_MEMORY_ENABLED=on\|off; when off, hybrid path used; test "OBSERVATIONAL_MEMORY_ENABLED=off forces hybrid mode even if MEMORY_MODE=observational" | **Done** |
| CI gate | memory-mvp-gate.yml and memory-ci.yml: lint, test:memory:ci, test:framework. test:memory:ci (package.json) runs observations.test.cjs, spawn-prompt-memory-mode.test.cjs, unified-reflection-handler.test.cjs | **Done** |

### Docs and config

| Item | Verification | Status |
|------|--------------|--------|
| ENVIRONMENT_CONFIG | MEMORY_MODE, OBSERVATIONAL_MEMORY_ENABLED, MEMORY_SUMMARY_BLOCK_MAX_TOKENS, MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS, MEMORY_TIER_B_MAX_TOKENS, OBSERVATIONS_COMPACT_*, OBSERVATIONS_DECAY_PER_HOUR, OBSERVATIONS_CONTRADICTION_* | **Done** |
| MEMORY_SYSTEM.md | Observational path, mode selection, section token budgets, SessionEnd compaction, cache-stability metric, CI gate (test:memory:ci, memory-ci.yml) | **Done** |

---

## What is left (optional only)

1. **Tier B keyword list in docs**  
   Plan 2.2.5: "document keyword list or intent rule in ENVIRONMENT_CONFIG or code comment."  
   The list lives in code (`OBSERVATIONAL_TIER_B_KEYWORDS` in spawn-prompt-assembler.cjs). There is no JSDoc above the constant and no sentence in MEMORY_SYSTEM.md or ENVIRONMENT_CONFIG listing the keywords. Optional: add a one-line comment above the constant (e.g. "Exploratory/debug keywords that trigger Tier B semantic/entity injection in observational mode") or one sentence in MEMORY_SYSTEM.md.

2. **Status doc correction**  
   `.claude/docs/observational-memory-plan-status.md` still says: "Gap: No explicit test for 'empty observations.jsonl' (file exists but empty)". That test exists: "observational mode falls back to legacy memory section when observations.jsonl exists but is empty" in spawn-prompt-memory-mode.test.cjs. Optional: update the status doc to mark 1.4 migration/backfill as fully done and remove that gap.

---

## Summary

- **MVP (Phase 1, 2.1, 3.1, 3.2):** Complete.  
- **Phase 4, 5, 7, rollout, docs, CI:** Complete.  
- **Mandatory work remaining:** None.  
- **Optional:** Document Tier B keywords (comment or doc); correct status doc re empty-file test.
