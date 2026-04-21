<!-- Agent: code-reviewer | Task: #8 | Session: 2026-02-20 -->

# Code Review: P1 Supply Chain Security Gap Fixes

**Date**: 2026-02-20
**Reviewer**: code-reviewer
**Scope**: 5 files (4 changed, 1 confirmed missing)
**Pipeline**: Enterprise Security Pipeline — GAP-A/B/C/D Fixes

---

## Stage 1: Spec Compliance

**Requirements Met**: Partial

**GAP-A (enforcement mode via env var)**: IMPLEMENTED. `EXTERNAL_CONTENT_GUARD_MODE` env var correctly controls block/warn/off behavior. Default is `warn` (backward-compatible). Exit 2 on block is confirmed (line 624 of external-content-guard.cjs: `process.exit(2)` after `result.action === 'block'`).

**GAP-B (quarantine file writing)**: IMPLEMENTED. `writeQuarantineFile()` is called before the allow/warn decision for all untrusted paths. Path traversal validation is present. Best-effort (failure silently swallowed).

**GAP-C (gh api enforcement parity)**: IMPLEMENTED. The `handleBash` function applies `getEnforcementMode()` to gh api calls, consistent with WebFetch handling.

**GAP-D (reflection staleness)**: IMPLEMENTED. `removeStaleRequests()` exported from `spawn-request-contract.cjs` at line 180-200. `readSpawnRequestsFile` accepts `maxAge` option. Both are tested.

**KNOWN GAP (documented)**: `EXTERNAL_CONTENT_GUARD_MODE` is NOT in `.env.example`. This was pre-identified as a known missing item. It is a blocking documentation gap.

**Deviations from spec**: None beyond the known `.env.example` gap.

---

## Stage 2: Code Quality

### Strengths

**external-content-guard.cjs**:
- `safeParseJSON` used correctly (line 100) instead of raw `JSON.parse` for trusted-sources.json loading. The null-prototype safe object is handled correctly by the `typeof parsed !== 'object'` check.
- Path traversal protection in `writeQuarantineFile()` (lines 162-168) uses `path.resolve` comparison with `path.sep` suffix — robust against directory traversal.
- `shell: false` is not applicable here (no child_process.spawn usage).
- `getEnforcementMode()` reads from `process.env` each invocation — correct for test isolation.
- Error handling wraps all file I/O; hook never throws (all `catch` blocks call `process.exit(0)` or silently continue).
- Audit log + quarantine write are both best-effort with error absorption — correct for hooks that must not break pipelines.
- Cache reset exported as `_resetCache()` for test isolation — good design.

**reflection-cleanup.cjs**:
- No `child_process.spawn` usage — shell injection not applicable.
- No raw `JSON.parse` — all parsing delegated to `safeParseJSON` via `spawn-request-contract.cjs`.
- Error handling wraps the entire `main()` body (lines 87-88): `catch (_err) { process.exit(0); }` — correct fail-open for a PostToolUse hook.
- Staleness check uses `req?.source?.timestamp` field consistently with how `sanitizeSpawnRequest()` normalizes it.

**spawn-request-contract.cjs** (GAP-D backing library):
- `removeStaleRequests()` uses `atomicWriteJSONSync` for safe concurrent writes — correct.
- Cutoff comparison `ts >= cutoff` is correct direction (retain fresh, remove stale).
- Filter preserves entries with unparseable timestamps (`return true` on NaN) — conservative, avoids inadvertent data loss.
- Return value of `removedCount` is correct and tested.

**Tests (external-content-guard.test.cjs)**:
- 21 scenarios covering GAP-A, GAP-B, GAP-C, and regression cases.
- `beforeEach`/`afterEach` save and restore `process.env.EXTERNAL_CONTENT_GUARD_MODE` — deterministic.
- `cleanupQuarantineFiles()` called in `afterEach` — no leftover state.
- `guard._resetCache()` called in `beforeEach` and `afterEach` — cache isolation correct.
- No external network calls.

**Tests (reflection-cleanup.test.cjs)**:
- 15 scenarios across 4 suites covering `removeStaleRequests`, `readSpawnRequestsFile` with `maxAge`, `removeRequests`, and cross-session stale cleanup.
- Uses `tmpDir` with `fs.mkdtempSync` and `fs.rmSync` cleanup — no leftover files, fully isolated.
- `spawnSync` test (line 286) exercises the hook process boundary with no metadata — correct integration test approach.
- `delete require.cache[require.resolve(CONTRACT_PATH)]` in `loadContract()` — proper module cache isolation.

### Issues

#### Critical (Must Fix)

**[BLOCKING-1] `EXTERNAL_CONTENT_GUARD_MODE` missing from `.env.example`**

- File: `.env.example`
- Line: Missing — should be in Section 6a (Enforcement Modes)
- What's wrong: The new `EXTERNAL_CONTENT_GUARD_MODE` env var controls hook enforcement but has no entry in `.env.example`. Operators cannot discover the variable without reading source code. This breaks the documented convention that all hook enforcement vars appear in `.env.example` (see existing entries: `PLANNER_FIRST_ENFORCEMENT`, `CREATOR_GUARD`, etc.).
- Why it matters: Production deployments will default to `warn` mode silently. Teams wanting `block` mode for supply chain enforcement have no documented path to enable it.
- Exact text to add (in Section 6a, after `SECURITY_REVIEW_ENFORCEMENT=block`):

```
# External Content Guard enforcement mode (SEC-EXT-007)
# Values: block | warn | off
# Default: warn (backward-compatible; set to 'block' for strict supply chain enforcement)
# Controls WebFetch and Bash (curl/wget/gh api) enforcement against trusted-sources.json
#
# EXTERNAL_CONTENT_GUARD_MODE=warn
```

#### Important (Should Fix)

**[ISSUE-1] `writeQuarantineFile` uses `path.sep` comparison that may fail on Windows for path traversal check**

- File: `.claude/hooks/safety/external-content-guard.cjs`, line 164
- Code: `if (!resolvedFilepath.startsWith(resolvedDir + path.sep) && resolvedFilepath !== resolvedDir)`
- What's wrong: On Windows, `path.sep` is `\`. If `resolvedDir` ends in a separator (e.g., drive root `C:\`), the check `resolvedDir + path.sep` would produce `C:\\`. This is a rare edge case but the quarantine dir is deep inside the project, not a drive root, so the risk is low in practice. The check logic is sound for the actual use case.
- Why it matters: Low risk for this specific use case; flagged for awareness since this runs on Windows (per env info).
- Suggestion: Use `path.relative(resolvedDir, resolvedFilepath).startsWith('..')` as a more platform-neutral traversal check.

**[ISSUE-2] `safeParseJSON` call in `loadTrustedSources()` has no schema name**

- File: `.claude/hooks/safety/external-content-guard.cjs`, line 100
- Code: `const parsed = safeParseJSON(raw);`
- What's wrong: `safeParseJSON` without a schema name uses the fallback path (no prototype pollution protection via the schema-validated whitelist). It does sanitize `__proto__`, `constructor`, `prototype` at the top level via `stripDangerousKeys`, but nested objects in `trusted_domains` array elements are not deep-stripped.
- Why it matters: `trusted_domains` is an array of strings; `trusted_organizations` is an array of strings. Prototype pollution via these fields is theoretically possible if an attacker controls `trusted-sources.json` — but that file is in the repo and requires write access, making this a low-severity finding.
- Suggestion: Pass `'trusted-sources'` as the schema name or provide a minimal inline schema to get full protection. Alternatively document the conscious choice to use the fallback path here.

**[ISSUE-3] No integration test confirming `reflection-cleanup.cjs` triggers on a real TaskUpdate with processedReflectionIds**

- File: `tests/hooks/reflection-cleanup.test.cjs`
- What's wrong: The test at line 276 (`reflection-cleanup hook exits 0 for TaskUpdate completed without metadata`) exercises the no-metadata path via `spawnSync`. There is no equivalent `spawnSync` test for the happy path (with valid `processedReflectionIds` and a real spawn-request.json). The contract-layer tests (suites 1-4) test `removeRequests` directly but not through the hook process boundary.
- Why it matters: A regression in how the hook reads `toolInput.metadata?.processedReflectionIds` from the hook input JSON would not be caught by current tests.
- Suggestion: Add one `spawnSync` test with a populated `metadata.processedReflectionIds` and a temp spawn-request.json file, verifying the file is updated after hook execution.

#### Minor (Nice to Have)

**[MINOR-1] `extractGhApiOrg` regex does not handle query strings in the path**

- File: `.claude/hooks/safety/external-content-guard.cjs`, line 393
- Code: `const match = command.match(/gh\s+api\s+\/?(?:repos|orgs|users)\/([^/\s"']+)/i);`
- What's wrong: The character class `[^/\s"']+` will stop at `?` (query string start) or `#` (fragment), but if the path segment itself contains `?` before a `/`, the org name could include it. Example: `gh api repos/MyOrg?per_page=10` — the match group would capture `MyOrg?per_page=10`.
- Risk: Low. `gh api` path syntax rarely uses `?` in the org/repo segment. The match would produce a bogus org name that wouldn't match the trusted list, so the hook would warn/block — conservative behavior.
- Suggestion: Change character class to `[^/\s"'?#]+` for correctness.

**[MINOR-2] `extractCurlWgetUrls` URL regex does not handle URL-encoded spaces or multiline commands**

- File: `.claude/hooks/safety/external-content-guard.cjs`, line 407
- Code: `const urlPattern = /https?:\/\/[^\s"'`\\]+/gi;`
- Risk: Cosmetic. The regex is sufficient for real-world `curl` and `wget` patterns in hook contexts.

**[MINOR-3] Audit log directory creation in `appendAuditLog` performs `existsSync` + `mkdirSync` without locking**

- File: `.claude/hooks/safety/external-content-guard.cjs`, lines 199-202
- What's wrong: TOCTOU race between `existsSync` and `mkdirSync`. On concurrent hook executions, two processes could both see the dir as missing and both attempt to create it. The second `mkdirSync` would throw `EEXIST`, which is caught by the outer try/catch — so it fails silently.
- Risk: Very low in hook context (single-threaded per invocation). The `{ recursive: true }` option on `mkdirSync` would eliminate the race but it is not used here.
- Suggestion: Use `fs.mkdirSync(dir, { recursive: true })` to eliminate the race.

**[MINOR-4] `listQuarantineFiles` cleanup in tests removes ALL `.json` files from quarantine dir**

- File: `tests/hooks/external-content-guard.test.cjs`, line 57
- Code: `if (!prefix || f.startsWith(prefix) || f.endsWith('.json'))`
- What's wrong: When `cleanupQuarantineFiles()` is called without a `prefix` argument, `!prefix` is `true`, so the `f.endsWith('.json')` branch fires for every file. This would delete pre-existing quarantine files from the real quarantine dir if tests run against the live directory.
- Risk: Low — tests run infrequently and the quarantine dir is intended for transient files. But it is imprecise cleanup.
- Suggestion: Write tests to a temp dir (like the reflection-cleanup tests do) rather than the real quarantine dir.

---

## Stage 3: Integration Verification

**Hook registration** (`.claude/settings.json`):
- `external-content-guard.cjs` registered under `PreToolUse` — confirmed present.
- `reflection-cleanup.cjs` registered under `PostToolUse(TaskUpdate)` — confirmed present.
- Both registrations verified via grep.

**`.env.example`**: `EXTERNAL_CONTENT_GUARD_MODE` is NOT present — this is BLOCKING-1 above.

**`removeStaleRequests` export**: Confirmed present in `spawn-request-contract.cjs` line 207. Exported correctly.

**No orphaned artifacts detected** for these changes.

---

## Recommendations

1. Add `EXTERNAL_CONTENT_GUARD_MODE` to `.env.example` Section 6a (blocking before commit).
2. Add one integration-level `spawnSync` test for `reflection-cleanup.cjs` happy path with `processedReflectionIds`.
3. Use `path.relative()` for path traversal check in `writeQuarantineFile` for platform safety.
4. Use `fs.mkdirSync(dir, { recursive: true })` in `appendAuditLog` to eliminate TOCTOU.
5. Change quarantine test cleanup to use a temp dir to avoid side effects on the live quarantine dir.

---

## File Verdicts

| File | Verdict | Notes |
|------|---------|-------|
| `.claude/hooks/safety/external-content-guard.cjs` | PASS | Well-implemented. Minor path traversal and schema issues. |
| `tests/hooks/external-content-guard.test.cjs` | PASS | Good coverage. Minor cleanup isolation concern. |
| `.claude/hooks/reflection/reflection-cleanup.cjs` | PASS | Clean implementation, correct fail-open, proper delegation to contract. |
| `tests/hooks/reflection-cleanup.test.cjs` | PASS | Thorough. Missing one integration-level spawnSync happy-path test. |
| `.env.example` | FAIL | `EXTERNAL_CONTENT_GUARD_MODE` not documented. BLOCKING. |

---

## Assessment

**Ready to merge?** No — with one fix required.

**Reasoning**: The implementation is sound and the four GAP fixes are correctly implemented with good test coverage. The single blocking issue is the missing `EXTERNAL_CONTENT_GUARD_MODE` entry in `.env.example` — a 6-line documentation change that prevents operator discovery of the new enforcement variable. All other findings are non-blocking suggestions.
