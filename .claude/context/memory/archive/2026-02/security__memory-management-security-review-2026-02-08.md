<!-- Agent: security-architect | Task: #7B | Session: 2026-02-08 -->

# Memory Management Rebuild -- Security Review

**Date:** 2026-02-08
**Scope:** Memory Rotator, Smart Pruner, Cold Storage (rebuild from archived modules)
**Reviewer:** Security Architect Agent
**Methodology:** STRIDE threat model + OWASP analysis + IEEE 1028 hybrid validation
**Verdict:** APPROVED WITH CONDITIONS (must-fix items block implementation)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Components Under Review](#2-components-under-review)
3. [Threat Model (STRIDE)](#3-threat-model-stride)
4. [Risk Matrix](#4-risk-matrix)
5. [Required Mitigations (Must-Fix)](#5-required-mitigations-must-fix)
6. [Recommended Mitigations (Should-Fix)](#6-recommended-mitigations-should-fix)
7. [Security Test Cases](#7-security-test-cases)
8. [Existing Vulnerability Cross-References](#8-existing-vulnerability-cross-references)
9. [IEEE 1028 Security Checklist](#9-ieee-1028-security-checklist)

---

## 1. Executive Summary

This security review covers the rebuild of three memory management features that were archived in Phase 1 dead code cleanup (Task #3, 2026-02-08). The modules operate on `.claude/context/memory/` files containing learnings, decisions, issues, gotchas, patterns, and codebase maps.

**Key Findings:**
- 3 HIGH severity findings requiring mitigation before implementation
- 4 MEDIUM severity findings requiring mitigation before wider deployment
- 3 LOW severity findings for defense-in-depth hardening
- Multiple cross-references to existing systemic issues (SEC-CTX-001, SEC-LIB-005)

**Overall Risk:** MEDIUM-HIGH. These components perform destructive file operations (delete, move, archive, compress) on persistent memory that agents rely on for context continuity. Data loss or corruption directly degrades all agent behavior.

---

## 2. Components Under Review

### 2.1 Memory Rotator

**Purpose:** Move entries between `decisions.md`, `issues.md`, and `learnings.md` based on size thresholds and age policies. Creates archive files in `.claude/context/memory/archive/`.

**Operations:**
- Read markdown files, parse entries by heading boundaries
- Evaluate entry age via date extraction from headings/content
- Split file into "keep" (recent) and "archive" (old) segments
- Write archive file (append or create)
- Overwrite original file with truncated content

**Archived source:** `.claude/lib/memory/_archive/memory-rotator.cjs` (archived 2026-02-08)

### 2.2 Smart Pruner

**Purpose:** Deduplicate and remove low-utility memory entries from `gotchas.json` and `patterns.json` using Jaccard similarity and utility scoring (recency, frequency, importance).

**Operations:**
- Load JSON arrays from gotchas.json and patterns.json
- Calculate utility scores per entry (recency/frequency/importance weighted)
- Detect duplicates using Jaccard word overlap
- Remove entries below utility threshold or above similarity threshold
- Write pruned arrays back to JSON files

**Archived source:** `.claude/lib/memory/_archive/smart-pruner.cjs` (archived 2026-02-08)

### 2.3 Cold Storage

**Purpose:** Tier LTM summary files into compressed cold archives. Moves old `summary_*.json` files from `ltm/` into gzip'd JSONL files in `ltm/cold/`.

**Operations:**
- Enumerate `summary_*.json` files in LTM directory
- Select files older than retention threshold
- Compress selected files into `.jsonl.gz` archive
- Delete original files after successful archival
- Optionally index into LanceDB for searchability

**Archived source:** `.claude/lib/memory/_archive/cold-storage.cjs` (archived 2026-02-08)

---

## 3. Threat Model (STRIDE)

### 3.1 Spoofing

| ID | Threat | Component | Likelihood | Impact | Risk |
|----|--------|-----------|------------|--------|------|
| S-MEM-001 | Spoofed entry timestamps cause incorrect age-based rotation | Rotator | LOW | MEDIUM | LOW |
| S-MEM-002 | Spoofed `accessCount`/`lastAccessed` fields inflate utility scores, preventing pruning of stale entries | Pruner | LOW | LOW | LOW |

**Analysis:** Entry timestamps are self-reported by agents. A malicious or buggy agent could inject entries with future dates to prevent rotation. However, since all agents run in the same trust boundary (Claude Code session), the spoofing threat is limited to accidental corruption rather than intentional attack.

### 3.2 Tampering

| ID | Threat | Component | Likelihood | Impact | Risk |
|----|--------|-----------|------------|--------|------|
| T-MEM-001 | **Archive file path injection**: Constructed archive paths (e.g., `archive/YYYY-MM/decisions-YYYY-MM.md`) could be manipulated if date values contain path separators | Rotator | MEDIUM | HIGH | **HIGH** |
| T-MEM-002 | **JSON prototype pollution**: `JSON.parse()` of gotchas.json/patterns.json without prototype pollution protection could inject `__proto__` properties | Pruner | MEDIUM | HIGH | **HIGH** |
| T-MEM-003 | **Partial write corruption**: Interrupted rotation leaves original file truncated but archive not yet written | Rotator | MEDIUM | HIGH | **HIGH** |
| T-MEM-004 | **Cold archive tampering**: Compressed `.jsonl.gz` files have no integrity verification (no HMAC or checksum) | Cold Storage | LOW | MEDIUM | MEDIUM |
| T-MEM-005 | **Race condition in read-modify-write**: Concurrent maintenance tasks (scheduler runs daily+weekly) could read stale data and overwrite concurrent changes | All | MEDIUM | MEDIUM | MEDIUM |

### 3.3 Repudiation

| ID | Threat | Component | Likelihood | Impact | Risk |
|----|--------|-----------|------------|--------|------|
| R-MEM-001 | No audit trail for which entries were pruned/rotated/archived | All | HIGH | MEDIUM | MEDIUM |
| R-MEM-002 | Pruning deletes entries permanently with no undo mechanism beyond git | Pruner | MEDIUM | MEDIUM | MEDIUM |

### 3.4 Information Disclosure

| ID | Threat | Component | Likelihood | Impact | Risk |
|----|--------|-----------|------------|--------|------|
| I-MEM-001 | **Sensitive data persists in cold storage**: Entries containing credentials, tokens, or PII that should have been purged are instead compressed and archived indefinitely | Cold Storage | MEDIUM | HIGH | **HIGH** |
| I-MEM-002 | Archive files not covered by `.gitignore` could be committed, exposing historical memory content to version control | Rotator, Cold Storage | LOW | MEDIUM | LOW |
| I-MEM-003 | Error messages in pruner/rotator could leak file content to stderr/logs | All | LOW | LOW | LOW |

### 3.5 Denial of Service

| ID | Threat | Component | Likelihood | Impact | Risk |
|----|--------|-----------|------------|--------|------|
| D-MEM-001 | **Disk exhaustion during archival**: Archive files grow without bound; no maximum archive size enforced | Rotator, Cold Storage | MEDIUM | MEDIUM | MEDIUM |
| D-MEM-002 | **Corrupted JSON crashes all memory operations**: A malformed gotchas.json or patterns.json causes `JSON.parse()` to throw, and if not caught at every call site, propagates up to crash the maintenance scheduler | Pruner | MEDIUM | HIGH | MEDIUM |
| D-MEM-003 | **Infinite loop in entry parsing**: Malformed markdown with missing heading boundaries causes rotation parser to process endlessly or produce empty output | Rotator | LOW | MEDIUM | LOW |
| D-MEM-004 | **Large file compression OOM**: Compressing very large LTM files with `zlib.gzipSync()` loads entire content into memory | Cold Storage | LOW | MEDIUM | LOW |

### 3.6 Elevation of Privilege

| ID | Threat | Component | Likelihood | Impact | Risk |
|----|--------|-----------|------------|--------|------|
| E-MEM-001 | **Archive path traversal**: If `archiveOldLTM` constructs cold storage paths from user-influenced data (session IDs, timestamps), path traversal could write files outside the memory directory | Cold Storage | LOW | HIGH | MEDIUM |
| E-MEM-002 | **Scheduler task injection**: `runArchiveOldLTM()` in memory-scheduler.cjs uses `spawnSync` with `--input-type=module -e script` where the script embeds `projectRoot` via `JSON.stringify`. If projectRoot were attacker-controlled, this would allow code injection | Cold Storage (via Scheduler) | LOW | CRITICAL | MEDIUM |

---

## 4. Risk Matrix

| Risk Level | Count | Findings |
|------------|-------|----------|
| **HIGH** | 3 | T-MEM-001, T-MEM-002, I-MEM-001 |
| **MEDIUM** | 4 | T-MEM-004, T-MEM-005, R-MEM-001, D-MEM-001 |
| **LOW** | 3 | S-MEM-001, D-MEM-003, I-MEM-002 |

### Risk Heat Map

```
              LOW Impact    MEDIUM Impact   HIGH Impact    CRITICAL Impact
HIGH Lklhd                 R-MEM-001
MED  Lklhd   S-MEM-002     T-MEM-005       T-MEM-001
                            D-MEM-001       T-MEM-002
                            D-MEM-002       I-MEM-001
LOW  Lklhd   D-MEM-003     T-MEM-004       E-MEM-001      E-MEM-002
              I-MEM-002     D-MEM-004
              I-MEM-003
```

---

## 5. Required Mitigations (Must-Fix Before Implementation)

### MF-001: Prototype Pollution Protection for JSON.parse (T-MEM-002)

**Severity:** HIGH
**Component:** Smart Pruner (also affects memory-manager.cjs existing code)
**Cross-Reference:** SEC-CTX-001, SEC-LIB-005, SEC-LIB-006

**Problem:** All `JSON.parse()` calls on gotchas.json, patterns.json, codebase_map.json, and maintenance-status.json use raw `JSON.parse()` without prototype pollution protection. An entry in these JSON files with a key of `__proto__`, `constructor`, or `prototype` could modify the Object prototype and affect all subsequent code execution.

**Existing Vulnerable Calls (in active code):**
- `memory-manager.cjs` lines 313, 599, 700, 758, 817, 968, 1016, 1176, 1228, 1242, 1256
- `memory-tiers.cjs` lines 219, 259, 304
- `memory-scheduler.cjs` lines 122, 292, 443
- `contextual-memory.cjs` lines 53, 368, 380, 413, 458
- `memory-dashboard.cjs` lines 100, 324, 494

**Mitigation:**
```javascript
// Use safe JSON parse pattern (from router-state.cjs which already implements this)
function safeJSONParse(content) {
  const parsed = JSON.parse(content);
  if (parsed && typeof parsed === 'object') {
    // Prevent prototype pollution
    delete parsed.__proto__;
    delete parsed.constructor;
    delete parsed.prototype;
  }
  return parsed;
}
```

Alternatively, use `JSON.parse(content, (key, value) => { if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined; return value; })` as a reviver.

**Implementation requirement:** Create a shared `safeJSONParse()` in `.claude/lib/utils/safe-json-parse.cjs` and use it in ALL memory module JSON.parse calls. This addresses the systemic SEC-CTX-001 finding.

### MF-002: Atomic Archive-Then-Truncate Pattern (T-MEM-003)

**Severity:** HIGH
**Component:** Memory Rotator

**Problem:** The archived rotator used a two-step pattern: (1) write archive file, (2) write truncated original. If the process crashes between steps 1 and 2, the original file is untouched and no data is lost, which is safe. However, if it crashes during step 2 (mid-write of truncated original), the original is corrupted.

The archived code used `fs.writeFileSync()` directly for the truncated file. This must use `atomicWriteSync()` from `atomic-write.cjs`, which the codebase already has.

**Mitigation:**
1. Use `atomicWriteSync()` for ALL file writes (archive file AND truncated original)
2. Use `createBackup()` from `atomic-write.cjs` before any destructive operation
3. Implement a two-phase commit pattern:
   - Phase 1: Write archive file (atomically)
   - Phase 2: Write truncated original (atomically, with backup)
   - Recovery: If phase 2 fails, the backup allows restoration

**Implementation requirement:** Replace all `fs.writeFileSync()` calls in the rotator with `atomicWriteSync()`. Create backup before truncation. The existing `atomic-write.cjs` provides all needed primitives including `createBackup()` and `restoreFromBackup()`.

### MF-003: Sensitive Data Scrubbing Before Cold Archival (I-MEM-001)

**Severity:** HIGH
**Component:** Cold Storage

**Problem:** Memory entries may contain sensitive data (API keys, tokens, credentials, PII) that agents inadvertently recorded. When cold storage compresses these into long-lived `.jsonl.gz` archives, this sensitive data becomes permanently preserved and harder to discover/purge than plaintext files.

**Examples of sensitive data that could appear:**
- API keys or tokens mentioned in learnings/issues ("Fixed issue with API key `sk-abc123`")
- File paths containing usernames or system information
- Error messages containing credentials from stack traces

**Mitigation:**
1. Implement a `scrubSensitiveContent()` function that runs on each entry before archival
2. Pattern-match and redact:
   - API key patterns: `/(sk-|api[_-]?key|token|secret|password|credential)[=:\s]+\S{8,}/gi` -> `[REDACTED]`
   - Email addresses: `/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi` -> `[EMAIL-REDACTED]`
   - IP addresses in non-localhost ranges
   - JWT tokens: `/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g` -> `[JWT-REDACTED]`
3. Log a warning when scrubbing occurs so operators know data was redacted

**Implementation requirement:** The scrubbing function must run BEFORE compression. It should be a separate utility in `.claude/lib/utils/` so other memory modules can reuse it.

---

## 6. Recommended Mitigations (Should-Fix)

### RF-001: Archive Path Validation (T-MEM-001)

**Severity:** MEDIUM (downgraded from HIGH because dates are internally generated)
**Component:** Memory Rotator, Cold Storage

**Problem:** Archive paths like `archive/YYYY-MM/decisions-YYYY-MM.md` are constructed using date values. While these dates are currently generated by `new Date()` (safe), the pattern is fragile. If a future refactor passes user-influenced dates, path traversal becomes possible.

**Mitigation:**
1. Validate all constructed archive paths with `validatePathWithinProject()` from `project-root.cjs` before writing
2. Sanitize date components: `dateStr.replace(/[^0-9-]/g, '')`
3. Validate the final path starts with the expected archive directory

### RF-002: File Locking for Concurrent Access (T-MEM-005)

**Severity:** MEDIUM
**Component:** All three components

**Problem:** The memory scheduler can run daily and weekly maintenance concurrently. Multiple operations (rotation, pruning, cold archival) read the same files, and without file locking, a TOCTOU (time-of-check-time-of-use) race exists:
1. Rotator reads decisions.md (1500 lines)
2. Agent appends a new decision (1501 lines)
3. Rotator writes truncated decisions.md (1000 lines)
4. New decision is lost

**Mitigation:**
1. Use `atomicWriteAsync()` from `atomic-write.cjs` which already implements `proper-lockfile` locking
2. For synchronous operations, add a simple `.lock` file check with stale detection (the async version already has this)
3. Consider making the scheduler single-threaded with a process-level lock file at `.claude/context/memory/.maintenance.lock`

### RF-003: Pruning Audit Trail (R-MEM-001)

**Severity:** MEDIUM
**Component:** Smart Pruner, Memory Rotator

**Problem:** When entries are pruned or rotated, there is no record of what was removed and why. If pruning removes an important entry by mistake, there is no way to know what was lost without git history.

**Mitigation:**
1. Before pruning, write a manifest to `.claude/context/memory/archive/prune-manifest-YYYY-MM-DD.json`
2. Manifest should include: timestamp, entries removed (id, text preview, utility score), reason (below threshold, duplicate, age)
3. Keep manifests for 90 days (same TTL as codebase map)

### RF-004: Archive Size Bounds (D-MEM-001)

**Severity:** MEDIUM
**Component:** Memory Rotator, Cold Storage

**Problem:** Archive files grow without limit. Over months of operation, the archive directory could consume significant disk space.

**Mitigation:**
1. Enforce maximum archive directory size (configurable, default 50MB)
2. When limit is reached, delete oldest archives (FIFO)
3. Log warnings when archive directory exceeds 80% of limit
4. For cold storage: limit number of `.jsonl.gz` files to a configurable maximum (default 100)

---

## 7. Security Test Cases

### Test Category: Path Traversal (T-MEM-001, E-MEM-001)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ST-001 | Rotator: Inject `../../../etc/` as date component in archive path | Path validation rejects; no file written outside memory/ |
| ST-002 | Cold Storage: Session ID containing `../../` in archive path construction | `validatePathWithinProject()` returns `{ safe: false }` |
| ST-003 | Rotator: Archive path with Windows reserved names (`nul`, `con`, `aux`) | Path rejected or sanitized |
| ST-004 | Cold Storage: Construct path with null bytes in filename | Path validation rejects null byte pattern |

### Test Category: Prototype Pollution (T-MEM-002)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ST-005 | Parse gotchas.json containing `{ "__proto__": { "polluted": true } }` | `safeJSONParse` strips `__proto__` key; `{}.polluted` is `undefined` |
| ST-006 | Parse patterns.json with `{ "constructor": { "prototype": { "evil": true } } }` | Dangerous keys stripped; Object.prototype unmodified |
| ST-007 | Parse deeply nested object with `__proto__` at multiple levels | All instances stripped recursively |

### Test Category: Data Integrity (T-MEM-003, T-MEM-005)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ST-008 | Simulate crash during rotation (mock `atomicWriteSync` to throw after archive write) | Original file intact; backup available for recovery |
| ST-009 | Simulate concurrent rotation and agent append | File locking prevents data loss; appended entry preserved |
| ST-010 | Corrupt gotchas.json with invalid JSON | Pruner gracefully returns empty array; does not crash scheduler |
| ST-011 | Corrupt decisions.md with no heading boundaries | Rotator returns without modifying file; logs warning |
| ST-012 | Zero-byte memory file passed to rotator | Graceful no-op; no error thrown |

### Test Category: Sensitive Data (I-MEM-001)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ST-013 | Memory entry containing `API_KEY=sk-abc123456789` archived to cold storage | Key value redacted to `[REDACTED]` before compression |
| ST-014 | Entry with JWT token `eyJhbGciOiJIUzI1NiJ9.xxx.yyy` | Token redacted to `[JWT-REDACTED]` |
| ST-015 | Entry with email `user@example.com` | Email redacted to `[EMAIL-REDACTED]` |
| ST-016 | Entry with legitimate code containing "password" variable name | Variable name preserved; only actual credential values redacted |

### Test Category: Resource Exhaustion (D-MEM-001, D-MEM-004)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ST-017 | Archive directory at 50MB limit; rotation triggered | Oldest archives deleted to make room; rotation succeeds |
| ST-018 | Cold storage compression of 100MB LTM file | Streaming compression or chunked processing; no OOM |
| ST-019 | 10,000 entries in gotchas.json passed to pruner | Completes within 5 seconds; memory usage below 100MB |

### Test Category: Error Recovery (D-MEM-002)

| ID | Test Case | Expected Result |
|----|-----------|-----------------|
| ST-020 | Malformed maintenance-status.json | Scheduler resets to default status; does not crash |
| ST-021 | Missing `archive/` directory during rotation | Directory created automatically via `ensureDir()` |
| ST-022 | Read-only file system (permission denied on write) | Graceful failure with clear error message; no data loss |

---

## 8. Existing Vulnerability Cross-References

The following existing security findings are relevant to this rebuild and must be addressed together:

| Existing Finding | Relevance to Memory Rebuild | Status |
|------------------|---------------------------|--------|
| **SEC-CTX-001 (HIGH)**: Inconsistent `safeJSONParse()` | All three components use JSON.parse on memory files | OPEN -- MF-001 addresses this |
| **SEC-LIB-005 (HIGH)**: safe-json.cjs fallback to plain JSON.parse | Pruner should use safe-json if available | OPEN |
| **SEC-CTX-003 (HIGH)**: Memory file integrity not verified | constitution.md/behaviour.md unprotected; extends to all memory files | OPEN |
| **SEC-CTX-008 (MEDIUM)**: gotchas.json/patterns.json lack provenance | Pruner should add provenance when creating entries | OPEN |
| **SEC-LIB-002 (CRITICAL)**: scheduler-tick.cjs shell:true | memory-scheduler.cjs `runArchiveOldLTM()` uses spawnSync with `-e` flag | Partially addressed (uses JSON.stringify for paths) |
| **D-WF-001 (MEDIUM)**: State file locking gap | Memory files have same concurrent access problem as workflow state | OPEN -- RF-002 addresses this |

### Systemic Pattern: Plain JSON.parse

Across the memory subsystem, there are **38 instances** of raw `JSON.parse()` without prototype pollution protection. The Smart Pruner rebuild should pioneer the `safeJSONParse()` pattern that can then be rolled out to all other memory modules.

---

## 9. IEEE 1028 Security Checklist

### Base Security Items (IEEE 1028)

- [ ] Input validation on all user/agent inputs (file content, JSON data, date strings)
- [ ] No SQL injection vulnerabilities (N/A -- no SQL in memory subsystem)
- [ ] No XSS vulnerabilities (N/A -- no web rendering)
- [ ] Sensitive data encrypted at rest and in transit (PARTIAL -- cold storage compressed but not encrypted)
- [ ] Authentication and authorization checks present (N/A -- single-user system, all agents same trust level)
- [ ] No hardcoded secrets or credentials (VERIFIED -- no secrets in memory modules)
- [ ] OWASP Top 10 considered (YES -- A03 Injection via JSON parse, A05 Misconfiguration via env vars)
- [ ] Error handling covers all failure modes (NEEDS WORK -- several unhandled edge cases identified)
- [ ] No race conditions in concurrent operations (NEEDS WORK -- T-MEM-005)
- [ ] File operations use atomic write patterns (PARTIALLY -- existing code mixes atomic and non-atomic)

### Context-Specific Items (AI-Generated)

- [ ] [AI-GENERATED] All `JSON.parse()` calls use prototype pollution protection
- [ ] [AI-GENERATED] Archive path construction validated with `validatePathWithinProject()`
- [ ] [AI-GENERATED] File writes use `atomicWriteSync()` from `atomic-write.cjs`
- [ ] [AI-GENERATED] Backup created before destructive file operations (truncation, deletion)
- [ ] [AI-GENERATED] Sensitive data scrubbed before cold storage compression
- [ ] [AI-GENERATED] Archive size bounded with configurable limits
- [ ] [AI-GENERATED] Pruning operations produce audit manifest
- [ ] [AI-GENERATED] Concurrent access protected by file locking
- [ ] [AI-GENERATED] Windows reserved filename patterns rejected in archive path construction
- [ ] [AI-GENERATED] Markdown parsing handles malformed input without infinite loops

---

## Appendix A: Archived Module Security Assessment

### memory-rotator.cjs (Archived)

**Positive findings:**
- Already uses `validateProjectRoot()` for path traversal prevention
- Test environment bypass (`NODE_ENV === 'test'`) is acceptable
- Configuration is from environment variables with safe defaults

**Negative findings (to fix in rebuild):**
- Uses `fs.writeFileSync()` instead of `atomicWriteSync()` (lines 441, 455, 540, 554)
- No backup before truncation
- No audit trail for rotated entries
- Date parsing from markdown headings is fragile (regex-based)

### smart-pruner.cjs (Archived)

**Positive findings:**
- Utility scoring algorithm is mathematically sound
- Jaccard similarity for deduplication is a well-established pattern
- Importance markers with weights provide reasonable prioritization

**Negative findings (to fix in rebuild):**
- Uses plain `JSON.parse()` without prototype pollution protection (lines 555, 596, 638)
- Uses `fs.writeFileSync()` instead of `atomicWriteSync()` (line 618)
- No audit trail for pruned entries
- CLI interface accepts stdin JSON without validation

### cold-storage.cjs (Archived)

**Positive findings:**
- Uses `validateProjectRoot()` for path safety
- Uses `atomicWriteSync()` for index file writes
- `zlib.gzipSync()` is a safe compression method

**Negative findings (to fix in rebuild):**
- No sensitive data scrubbing before compression
- No integrity verification (HMAC/checksum) on compressed archives
- No maximum archive count or size limits
- `JSON.parse()` without prototype pollution protection (line 270)

---

## Appendix B: Security Controls Mapping

| Control | SEC ID | Implementation |
|---------|--------|----------------|
| Path traversal prevention | SEC-002 | `validatePathWithinProject()` from `project-root.cjs` |
| Input sanitization | SEC-003 | `safeJSONParse()` (to be created) |
| Atomic file operations | N/A | `atomicWriteSync()` from `atomic-write.cjs` |
| Backup/recovery | N/A | `createBackup()`/`restoreFromBackup()` from `atomic-write.cjs` |
| Sensitive data scrubbing | N/A | `scrubSensitiveContent()` (to be created) |
| File locking | N/A | `atomicWriteAsync()` with `proper-lockfile` (existing) |

---

## Appendix C: Implementation Checklist for Developer

The developer implementing the rebuild MUST verify each of these before marking the task complete:

1. **All JSON.parse calls use safeJSONParse** -- verify with: `grep -n "JSON.parse" <new-files>` returns 0 results
2. **All file writes use atomicWriteSync** -- verify with: `grep -n "writeFileSync\|appendFileSync" <new-files>` returns 0 results
3. **All archive paths validated** -- verify: every `path.join()` constructing an archive path is followed by `validatePathWithinProject()`
4. **Backup before truncation** -- verify: `createBackup()` called before any file that reduces content
5. **Sensitive data scrubbing** -- verify: `scrubSensitiveContent()` called in cold storage before `zlib.gzipSync()`
6. **Error handling** -- verify: all public functions have try/catch with graceful degradation
7. **Test coverage** -- verify: security test cases ST-001 through ST-022 have corresponding test implementations

---

*End of security review. Questions or clarifications: spawn security-architect agent with reference to this report.*
