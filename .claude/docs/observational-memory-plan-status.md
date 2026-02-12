# Observational Memory Plan — Implementation Status

**Generated:** 2026-02-11 (audit of codebase vs plan)

---

## MVP (Phase 1 + 2.1 + 3.1 + 3.2)

### Phase 1: Observations Module — **COMPLETE**

| Step                                   | Status | Notes                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.1 appendObservation                  | Done   | [.claude/lib/memory/observations.cjs](.claude/lib/memory/observations.cjs), path validation, required fields, append to observations.jsonl                                                                                                                                                                                                             |
| 1.1b Concurrency (10 parallel appends) | Done   | [tests/lib/memory/observations.test.cjs](tests/lib/memory/observations.test.cjs) — "appendObservation handles parallel appends without corrupting lines"                                                                                                                                                                                               |
| 1.2 readObservations                   | Done   | limit, since, skip malformed, missing file → []                                                                                                                                                                                                                                                                                                        |
| 1.3 getByTopic                         | Done   | Filter by topic, most recent first, limit; tested in observations.test.cjs                                                                                                                                                                                                                                                                             |
| 1.4 Migration/backfill tests           | Done   | tests/hooks/spawn-prompt-memory-mode.test.cjs: "observational mode falls back to legacy memory section when observational data is missing"; "observational mode falls back to legacy memory section when observations.jsonl exists but is empty"; "MEMORY_MODE=observational uses observational section and excludes legacy gotchas/patterns" (mixed). |

### Phase 2.1: MEMORY_MODE and observational vs hybrid — **COMPLETE**

| Step        | Status | Notes                                                                                                                                                                                                                                            |
| ----------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1.1–2.1.5 | Done   | getMemoryMode(), loadObservationalMemory(), formatObservationalSection() in prompt-assembler.cjs; observational branch when includeMemory + mode observational; fallback to legacy when missing; ENVIRONMENT_CONFIG and MEMORY_SYSTEM.md updated |

### Phase 2.2–2.4: Tier B gate, e2e hook — **COMPLETE**

| Step                      | Status | Notes                                                                                                                               |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2.2 Tier B threshold gate | Done   | shouldUseTierB(toolInput, basePrompt), isObservationalMode(); Tier B only when exploratory/debug keywords or memory_depth=true      |
| 2.3 memory_depth flag     | Done   | Covered by shouldUseTierB                                                                                                           |
| 2.4 E2E hook test         | Done   | "spawn-prompt-assembler hook e2e: observational mode returns valid modified tool_input prompt" in spawn-prompt-memory-mode.test.cjs |

### Phase 3: Section-based token budget — **COMPLETE**

| Step                 | Status | Notes                                                                                                                                                                                       |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Per-section caps | Done   | applySectionTokenCap(), MEMORY_SUMMARY_BLOCK_MAX_TOKENS, MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS, MEMORY_TIER_B_MAX_TOKENS (defaults 400); used in prompt-assembler and spawn hook for Tier B |
| 3.2 Integration      | Done   | Tests: "section-based caps bound observational summary and recent observations sections", "Tier B semantic section respects MEMORY_TIER_B_MAX_TOKENS cap"                                   |

### Rollout guardrails — **COMPLETE**

| Item                       | Status | Notes                                                                                                                                                                                                               |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Default MEMORY_MODE=hybrid | Done   | prompt-assembler and spawn hook use default hybrid                                                                                                                                                                  |
| Feature flag / kill switch | Done   | OBSERVATIONAL_MEMORY_ENABLED=on                                                                                                                                                                                     | off in ENVIRONMENT_CONFIG; when off, hybrid path used |
| CI / test script           | Done   | `test:memory:ci` runs observations + spawn-prompt-memory-mode + unified-reflection-handler tests. `.github/workflows/memory-mvp-gate.yml` and `memory-ci.yml` run lint, test:memory:ci, test:framework (full gate). |

### Exact defaults — **COMPLETE**

All five defaults are implemented and documented in ENVIRONMENT_CONFIG.md: MEMORY_MODE=hybrid, OBSERVATIONAL_MEMORY_ENABLED=on, MEMORY_SUMMARY_BLOCK_MAX_TOKENS=400, MEMORY_RECENT_OBSERVATIONS_MAX_TOKENS=400, MEMORY_TIER_B_MAX_TOKENS=400.

### Test locations — **COMPLETE**

- Memory module: tests/lib/memory/observations.test.cjs only.
- Prompt/hook behavior: tests/hooks/spawn-prompt-memory-mode.test.cjs (and related hook tests in tests/hooks). No split with tests/lib/spawn for this feature.

---

## Later phases (post-MVP)

### Phase 4: Reflection compaction — **COMPLETE**

| Step                               | Status | Notes                                                                                                                                                                                               |
| ---------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 compactObservationsToSummary   | Done   | observations.cjs; writes observations_summary.md; tested in observations.test.cjs                                                                                                                   |
| 4.2 SessionEnd triggers compaction | Done   | unified-reflection-handler.cjs: triggerObservationCompaction() called after triggerMaintenance() on SessionEnd; OBSERVATIONS_COMPACT_ON_SESSION_END, OBSERVATIONS_COMPACT_MAX in ENVIRONMENT_CONFIG |

### Phase 5: Confidence + decay, cache-stability — **COMPLETE**

| Step                       | Status | Notes                                                                                                                                               |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 scoreObservations      | Done   | observations.cjs; confidence \* recency (exp decay); used when building Tier A; OBSERVATIONS_DECAY_PER_HOUR in config; tested                       |
| 5.2 recordMemoryBlockChurn | Done   | observations.cjs; appends to memory-cache-stability.jsonl with hash and churned; called from prompt-assembler after building memory section; tested |

### Phase 7 (Deferred): Contradiction guard — **IMPLEMENTED (plan said defer)**

The plan deferred Phase 7 until after telemetry. The codebase **implements** a contradiction/supersedes path:

- observations.cjs: appendObservation() calls getByTopic() and findContradictedObservation(); sets supersedes on new record when a contradiction is found.
- ENVIRONMENT_CONFIG: OBSERVATIONS_CONTRADICTION_MAX_AGE_DAYS (default 90).

So the "deferred" item was implemented. If the plan’s intent was to avoid heuristic contradiction until telemetry exists, consider: (a) leaving as-is and monitoring, or (b) gating contradiction logic behind an env flag (e.g. OBSERVATIONS_CONTRADICTION_ENABLED=off by default) until telemetry is in place.

---

## Summary

| Category                         | Status                        |
| -------------------------------- | ----------------------------- |
| **MVP (Phase 1, 2.1, 3.1, 3.2)** | Complete                      |
| **Rollout guardrails**           | Complete                      |
| **Phase 4 (compaction)**         | Complete                      |
| **Phase 5 (score + churn)**      | Complete                      |
| **Phase 7 (contradiction)**      | Implemented (plan said defer) |

### Optional / minor gaps

1. **Migration test 1.4:** Add one test for "empty observations.jsonl" (file exists, 0 lines) → valid prompt with legacy fallback. Current tests cover "no file" and "mixed".
2. **CI gate:** Plan: "MVP passes if: observation tests + spawn memory-mode tests + pnpm run test:framework + pnpm lint all green." `pnpm run test:memory:ci` covers the first two. Ensure your CI runs `test:memory:ci` (or equivalent) plus `test:framework` and `lint` before merge.
3. **Contradiction:** If you want to align with “defer until telemetry”, add an off-by-default kill switch for contradiction (e.g. OBSERVATIONS_CONTRADICTION_ENABLED=off) and document it.

### What we did not miss (all present)

- observations.jsonl append/read/getByTopic with path validation
- Concurrency test for appends
- MEMORY_MODE and OBSERVATIONAL_MEMORY_ENABLED in prompt-assembler and spawn hook
- loadObservationalMemory, formatObservationalSection, fallback to legacy when observational missing
- shouldUseTierB / isObservationalMode and Tier B only when exploratory or memory_depth
- Section-based token caps (summary, recent observations, Tier B) with defaults 400
- recordMemoryBlockChurn and cache-stability.jsonl
- scoreObservations with decay
- compactObservationsToSummary and SessionEnd trigger (triggerObservationCompaction)
- ENVIRONMENT_CONFIG and MEMORY_SYSTEM.md updates
- tests in tests/lib/memory/observations.test.cjs and tests/hooks/spawn-prompt-memory-mode.test.cjs
- test:memory:ci script
