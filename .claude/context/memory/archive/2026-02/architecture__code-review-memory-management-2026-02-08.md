<!-- Agent: code-reviewer | Task: #10 | Session: 2026-02-08 -->

# Code Review: Memory Management Implementation

**Reviewer:** code-reviewer agent
**Date:** 2026-02-08
**Scope:** Phase 4 review of memory management rebuild (Task #9)
**Spec Documents:**

- Implementation Plan: .claude/context/plans/impl-memory-management-2026-02-08.md
- Architecture Design: .claude/context/reports/architecture/memory-management-design-2026-02-08.md
- Security Review: .claude/context/reports/security/memory-management-security-review-2026-02-08.md

---

## Stage 1: Spec Compliance

**Requirements Met:** Partial

### Step-by-Step Verification

| Step | Description                     | Status  | Notes                                                                                                     |
| ---- | ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| 1    | sensitive-scrubber.cjs (MF-003) | PASS    | 84 lines, 6 tests, regex scrubbing for API keys/JWTs/emails/passwords                                     |
| 2    | sensitive-scrubber tests        | PASS    | 6/6 pass, covers all credential types + clean text                                                        |
| 3    | memory-rotator.cjs              | PARTIAL | 249 lines, parseSections + rotateIfNeeded work. searchArchives() NOT implemented (spec Step 5)            |
| 4    | memory-rotator tests            | PASS    | 13/13 pass                                                                                                |
| 5    | searchArchives()                | FAIL    | Function not implemented in memory-rotator.cjs. Spec requires searchable archives                         |
| 6    | smart-pruner.cjs                | PASS    | 212 lines, deduplicateFile + pruneResolvedEntries + jaccardSimilarity                                     |
| 7    | smart-pruner tests              | PASS    | 11/11 pass                                                                                                |
| 8    | cold-storage.cjs                | PARTIAL | 244 lines, archiveWarmToCold works. searchCold() is a stub. Missing path validation                       |
| 9    | cold-storage tests              | PASS    | 7/7 pass                                                                                                  |
| 10   | Scheduler wiring                | FAIL    | Two critical bugs in memory-scheduler.cjs (C1, C2 below). learnings.md not added to sync-memory-index.cjs |
| 11   | Integration tests               | PASS    | 4/4 pass                                                                                                  |
| 12   | Config.yaml                     | PASS    | Memory section added with rotation/pruning/cold_storage config                                            |

### Deviations

1. **BLOCKING - C1:** memory-scheduler.cjs:426 accesses pruneResult.entriesRemoved but pruneResolvedEntries() returns { removed: N }. This produces NaN in totalPruned, silently breaking prune reporting.

2. **BLOCKING - C2:** memory-scheduler.cjs:420 passes { similarityThreshold: 0.6 } but deduplicateFile() accepts { threshold }. The option is ignored and the default threshold (0.5) is used instead. config.yaml sets 0.6 but this never reaches the function.

3. **NON-BLOCKING:** searchArchives() (Step 5) not implemented. Justified as deferred scope per learnings.md (searchCold stub acknowledged).

4. **NON-BLOCKING:** learnings.md not added to CORE_MEMORY_MARKDOWN_FILES in sync-memory-index.cjs. Rotation will not trigger for the largest memory file.

**Stage 1 Verdict:** PARTIAL PASS - Two blocking bugs (C1, C2) prevent scheduler deduplication/pruning from working correctly. The core modules (rotator, pruner, cold-storage) are individually sound.

---

## Stage 2: Code Quality (proceeding despite partial Stage 1 - bugs are isolated to wiring)

### Strengths

1. **TDD Discipline:** All 4 modules built with test-first methodology. 41 total tests (6 + 13 + 11 + 7 + 4) with 100% pass rate. Tests cover edge cases (empty files, PERMANENT sections, idempotent rotation, dry-run dedup).

2. **Security Controls Applied Correctly:**
   - MF-001 (safeParseJSON): Zero raw JSON.parse calls across all 4 new production files (verified via grep)
   - MF-002 (atomicWriteSync): Zero raw writeFileSync/appendFileSync calls across memory-rotator, smart-pruner, cold-storage (verified via grep)
   - MF-003 (scrubSensitiveContent): cold-storage.cjs calls scrubSensitiveContent() before JSONL write. Integration test verifies API keys are redacted in cold archives

3. **Module Size Discipline:** All modules under the 250-line target (84, 249, 212, 244). The original archived modules were 900 lines combined; the rebuild is approximately 789 lines total (12% under budget).

4. **Smart DRY Reuse:** smart-pruner.cjs imports parseSections from memory-rotator.cjs rather than duplicating section parsing logic.

5. **Graceful Integration:** sync-memory-index.cjs wraps rotation trigger in try-catch (lines 287-300), preventing hook crashes from blocking memory writes. memory-scheduler.cjs uses safeRequire for all new module imports.

6. **Well-Structured Config:** config.yaml memory section cleanly separates rotation, pruning, and cold_storage concerns with documented thresholds.

### Issues

#### Critical (Must Fix)

**C1: Property Name Mismatch in Scheduler (memory-scheduler.cjs:426)**

- File: .claude/lib/memory/memory-scheduler.cjs, line 426
- What: pruneResult.entriesRemoved should be pruneResult.removed
- Why: pruneResolvedEntries() returns { removed: N } not { entriesRemoved: N }. This causes totalPruned += undefined which produces NaN. The scheduler will report NaN for resolvedIssuesPruned in its result object.
- Fix: Change pruneResult.entriesRemoved to pruneResult.removed

**C2: Option Name Mismatch in Scheduler (memory-scheduler.cjs:420)**

- File: .claude/lib/memory/memory-scheduler.cjs, line 420
- What: { similarityThreshold: 0.6 } should be { threshold: 0.6 }
- Why: deduplicateFile() destructures { threshold = 0.5 } from options. Passing similarityThreshold is silently ignored, so the default 0.5 is always used. config.yaml sets 0.6 but it never reaches the function.
- Fix: Change { similarityThreshold: 0.6 } to { threshold: 0.6 }

#### Important (Should Fix)

**I1: searchArchives() Not Implemented (memory-rotator.cjs)**

- File: .claude/lib/memory/memory-rotator.cjs
- What: The implementation plan Step 5 specifies searchArchives(query, options) for searching warm archives. This function does not exist.
- Why: Without archive search, rotated content becomes effectively inaccessible unless users manually browse archive files.
- Fix: Implement searchArchives() with keyword matching across archive files, or document as intentionally deferred.

**I2: Missing Path Validation in Cold Storage (cold-storage.cjs)**

- File: .claude/lib/memory/cold-storage.cjs
- What: Docstring mentions validatePathWithinProject but function is never imported or called. Archive paths and cold storage paths are constructed without traversal validation.
- Why: Security review MF-003 requires path validation for archive operations. Without it, a crafted memoryDir argument could write cold archives outside the project.
- Fix: Import validatePathWithinProject from project-root.cjs and validate memoryDir, archiveDir, and coldDir paths.

**I3: Warm Archives Not Deleted After Cold Archival (cold-storage.cjs)**

- File: .claude/lib/memory/cold-storage.cjs
- What: After successfully writing entries to cold JSONL, the original warm archive .md files are not deleted. Cold archival adds data but never reclaims warm storage space.
- Why: This defeats the purpose of tiered storage. Warm archives will grow indefinitely even after cold archival.
- Fix: After successful cold write (verified), delete the source warm archive files.

**I4: Unused Import (cold-storage.cjs)**

- File: .claude/lib/memory/cold-storage.cjs
- What: safeParseJSON is imported from memory-manager.cjs but never used anywhere in the module.
- Why: Dead imports add confusion and suggest incomplete implementation. If JSONL parsing was planned, it should use safeParseJSON.
- Fix: Remove the unused import, or use it in searchCold() when implemented.

**I5: DRY Violation - Duplicate parseSections (cold-storage.cjs)**

- File: .claude/lib/memory/cold-storage.cjs, lines 124-175
- What: cold-storage.cjs has its own parseSections() function (52 lines) that duplicates memory-rotator.cjs parseSections().
- Why: smart-pruner.cjs correctly imports parseSections from memory-rotator.cjs. cold-storage should do the same. Maintaining two copies risks divergence.
- Fix: Import { parseSections } from memory-rotator.cjs instead of defining a local copy.

**I6: learnings.md Missing from Hook Trigger (sync-memory-index.cjs:36)**

- File: .claude/hooks/memory/sync-memory-index.cjs, line 36
- What: CORE_MEMORY_MARKDOWN_FILES only lists decisions.md and issues.md. learnings.md (the most active memory file) is not included.
- Why: The rotation trigger in the hook (lines 287-300) only fires when CORE_MEMORY_MARKDOWN_FILES are written. learnings.md writes will not trigger rotation checks, even though it is the file most likely to exceed the 20KB threshold.
- Fix: Add learnings.md to the CORE_MEMORY_MARKDOWN_FILES array.

#### Minor (Nice to Have)

**M1: Config Key Naming Inconsistency**

- config.yaml uses similarity_threshold (snake_case) but the code parameter is threshold (single word). While not technically broken (the scheduler translates), the naming gap makes the config less discoverable.

**M2: searchCold() Stub**

- cold-storage.cjs exports searchCold(query) that throws Not implemented yet. Either implement or remove from exports to avoid misleading consumers.

**M3: Regex Ordering Fragility in Sensitive Scrubber**

- sensitive-scrubber.cjs applies regex patterns in fixed order (JWT, email, API key). The negative lookahead to avoid re-redacting already-redacted content is fragile. Consider using a single-pass approach or documenting the required ordering.

**M4: No Provenance Headers**

- None of the 4 new production files include the workspace-conventions provenance header.

### Security Verification Results

| Security Control                   | Check Method                                                | Result                          |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------- |
| MF-001: No raw JSON.parse          | Grep for JSON.parse in 4 new files                          | 0 hits - PASS                   |
| MF-002: No raw writeFileSync       | Grep for writeFileSync/appendFileSync in 3 memory modules   | 0 hits - PASS                   |
| MF-003: Sensitive content scrubbed | Integration test verifies API keys redacted in cold archive | PASS                            |
| Path validation                    | Code review of cold-storage.cjs                             | FAIL - not implemented (see I2) |
| Backup before truncation           | memory-rotator.cjs calls createBackup()                     | PASS                            |

### Recommendations

1. **Immediate (before merge):** Fix C1 and C2 in memory-scheduler.cjs. These are two-line fixes that restore scheduler-to-module API contract compliance.

2. **Short-term:** Add learnings.md to CORE_MEMORY_MARKDOWN_FILES (I6). This is the highest-value memory file and needs rotation support.

3. **Short-term:** Add path validation to cold-storage.cjs (I2). Import validatePathWithinProject and validate all constructed paths.

4. **Short-term:** Remove duplicate parseSections from cold-storage.cjs (I5). Import from memory-rotator.cjs instead.

5. **Medium-term:** Implement warm archive deletion after cold archival (I3). Without this, the tiered storage system does not actually save disk space.

6. **Medium-term:** Implement searchArchives() for warm archive searchability (I1) or searchCold() for cold archive searchability (M2).

### BACKWARD_PROPAGATION

**Pattern**: Config key to code parameter translation scattered across callers
**Proposed Artifact**: None needed currently (only 1 instance in scheduler)
**Affected Files**: [.claude/lib/memory/memory-scheduler.cjs, .claude/config.yaml]
**Rationale**: If more config-driven modules are added, consider a config-to-options mapper utility
**Priority**: Watch (not yet P1/P2 threshold)

### Assessment

**Ready to merge?** No - requires C1 and C2 fixes first.

**Reasoning:** The core modules (sensitive-scrubber, memory-rotator, smart-pruner, cold-storage) are well-designed, thoroughly tested, and security-compliant. However, the wiring layer in memory-scheduler.cjs has two property name mismatches (C1: entriesRemoved vs removed, C2: similarityThreshold vs threshold) that cause silent failures in the deduplication and pruning pipeline. These are trivial two-line fixes. After fixing C1 and C2, the implementation is ready to merge with the Important issues tracked as follow-up tasks.
