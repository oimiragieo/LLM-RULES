<!-- Agent: code-simplifier | Task: #9-support | Session: 2026-02-08 -->

# Memory Rebuild Simplification Review

## 1. What the Old Code Had That We Are Correctly Excluding

**Archived memory-rotator.cjs (751 lines):**
- Separate `parseDecisions()` and `parseIssues()` parsers with duplicated logic (lines 150-206, 241-311). The new design unifies this into a single generic `parseSections()`. Correct exclusion.
- Line-count-based rotation trigger (`ROTATION_TRIGGER: 1500` lines). The new design uses KB-based thresholds (20KB). Correct -- KB is more meaningful for token budget management.
- Dedicated `rotateDecisions()` and `rotateIssues()` functions (lines 369-562) with nearly identical control flow. The new `rotateIfNeeded(filePath)` is generic. Correct exclusion of duplication.
- 95-line CLI interface with emoji output (lines 625-721). The scheduler already provides CLI. Correct exclusion.
- `fs.writeFileSync()` used directly (lines 441, 455, 540, 554) instead of `atomicWriteSync()`. Correctly identified as a bug; new design mandates atomic writes.

**Archived smart-pruner.cjs (736 lines):**
- Utility-based scoring system with exponential decay, logarithmic frequency, importance markers (lines 69-180). This operated on JSON arrays with `accessCount`/`lastAccessed` metadata. The new design targets markdown files, not JSON. Correct exclusion -- markdown sections lack access metadata.
- `IMPORTANCE_MARKERS` pattern matching with 8 weighted regex patterns (lines 47-56). Over-engineered; never had real access frequency data to score against. Correct exclusion.
- `RETENTION_LIMITS` per tier (STM: 5, MTM: 15, LTM: 100) with `enforceRetention()` and `archiveLowValue()` (lines 345-477). These limits are meaningless for markdown rotation. Correct exclusion.
- `detectDuplicates()` for single-entry insertion checks (lines 322-339). Unused -- no caller wired this in. Correct exclusion.
- `deduplicateAndPrune()` combined pipeline (lines 506-541). Over-integrated; the new design keeps dedup and pruning as separate callable functions. Correct simplification.

**Archived cold-storage.cjs (336 lines):**
- LanceDB vector store integration for cold search (lines 149-182, 285-308). Required async code, external dependency, and `MemoryVectorStore`. The new design uses plain JSONL substring search. Correct exclusion -- vector search for cold archives is overkill.
- Gzip compression (`zlib.gzipSync`, line 281). The new design uses plain JSONL. Correct for current volumes (<6MB/year projected).
- `memory-retention-config.cjs` dependency for retention options. The new design uses config.yaml directly. Correct -- removes a dependency layer.
- LTM summary JSON format (`summary_*.json` files). The new design works with markdown archives, not session summaries. Correct scope alignment.

## 2. Over-Engineering Risks in the New Design

**Risk 1 (LOW): 7 environment variable overrides.** The architecture design defines `MEMORY_ROTATION_ENABLED`, `MEMORY_ROTATION_THRESHOLD_KB`, `MEMORY_ROTATION_KEEP_SECTIONS`, `MEMORY_DEDUP_ENABLED`, `MEMORY_DEDUP_THRESHOLD`, `MEMORY_COLD_ENABLED`, `MEMORY_COLD_MAX_AGE_DAYS`. For a system with 3 users (agents), 7 env vars is excessive. **Suggestion:** Start with 2 (`MEMORY_ROTATION_THRESHOLD_KB`, `MEMORY_COLD_MAX_AGE_DAYS`). Add the rest when someone actually needs them.

**Risk 2 (LOW): searchArchives() and searchCold() in v1.** No agent currently searches archives. These functions add ~40 lines across two modules for a feature that may never be called. **Suggestion:** Implement the core rotation/dedup/archival first. Add search functions as a follow-up only when an agent needs them.

**Risk 3 (NONE): Three-tier storage model.** HOT/WARM/COLD is well-justified by the 53KB issues.md problem. Not over-engineered.

**Risk 4 (NONE): Jaccard deduplication.** Simple, deterministic, zero-dependency. Appropriate for the problem.

## 3. Simplification Opportunities in Existing Code

**memory-scheduler.cjs (893 lines):**
- `runArchiveOldLTM()` (lines 395-462) spawns a child Node process with ESM `import` syntax to call archived `cold-storage.cjs`. This entire function is dead code that always fails silently. The new wiring will replace it entirely, which is correct.
- `runDailyMaintenance()` and `runWeeklyMaintenance()` (lines 559-709) duplicate the event-bus emission pattern (24 lines each, nearly identical). This could be extracted to a shared helper, but is outside the current task scope.
- `readStatus()` at line 122 uses bare `JSON.parse()` -- flagged by security review as prototype pollution risk. The developer should use `safeParseJSON()` here.

**memory-manager.cjs (1504 lines):**
- `checkAndArchiveLearnings()` (lines 494-557) uses `fs.appendFileSync()` for archive writes and a line-count approach (keep last 50 lines). This will become redundant once the new rotator handles all markdown files with section-based rotation. **Suggestion:** After the new system is wired, deprecate this function with a comment pointing to `memory-rotator.rotateIfNeeded()`.
- `getMemoryHealth()` (lines 1134-1209) checks learnings.md and decisions.md sizes but not issues.md (the largest file at 53KB). **Suggestion:** Add issues.md to the health check while touching this area.
- `_pruneOldSessions()` (line 562) manages legacy `sessions/` directory. This is dead functionality per the health check warning at line 1198. Not urgent to remove but worth noting.

**memory-manager.cjs bare JSON.parse usage:** 11 occurrences per the security review. The developer should prioritize replacing these with `safeParseJSON()` as a separate cleanup task, not bundled into the memory management rebuild.

## 4. Concrete Suggestions for the Developer

1. **Do not implement searchArchives() or searchCold() in the first pass.** Stub them with a TODO comment. Focus on the core rotation, dedup, and cold archival. This saves ~40 production lines and ~100 test lines.

2. **Limit env var overrides to 2 initially.** Only `MEMORY_ROTATION_THRESHOLD_KB` and `MEMORY_COLD_MAX_AGE_DAYS` justify runtime configurability. The rest can be hardcoded constants until a real use case emerges.

3. **Replace the bare JSON.parse in `readStatus()` at memory-scheduler.cjs line 122** with `safeParseJSON()` while wiring the new modules (Step 9 of the plan). This is a one-line fix in code you are already modifying.

4. **Add issues.md to `getMemoryHealth()` checks** in memory-manager.cjs. Currently it monitors learnings.md and decisions.md but ignores the 53KB elephant.

5. **Deprecate `checkAndArchiveLearnings()` after wiring.** Add a comment: `// DEPRECATED: Use memory-rotator.rotateIfNeeded() for all markdown files (ADR-102)`. Do not delete it yet -- other code may call it.

6. **Keep the implementation plan's Step 2 (sensitive-scrubber) as written.** The security review specifically requires scrubbing before cold archival. This is not over-engineering -- it is a security control.

7. **The plan's line count estimate of ~465 production lines is reasonable** but may exceed the 150-line-per-module constraint if search functions are included. Without search functions, the three modules fit comfortably: rotator ~100, pruner ~70, cold-storage ~60.
