# Validation Contract: Phase 9 Codebase Cleanup

**Mission**: Phase 9 — Codebase Cleanup & Hygiene
**Date**: 2026-03-29
**Scope**: 9 confirmed issues from external audit (low-medium severity cleanup)

---

## Area: Runtime File Cleanup

### VAL-CL-001: Stale PID delegation files removed

All 54 stale `delegations.pid-*.json` files in `.claude/context/memory/` must be deleted. These are orphaned session artifacts that accumulate over time and serve no runtime purpose.

**Pass condition**: Zero `delegations.pid-*.json` files exist in `.claude/context/memory/`.

**Fail condition**: Any `delegations.pid-*.json` file remains.

**Evidence**: `Get-ChildItem .claude/context/memory/delegations.pid-*.json | Measure-Object` returns Count = 0.

---

### VAL-CL-002: Redundant compression-reminder.txt removed

Both `compression-reminder.txt` and `compression-reminder.json` exist in `.claude/context/runtime/`. Only the `.json` variant should remain (structured data is canonical).

**Pass condition**: `.claude/context/runtime/compression-reminder.json` exists AND `.claude/context/runtime/compression-reminder.txt` does not exist.

**Fail condition**: Both files still exist, or the `.json` file was removed instead.

**Evidence**: `Test-Path .claude/context/runtime/compression-reminder.json` returns True AND `Test-Path .claude/context/runtime/compression-reminder.txt` returns False.

---

### VAL-CL-003: Stale heartbeat-reminder.txt evaluated and cleaned

`heartbeat-reminder.txt` in `.claude/context/runtime/` is potentially stale (last modified 2026-03-28). If no active hook or process references it, the file must be removed. If it is actively consumed, its staleness concern must be documented as resolved.

**Pass condition**: Either (a) `.claude/context/runtime/heartbeat-reminder.txt` is removed, OR (b) a code reference to `heartbeat-reminder.txt` is confirmed in an active hook (not in `_archive`) and the file's last-modified timestamp is within the current session window.

**Fail condition**: File remains with no active consumer, or is stale beyond 24 hours with no documented justification.

**Evidence**: `rg "heartbeat-reminder" .claude/hooks/ .claude/lib/ --glob "!**/_archive/**"` shows active references, OR `Test-Path .claude/context/runtime/heartbeat-reminder.txt` returns False.

---

### VAL-CL-004: No new stale runtime artifacts introduced

The cleanup must not introduce new orphaned or zero-byte files in `.claude/context/runtime/`.

**Pass condition**: Every file in `.claude/context/runtime/` either has non-zero size or is an intentional lock file (`.lock` extension).

**Fail condition**: Any new zero-byte non-lock file appears in `runtime/` after cleanup.

**Evidence**: `Get-ChildItem .claude/context/runtime/ -File | Where-Object { $_.Length -eq 0 -and $_.Extension -ne '.lock' } | Measure-Object` returns Count = 0.

---

### VAL-CL-005: delegations.json canonical file preserved

The canonical `delegations.json` file (non-PID variant) in `.claude/context/memory/` must NOT be removed during PID file cleanup.

**Pass condition**: `.claude/context/memory/delegations.json` exists and is valid JSON.

**Fail condition**: `delegations.json` is missing or corrupted.

**Evidence**: `node -e "JSON.parse(require('fs').readFileSync('.claude/context/memory/delegations.json','utf8')); console.log('PASS')"` prints PASS.

---

## Area: Dead Code Removal

### VAL-CL-006: Orphaned trust-scorer.cjs removed

`.claude/lib/routing/trust-scorer.cjs` is confirmed orphaned — no active code imports it.

**Pass condition**: `.claude/lib/routing/trust-scorer.cjs` does not exist.

**Fail condition**: File still exists.

**Evidence**: `Test-Path .claude/lib/routing/trust-scorer.cjs` returns False.

---

### VAL-CL-007: Orphaned rollback-manager.cjs removed

`.claude/lib/self-healing/rollback-manager.cjs` is confirmed orphaned — no active code imports it.

**Pass condition**: `.claude/lib/self-healing/rollback-manager.cjs` does not exist.

**Fail condition**: File still exists.

**Evidence**: `Test-Path .claude/lib/self-healing/rollback-manager.cjs` returns False.

---

### VAL-CL-008: Superseded user-prompt-orchestrator.cjs removed

`.claude/hooks/session/user-prompt-orchestrator.cjs` is confirmed dead code (superseded by current routing).

**Pass condition**: `.claude/hooks/session/user-prompt-orchestrator.cjs` does not exist AND no hook registration references `user-prompt-orchestrator` in active config.

**Fail condition**: File still exists, or a dangling reference to it remains in hook registration.

**Evidence**: `Test-Path .claude/hooks/session/user-prompt-orchestrator.cjs` returns False AND `rg "user-prompt-orchestrator" .claude/config.yaml .claude/hooks/hooks.json 2>$null` returns no matches.

---

### VAL-CL-009: Vestigial run-hook.cmd removed

`.claude/hooks/run-hook.cmd` is vestigial — nothing invokes it.

**Pass condition**: `.claude/hooks/run-hook.cmd` does not exist.

**Fail condition**: File still exists.

**Evidence**: `Test-Path .claude/hooks/run-hook.cmd` returns False.

---

### VAL-CL-010: Orphaned config.staging.yaml removed or activated

`.claude/config.staging.yaml` exists with no switching mechanism. It must be either removed (if unused) or wired into an environment-switching mechanism.

**Pass condition**: Either (a) `.claude/config.staging.yaml` does not exist, OR (b) a documented `AGENT_STUDIO_ENV=staging` loading path references it in code.

**Fail condition**: File exists but has no code path that loads it.

**Evidence**: `Test-Path .claude/config.staging.yaml` returns False, OR `rg "config.staging" .claude/lib/ .claude/hooks/ --glob "!**/_archive/**"` returns active references.

---

## Area: Version & Config Consistency

### VAL-CL-011: Version strings unified across config files

Currently drifted: `config.yaml` v2.2.2, `CLAUDE.md` v3.1.0, `@ENFORCEMENT_HOOKS.md` v2.2.1. All three files must declare the same version after cleanup.

**Pass condition**: A single version string appears in all three files: `.claude/config.yaml` (field `version:`), `.claude/CLAUDE.md` (header version), and `.claude/docs/@ENFORCEMENT_HOOKS.md` (version field). All three match exactly.

**Fail condition**: Any two of the three files have different version strings.

**Evidence**:

```powershell
$v1 = (rg "^\s+version:" .claude/config.yaml | Select-String -Pattern "'([\d.]+)'" | ForEach-Object { $_.Matches.Groups[1].Value })
$v2 = (rg "Version.*v[\d.]+" .claude/CLAUDE.md | Select-String -Pattern "v([\d.]+)" | ForEach-Object { $_.Matches.Groups[1].Value })
$v3 = (rg "Version.*v[\d.]+" .claude/docs/@ENFORCEMENT_HOOKS.md | Select-String -Pattern "v([\d.]+)" | ForEach-Object { $_.Matches.Groups[1].Value })
if ($v1 -eq $v2 -and $v2 -eq $v3) { "PASS: all $v1" } else { "FAIL: $v1 / $v2 / $v3" }
```

---

### VAL-CL-012: No other version drift exists in ancillary files

After unification, no other `.claude/` files reference the old drifted versions (v2.2.1, v2.2.2 as separate values) unless they are changelogs or historical records.

**Pass condition**: `rg "v2\.2\.1|v2\.2\.2" .claude/ --glob "!**/_archive/**" --glob "!**/CHANGELOG*" --glob "!**/designs/**"` returns zero matches outside of historical context.

**Fail condition**: Active configuration or documentation still references old version strings.

**Evidence**: The rg command above returns no results, or only results in explicitly historical files.

---

## Area: Archive Cleanup

### VAL-CL-013: All \_archive directories removed from .claude/

25 `_archive` directories exist throughout `.claude/` containing dead code. All must be removed.

**Pass condition**: Zero directories matching `*_archive*` exist under `.claude/`.

**Fail condition**: Any `_archive` directory remains.

**Evidence**: `Get-ChildItem .claude/ -Recurse -Directory -Filter "*_archive*" | Measure-Object` returns Count = 0.

---

### VAL-CL-014: No dangling imports reference archived modules

After removing `_archive` directories, no active `.cjs`, `.mjs`, or `.md` file under `.claude/` contains a `require()` or `import` path that references a `_archive` directory.

**Pass condition**: `rg "_archive" .claude/ --glob "*.cjs" --glob "*.mjs" --glob "*.md" --glob "!**/_archive/**"` returns zero matches that are `require`/`import` statements.

**Fail condition**: Any active file has an import/require path containing `_archive`.

**Evidence**: `rg "require\(.*_archive|from.*_archive" .claude/ --glob "*.cjs" --glob "*.mjs" --glob "!**/_archive/**"` returns no matches.

---

## Area: Regression Safety

### VAL-CL-015: Framework tests pass after cleanup

The full framework test suite must pass with zero failures after all cleanup changes.

**Pass condition**: `pnpm test:framework` exits with code 0 and reports no failing tests.

**Fail condition**: Any test fails or the command exits non-zero.

**Evidence**: `pnpm test:framework` output shows all tests passing.

---

### VAL-CL-016: Validation suite passes after cleanup

The full validation pipeline must pass to confirm no structural regressions.

**Pass condition**: `pnpm validate` exits with code 0.

**Fail condition**: Any validation check fails.

**Evidence**: `pnpm validate` output shows all checks passing.

---

### VAL-CL-017: Lint passes after cleanup

ESLint and Markdown lint must pass to confirm no formatting or code quality regressions.

**Pass condition**: `pnpm lint` exits with code 0.

**Fail condition**: Any lint rule violation is reported.

**Evidence**: `pnpm lint` output shows "All linting passed."

---

## Summary

| Area                         | Assertions | IDs                           |
| ---------------------------- | ---------- | ----------------------------- |
| Runtime File Cleanup         | 5          | VAL-CL-001 through VAL-CL-005 |
| Dead Code Removal            | 5          | VAL-CL-006 through VAL-CL-010 |
| Version & Config Consistency | 2          | VAL-CL-011 through VAL-CL-012 |
| Archive Cleanup              | 2          | VAL-CL-013 through VAL-CL-014 |
| Regression Safety            | 3          | VAL-CL-015 through VAL-CL-017 |
| **Total**                    | **17**     |                               |
