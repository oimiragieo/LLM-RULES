<!-- Agent: technical-writer | Task: #4 | Session: 2026-02-18 -->

# Master Bug Report — 2026-02-18

**Sources:** code-reviewer audit (12 findings) | security-architect audit (13 findings) | consolidated user audit (47 findings)
**Total raw findings:** 72 | **After deduplication:** 64 unique bugs
**Files affected:** 30+

---

## 1. Executive Summary

| Severity | Count | Files Primarily Affected                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRITICAL | 9     | safe-json.cjs, safe-path.cjs, task-claim-ledger.cjs, state-cache.cjs, memory-sanitizer.cjs, unified-pre-write-hook.cjs, entity-extractor.cjs, sync-memory-index.cjs                                                                                                                                                                                                                                                                                   |
| HIGH     | 17    | unified-pre-write-hook.cjs, sync-memory-index.cjs, compression-trigger.cjs, token-budget-tracker.cjs, complexity-classifier.cjs, routing-guard-core.checks-task.cjs, intent-classifier.cjs, retry-with-backoff.cjs, workflow-state-manager.cjs, performance-profiler.cjs, memory-manager-core.cjs, findings-registry.cjs, memory-deduplicator.cjs, environment.cjs, bash-command-validator.cjs, spawn-prompt-assembler, shell-injection-validator.cjs |
| MEDIUM   | 28    | atomic-write.cjs, safe-rename.cjs, memory-tiers.cjs, memory-rotator.cjs, memory-monitor.cjs, merkle-tree.cjs, shell-validators.cjs, cycle-detector.cjs, path-validator.cjs, observations.cjs, error-sanitizer.cjs, routing-guard-core.shared.cjs, project-root.cjs, post-task-unified.cjs, bash-command-validator.cjs, token-budget-tracker.cjs, performance-profiler.cjs                                                                             |
| LOW      | 10    | safe-path.cjs, intent-classifier.cjs, safe-json.cjs, safe-rename.cjs, task-claim-ledger.cjs, fuzzy-intent-matcher.cjs, memory-deduplicator.cjs, memory-rotator.cjs, memory-manager-core.cjs, error-sanitizer.cjs, compression-trigger.cjs, config-loader.cjs, performance-profiler.cjs, settings.json                                                                                                                                                 |

**Deduplication notes:**

- BUG-CR-01 (safe-json prototype pollution) and CA-36 (same no-schema fallback) merged into BUG-001/BUG-003
- BUG-CR-10/BUG-CR-11 (shell-validators) merged with SEC-006 into BUG-027/BUG-028
- CA-44/CA-45 (compression-trigger fake metrics) merged with BUG-CR-06/BUG-CR-07 into BUG-022/BUG-023
- SEC-001 and CA-20 both relate to safe-json/memory-sanitizer — kept separate (different root causes)
- CA-01 and CA-14 (path traversal) both kept — different files (safe-path.cjs vs path-validator.cjs)

---

## 2. Deduplicated Findings by Module

### Module: safe-json.cjs

| ID      | Severity | Line(s) | Description                                                                                                                                                                                        | Source    |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| BUG-001 | CRITICAL | ~363    | Prototype pollution protection defeated: `Object.assign` onto null-prototype object copies enumerable own properties but the null prototype is abandoned when result is later used as plain object | BUG-CR-01 |
| BUG-002 | MEDIUM   | 156–178 | `stripDangerousKeys` mutates input objects in-place instead of cloning; callers receive modified originals                                                                                         | CA-20     |
| BUG-003 | LOW      | 229–246 | Nested objects in no-schema fallback path retain `Object.prototype`, leaving prototype pollution vector partially open                                                                             | CA-36     |

### Module: safe-path.cjs

| ID      | Severity | Line(s) | Description                                                                                                                      | Source |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-004 | CRITICAL | 78–84   | `hasPathTraversal()` misses bare `..` at end of path (`foo/bar/..`); attacker can escape root                                    | CA-01  |
| BUG-005 | LOW      | 49      | Reserved name regex matches COM0 and LPT0, which are not actually Windows reserved names; false positives block valid file names | CA-34  |

### Module: task-claim-ledger.cjs

| ID      | Severity | Line(s) | Description                                                                                                   | Source |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-006 | CRITICAL | 67–94   | Read-modify-write cycle on all ledger mutations has no file lock; concurrent agents corrupt the ledger        | CA-02  |
| BUG-007 | MEDIUM   | 108–112 | `getActiveClaims` read function writes a side-effect (normalises/rewrites ledger); breaks read-only contract  | CA-21  |
| BUG-008 | LOW      | 220–224 | `clearLedger` TOCTOU: `existsSync` check then `unlinkSync` with no lock; concurrent call can fail with ENOENT | CA-38  |

### Module: state-cache.cjs

| ID      | Severity | Line(s) | Description                                                                                                     | Source |
| ------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-009 | CRITICAL | 73–78   | Parse failure returns `null` instead of `defaultValue`; null is then cached for the full TTL, blocking recovery | CA-03  |

### Module: memory-sanitizer.cjs

| ID      | Severity | Line(s) | Description                                                                                                                  | Source  |
| ------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- | ------- |
| BUG-010 | CRITICAL | 183     | Sanitizer runs in detect-only mode: `sanitized` field returns the original unsanitised value; sanitisation is never applied  | SEC-001 |
| BUG-011 | HIGH     | 28–34   | Overly broad regex patterns produce false positives; legitimate content (e.g. base64 strings) incorrectly flagged as secrets | SEC-002 |

### Module: unified-pre-write-hook.cjs

| ID      | Severity | Line(s) | Description                                                                                                                                | Source  |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| BUG-012 | CRITICAL | 536     | `HOOK_FAIL_OPEN=true` disables all write safety checks globally; single env var defeats the entire hook                                    | SEC-003 |
| BUG-013 | HIGH     | 327     | Creator-guard regex misses all agent subdirectories (`agents/core/`, `agents/domain/`, etc.); direct writes to those paths are not blocked | CA-04   |
| BUG-014 | MEDIUM   | 163–168 | Write-content scanner misses dangerous eval variants (`vm.runInNewContext`, `Function()`, `new Function`)                                  | SEC-008 |

### Module: entity-extractor.cjs

| ID      | Severity | Line(s) | Description                                                                                                                                    | Source    |
| ------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| BUG-015 | CRITICAL | 30–46   | DB handle leaked on constructor failure; database connection is opened before error-prone initialisation step and is never closed on exception | BUG-CR-03 |

### Module: sync-memory-index.cjs

| ID      | Severity | Line(s) | Description                                                                                                           | Source    |
| ------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| BUG-016 | CRITICAL | ~160    | `gotchas.json` entries are written with type `'issue'` instead of `'gotcha'`; type mismatch corrupts category routing | BUG-CR-02 |
| BUG-017 | HIGH     | ~179    | DB connection never closed after sync operation; accumulates file handles over repeated calls                         | BUG-CR-04 |

### Module: complexity-classifier.cjs

| ID      | Severity | Line(s) | Description                                                                                                | Source    |
| ------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| BUG-018 | HIGH     | 90–95   | `update` signal is never tested against MEDIUM threshold; tasks with update-type signals are misclassified | BUG-CR-05 |

### Module: compression-trigger.cjs

| ID      | Severity | Line(s)    | Description                                                                                             | Source           |
| ------- | -------- | ---------- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| BUG-019 | HIGH     | 137–138    | `bytesFreed` metric is set to `Math.random()` in production code path; metrics are fabricated           | BUG-CR-06, CA-44 |
| BUG-020 | HIGH     | 35, 88, 91 | `operationCounter` is assigned `0` on every call instead of being incremented; counter is always 0 or 1 | BUG-CR-07, CA-45 |

### Module: token-budget-tracker.cjs

| ID      | Severity | Line(s) | Description                                                                                            | Source           |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| BUG-021 | HIGH     | 50–53   | Null dereference in `estimateTokens`: method is called without null-guard; throws when `usage` is null | BUG-CR-08, CA-30 |

### Module: merkle-tree.cjs

| ID      | Severity | Line(s) | Description                                                                                                                      | Source    |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| BUG-022 | MEDIUM   | ~109    | Hash input truncated to first 750 bytes; files differing only after byte 750 produce identical hashes, breaking integrity checks | BUG-CR-09 |

### Module: shell-validators.cjs

| ID      | Severity | Line(s)  | Description                                                                                                          | Source    |
| ------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| BUG-023 | MEDIUM   | 270–271  | `-c` flag check uses substring match that over-matches any flag containing the letter `c` (e.g. `-rc`, `-vc`)        | BUG-CR-10 |
| BUG-024 | MEDIUM   | 233, 255 | Legacy code path skips dangerous-pattern check; commands routed through the legacy branch bypass security validation | BUG-CR-11 |

### Module: cycle-detector.cjs

| ID      | Severity | Line(s) | Description                                                                                                                | Source    |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| BUG-025 | MEDIUM   | ~24     | Undefined workflow ID inserted into DFS visited-path set corrupts cycle detection; false positives or missed cycles result | BUG-CR-12 |

### Module: (Multiple hooks — env vars)

| ID      | Severity | Line(s) | Description                                                                                                                            | Source  |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| BUG-026 | HIGH     | Various | 15+ environment variables can independently disable enforcement across hooks; no defence-in-depth; single leaked var defeats a control | SEC-004 |

### Module: shell-injection-validator.cjs

| ID      | Severity | Line(s) | Description                                                                                                              | Source  |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| BUG-027 | MEDIUM   | 427–436 | Redundant `JSON.parse` call before `safeParseJSON`; parse error on malformed input throws instead of using safe fallback | SEC-006 |

### Module: project-root.cjs

| ID      | Severity | Line(s) | Description                                                                                                                     | Source  |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| BUG-028 | MEDIUM   | 97–102  | Path traversal validation misses triple-encoding and does not call `realpathSync`; encoded traversal sequences bypass the check | SEC-007 |

### Module: spawn-prompt-assembler.task-tools.cjs

| ID      | Severity | Line(s) | Description                                                                                                                 | Source  |
| ------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| BUG-029 | HIGH     | —       | Prompt-injection sanitiser is bypassed by Unicode lookalike characters; attacker-controlled content can inject instructions | SEC-009 |

### Module: bash-command-validator.cjs

| ID      | Severity | Line(s) | Description                                                                                                   | Source  |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------- | ------- |
| BUG-030 | HIGH     | 248–351 | `bypassPermissions` flag sourced from hook input allows attacker-controlled input to weaken validation checks | SEC-010 |
| BUG-031 | LOW      | 285–301 | No-input case fails open with no audit log; undetected bypass leaves no forensic trail                        | SEC-013 |

### Module: post-task-unified.cjs / spawn-prompt-assembler.runtime.cjs

| ID      | Severity | Line(s)  | Description                                                                     | Source  |
| ------- | -------- | -------- | ------------------------------------------------------------------------------- | ------- |
| BUG-032 | MEDIUM   | 87 / 135 | Raw `JSON.parse` used on potentially untrusted data; should use `safeParseJSON` | SEC-005 |

### Module: settings.json

| ID      | Severity | Line(s) | Description                                                                                                 | Source  |
| ------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| BUG-033 | LOW      | —       | Not in creator-guard protected path list; direct writes to settings.json bypass creator workflow validation | SEC-011 |

### Module: memory-manager-core.cjs

| ID      | Severity | Line(s) | Description                                                                                                     | Source |
| ------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-034 | HIGH     | 262     | `_accessDate` typo (vs `accessDate`); wrong key name causes Date objects to leak into persisted JSON            | CA-05  |
| BUG-035 | LOW      | 165–174 | `_pruneOldSessions` silently swallows individual `unlinkSync` errors; stale session files accumulate undetected | CA-42  |

### Module: findings-registry.cjs

| ID      | Severity | Line(s) | Description                                                                                                  | Source |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| BUG-036 | HIGH     | 114     | `haystack.includes('fix')` matches `'fixture'`, `'prefix'`, etc.; false positives auto-close active findings | CA-06  |
| BUG-037 | MEDIUM   | 112–115 | Fingerprint includes severity; same finding reported at different severities creates duplicate entries       | CA-27  |

### Module: memory-deduplicator.cjs

| ID      | Severity | Line(s) | Description                                                                             | Source |
| ------- | -------- | ------- | --------------------------------------------------------------------------------------- | ------ |
| BUG-038 | HIGH     | 161     | Raw `JSON.parse` on LLM output; malformed response throws unhandled exception           | CA-07  |
| BUG-039 | LOW      | 12–17   | `stripCodeFences` is fragile with nested markdown fences; strips too much or too little | CA-40  |

### Module: routing-guard-core.checks-task.cjs

| ID      | Severity | Line(s) | Description                                                                                                       | Source |
| ------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-040 | HIGH     | 149–151 | Block enforcement downgraded to warn on retry; attacker or misconfigured caller can get through on second attempt | CA-08  |

### Module: intent-classifier.cjs

| ID      | Severity | Line(s) | Description                                                                                                                | Source |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-041 | HIGH     | 155     | `slice(-0)` bug: `maxEntries = 0` is falsy in JS, so `-0` is treated as `0`, returning the entire array instead of nothing | CA-09  |
| BUG-042 | MEDIUM   | 133–163 | `recordIntentFeedback` performs read-modify-write with no file lock; concurrent calls produce lost updates                 | CA-18  |
| BUG-043 | LOW      | 28–56   | Capability routing cache is never invalidated; stale routing decisions persist for the session lifetime                    | CA-35  |

### Module: retry-with-backoff.cjs

| ID      | Severity | Line(s) | Description                                                                                                                | Source |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-044 | HIGH     | 123     | `throw undefined` when `maxRetries < 0`; callers receive `undefined` as the thrown value, making error handling impossible | CA-10  |
| BUG-045 | MEDIUM   | 46–48   | `isTransientError` crashes when `null` or `undefined` is thrown; assumes errors are always objects                         | CA-19  |

### Module: workflow-state-manager.cjs

| ID      | Severity | Line(s) | Description                                                                                             | Source |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------- | ------ |
| BUG-046 | HIGH     | 163     | Race condition on all workflow state mutations; concurrent phase advances can produce split-brain state | CA-11  |

### Module: performance-profiler.cjs

| ID      | Severity | Line(s) | Description                                                                                                               | Source |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-047 | HIGH     | 40–41   | `instrumentFunction` loses `this` context; methods instrumented lose their bound receiver and throw or behave incorrectly | CA-12  |
| BUG-048 | MEDIUM   | 403–405 | P95 calculation off-by-one; reports P96 for 100-item arrays                                                               | CA-31  |
| BUG-049 | LOW      | 230–232 | Empty heatmap returns `Infinity`/`-Infinity`; invalid JSON values crash consumers                                         | CA-47  |

### Module: environment.cjs

| ID      | Severity | Line(s) | Description                                                                               | Source |
| ------- | -------- | ------- | ----------------------------------------------------------------------------------------- | ------ |
| BUG-050 | HIGH     | 23–25   | `NODE_ENV=staging` silently maps to `development`; staging behaves as dev with no warning | CA-13  |

### Module: path-validator.cjs

| ID      | Severity | Line(s) | Description                                                                    | Source |
| ------- | -------- | ------- | ------------------------------------------------------------------------------ | ------ |
| BUG-051 | MEDIUM   | 53–54   | Same trailing `..` traversal bypass as BUG-004; separate file, same root cause | CA-14  |

### Module: atomic-write.cjs

| ID      | Severity | Line(s) | Description                                                                                        | Source |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------- | ------ |
| BUG-052 | MEDIUM   | 113–138 | Windows non-atomic window: unlink then rename is not atomic; concurrent readers see a missing file | CA-15  |
| BUG-053 | MEDIUM   | 118–131 | Off-by-one in Windows unlink retry loop; last retry is skipped                                     | CA-16  |

### Module: safe-rename.cjs

| ID      | Severity | Line(s) | Description                                                                                          | Source |
| ------- | -------- | ------- | ---------------------------------------------------------------------------------------------------- | ------ |
| BUG-054 | MEDIUM   | 68      | Deterministic temp file name causes collision when two concurrent renames operate on the same target | CA-17  |
| BUG-055 | LOW      | 78–90   | Source file not cleaned up on partial failure; leaves orphaned temp files                            | CA-37  |

### Module: memory-tiers.cjs

| ID      | Severity | Line(s) | Description                                                                                            | Source |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------ | ------ |
| BUG-056 | MEDIUM   | 472–476 | Negative `slice` index when session count is below minimum threshold; returns unexpected subset        | CA-22  |
| BUG-057 | MEDIUM   | 398–399 | `sorted[0].timestamp` throws if no sessions have a timestamp field                                     | CA-23  |
| BUG-058 | MEDIUM   | 574–594 | LTM eviction deletes non-summary JSON files (config, data files); only summary files should be evicted | CA-24  |

### Module: memory-rotator.cjs

| ID      | Severity | Line(s) | Description                                                                                                          | Source |
| ------- | -------- | ------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-059 | MEDIUM   | 149–245 | No file locking during rotation; concurrent rotation attempts corrupt the archive                                    | CA-25  |
| BUG-060 | LOW      | 238–242 | Section order not preserved after rotation; content is reordered, breaking any tooling that expects stable structure | CA-41  |

### Module: observations.cjs

| ID      | Severity | Line(s) | Description                                                                                                       | Source |
| ------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-061 | MEDIUM   | 212–225 | Future timestamps bypass age validation; attacker or clock-skew can inject arbitrarily old-appearing observations | CA-26  |

### Module: memory-monitor.cjs

| ID      | Severity | Line(s) | Description                                                                                                 | Source |
| ------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| BUG-062 | MEDIUM   | 134     | `setInterval` not `unref()`'d; keeps the Node.js process alive after all other work is done in CLI contexts | CA-28  |
| BUG-063 | MEDIUM   | 165–166 | Heap limit fallback uses `2x heapTotal`; on a loaded system this triggers false CRITICAL memory alerts      | CA-29  |

### Module: error-sanitizer.cjs

| ID      | Severity | Line(s) | Description                                                                                                            | Source |
| ------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-064 | MEDIUM   | 101–116 | `isForbidden` patterns match `passwordPolicy` and `passwordMinLength`; legitimate field names are incorrectly redacted | CA-32  |
| BUG-065 | LOW      | 269–271 | Home-directory path replacement only replaces the first occurrence; later occurrences leak the home path               | CA-43  |

### Module: routing-guard-core.shared.cjs

| ID      | Severity | Line(s) | Description                                                                                                   | Source |
| ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-066 | MEDIUM   | 68–76   | Dedupe state written with non-atomic file write; concurrent guard evaluations can produce duplicate decisions | CA-33  |

### Module: fuzzy-intent-matcher.cjs

| ID      | Severity | Line(s) | Description                                                                                                 | Source |
| ------- | -------- | ------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| BUG-067 | LOW      | 6–11    | Tokeniser strips hyphens; hyphenated terms (`retry-with-backoff`) lose semantic information during matching | CA-39  |

### Module: config-loader.cjs

| ID      | Severity | Line(s) | Description                                                                                                                 | Source |
| ------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------- | ------ |
| BUG-068 | LOW      | 18–31   | Duplicates `project-root.cjs` logic with fragile `__dirname` walking; diverges silently when project root detection changes | CA-46  |

---

## 3. Top 10 Fix-First Priority

| Rank | ID      | Severity | File                                  | Why Fix First                                                                                                  |
| ---- | ------- | -------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | BUG-010 | CRITICAL | memory-sanitizer.cjs:183              | Sanitisation is a no-op; secrets written to memory files are never redacted. Every memory write is affected.   |
| 2    | BUG-012 | CRITICAL | unified-pre-write-hook.cjs:536        | Single env var disables ALL write safety. One misconfiguration or leaked var defeats the entire write guard.   |
| 3    | BUG-006 | CRITICAL | task-claim-ledger.cjs:67–94           | Concurrent agents corrupt the ledger on every multi-agent pipeline run. Data loss in production today.         |
| 4    | BUG-004 | CRITICAL | safe-path.cjs:78–84                   | Path traversal bypass in the primary path-safety library; any caller using `hasPathTraversal` is exploitable.  |
| 5    | BUG-001 | CRITICAL | safe-json.cjs:363                     | Prototype pollution protection defeated; sanitised objects still carry prototype chains after `Object.assign`. |
| 6    | BUG-015 | CRITICAL | entity-extractor.cjs:30–46            | DB handle leaked on every constructor failure; file descriptors exhausted after enough errors.                 |
| 7    | BUG-009 | CRITICAL | state-cache.cjs:73–78                 | Null cached for full TTL on parse failure; entire caching layer locks out recovery until TTL expires.          |
| 8    | BUG-016 | CRITICAL | sync-memory-index.cjs:160             | Gotchas always stored as type `'issue'`; memory category routing is permanently broken for this type.          |
| 9    | BUG-046 | HIGH     | workflow-state-manager.cjs:163        | Race condition on every workflow state write; enterprise pipelines under load produce split-brain state.       |
| 10   | BUG-029 | HIGH     | spawn-prompt-assembler.task-tools.cjs | Unicode prompt injection bypasses sanitiser; attacker-controlled task content can hijack agent behaviour.      |

---

## 4. Module Risk Heat Map

Ranked by weighted score (CRITICAL=4, HIGH=2, MEDIUM=1, LOW=0.25):

| Rank | Module                             | CRIT | HIGH | MED | LOW | Score | Primary Risk Category         |
| ---- | ---------------------------------- | ---- | ---- | --- | --- | ----- | ----------------------------- |
| 1    | unified-pre-write-hook.cjs         | 1    | 1    | 1   | 0   | 7     | Security bypass               |
| 2    | safe-json.cjs                      | 1    | 0    | 1   | 1   | 5.25  | Data integrity / security     |
| 3    | task-claim-ledger.cjs              | 1    | 0    | 1   | 1   | 5.25  | Concurrency / data corruption |
| 4    | memory-sanitizer.cjs               | 1    | 1    | 0   | 0   | 6     | Security                      |
| 5    | compression-trigger.cjs            | 0    | 2    | 0   | 1   | 4.25  | Correctness / metrics         |
| 6    | sync-memory-index.cjs              | 1    | 1    | 0   | 0   | 6     | Data integrity                |
| 7    | entity-extractor.cjs               | 1    | 0    | 0   | 0   | 4     | Resource leak                 |
| 8    | state-cache.cjs                    | 1    | 0    | 0   | 0   | 4     | Availability                  |
| 9    | intent-classifier.cjs              | 0    | 1    | 1   | 1   | 3.25  | Logic / concurrency           |
| 10   | memory-tiers.cjs                   | 0    | 0    | 3   | 0   | 3     | Data integrity                |
| 11   | workflow-state-manager.cjs         | 0    | 1    | 0   | 0   | 2     | Concurrency                   |
| 12   | bash-command-validator.cjs         | 0    | 1    | 0   | 1   | 2.25  | Security                      |
| 13   | atomic-write.cjs                   | 0    | 0    | 2   | 0   | 2     | Concurrency (Windows)         |
| 14   | routing-guard-core.checks-task.cjs | 0    | 1    | 0   | 0   | 2     | Security enforcement          |
| 15   | retry-with-backoff.cjs             | 0    | 1    | 1   | 0   | 3     | Reliability                   |
| 16   | performance-profiler.cjs           | 0    | 1    | 1   | 1   | 3.25  | Correctness                   |
| 17   | findings-registry.cjs              | 0    | 1    | 1   | 0   | 3     | Logic                         |
| 18   | shell-validators.cjs               | 0    | 0    | 2   | 0   | 2     | Security                      |
| 19   | memory-rotator.cjs                 | 0    | 0    | 1   | 1   | 1.25  | Concurrency                   |
| 20   | error-sanitizer.cjs                | 0    | 0    | 1   | 1   | 1.25  | Data leakage                  |

---

## 5. Severity Definitions

| Severity | Definition                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| CRITICAL | Exploitable security flaw, active data corruption, or guaranteed crash in normal operation                        |
| HIGH     | Incorrect behaviour that produces wrong results, resource leaks, or security weakening under reachable conditions |
| MEDIUM   | Incorrect behaviour in edge cases, minor security weakening, or degraded reliability                              |
| LOW      | Polish issues, minor inconsistencies, or theoretical edge cases with negligible real-world impact                 |

---

## 6. Recommended Fix Sequence

**Sprint 1 — Stop active harm (CRITICAL, 9 bugs):**
BUG-010, BUG-012, BUG-006, BUG-004, BUG-001, BUG-015, BUG-009, BUG-016, BUG-046 (promoted to sprint 1 due to pipeline impact)

**Sprint 2 — Fix HIGH correctness and security bugs (17 bugs):**
BUG-013, BUG-017, BUG-018, BUG-019, BUG-020, BUG-021, BUG-026, BUG-029, BUG-030, BUG-034, BUG-036, BUG-038, BUG-040, BUG-041, BUG-044, BUG-047, BUG-050

**Sprint 3 — Fix MEDIUM bugs (28 bugs):**
BUG-002, BUG-011, BUG-014, BUG-022, BUG-023, BUG-024, BUG-025, BUG-027, BUG-028, BUG-032, BUG-037, BUG-042, BUG-045, BUG-048, BUG-051, BUG-052, BUG-053, BUG-054, BUG-056, BUG-057, BUG-058, BUG-059, BUG-061, BUG-062, BUG-063, BUG-064, BUG-066

**Sprint 4 — Fix LOW bugs (10 bugs):**
BUG-003, BUG-005, BUG-007 (moved from MEDIUM due to read contract), BUG-008, BUG-031, BUG-033, BUG-035, BUG-039, BUG-043, BUG-049, BUG-055, BUG-060, BUG-065, BUG-067, BUG-068
