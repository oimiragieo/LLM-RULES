<!-- Agent: architect | Task: #3 | Session: 2026-02-20 -->

# Supply Chain Security Session Review

**Date**: 2026-02-20
**Task**: #3 (Architect Investigation)
**Scope**: EXTERNAL_CONTENT_GUARD env var audit, debug log analysis, session process improvement

---

## Part 1: EXTERNAL_CONTENT_GUARD Environment Variable Documentation Audit

### 1.1 Environment Variables Found in external-content-guard.cjs

| Variable | Line | Documented in .env.example | Default Value | Suggested Description |
|---|---|---|---|---|
| `DEBUG_HOOKS` | 478 | Yes (line 384, global) | `false` | Global hook debug logging; when `true`, logs unexpected errors to stderr |

**Total env vars read by hook**: 1 (`process.env.DEBUG_HOOKS` at line 478)

### 1.2 Missing Environment Variables (Gap Analysis)

The following env vars are **referenced in documentation or issues.md but do NOT exist in the hook code**:

| Expected Variable | Referenced In | Status | Impact |
|---|---|---|---|
| `EXTERNAL_CONTENT_GUARD_MODE` | issues.md line 298 | **MISSING FROM CODE** | Cannot switch between warn/block/quarantine at runtime |
| `EXTERNAL_CONTENT_GUARD` | Convention (`{HOOK_NAME}=block\|warn\|off`) | **MISSING FROM CODE** | No standard enforcement toggle exists |

**Verdict**: The hook has **zero configurable enforcement-mode env vars**. The behavior (block for WebFetch/curl/wget, warn for gh api) is **hardcoded** with no runtime override. This contradicts the issues.md entry at line 298 which references setting `EXTERNAL_CONTENT_GUARD_MODE=block` as a remediation action.

### 1.3 Fetch Policy vs Actual Behavior (Critical Mismatch)

The `trusted-sources.json` declares:

```json
"fetch_policy": {
  "trusted": "scan_and_incorporate",
  "untrusted": "scan_and_quarantine",    // <-- DECLARED
  "unknown": "block_and_escalate"
}
```

**Actual behavior in the hook**:

| Tool | Untrusted Domain | Declared Policy | Actual Behavior | Gap |
|---|---|---|---|---|
| WebFetch | Untrusted domain | `scan_and_quarantine` | **BLOCK** (exit 2) | No quarantine file written |
| Bash (curl/wget) | Untrusted domain | `scan_and_quarantine` | **BLOCK** (exit 2) | No quarantine file written |
| Bash (gh api) | Untrusted org | `scan_and_quarantine` | **WARN only** (exit 0) | Neither quarantine nor block |

**Key Finding**: The `ensureQuarantineDir()` function (line 112-120) creates the directory at `.claude/context/runtime/quarantine/` but **no code ever writes a quarantine file**. The "quarantine" in "scan_and_quarantine" is aspirational, not implemented.

### 1.4 Recommendations (Part 1)

1. **P1**: Add `EXTERNAL_CONTENT_GUARD_MODE=block|warn|off` env var to the hook (with default `block`)
2. **P1**: Document this variable in `.env.example` with clear description
3. **P2**: Implement actual quarantine file writing (content + metadata) when untrusted content is detected, or rename fetch_policy to `scan_and_block` to match reality
4. **P2**: Upgrade `gh api` handling from warn-only to block-by-default for untrusted orgs (currently the weakest enforcement path)

---

## Part 2: Debug Log Analysis

**Log file**: `C:\dev\projects\agent-studio\.tmp\00bdd628-ae23-4386-8de2-c164cc8fe820.txt`
**Session start**: 2026-02-20T08:37:19.756Z
**Lines analyzed**: 1-800

### 2.1 Critical Events

| Time | Severity | Event | Details |
|---|---|---|---|
| 08:37:22.245 | ERROR | MCP Stripe auth failure | `authentication_error`: No OAuth token configured. MCP server `claude.ai Stripe` failed to connect (req_011CYK1xDktMvMyDTT3SeWw7) |
| 08:37:24.804 | ERROR | ripgrep AbortError | `AbortError: The operation was aborted` during first-use test. 940 results still returned; cosmetic only |
| 08:38:19.634 | WARN | force-step0-execution | 3 pending reflections detected; `bypassPermissions` active, advisory only. spawnRequestCount=3 |
| 08:38:19.634 | WARN | drift-detector | 0% overlap between original intent ("skill-updater pipeline") and current prompt. Session intent drift |

### 2.2 Hook Enforcement Events

| Time | Hook | Action | Count | Details |
|---|---|---|---|---|
| 08:39:26.319 | routing-guard (Task) | **BLOCK** | 1st | TASKLIST-FIRST VIOLATION: Router called Task before TaskList() |
| 08:39:28.102 | routing-guard (Task) | **BLOCK** | 2nd | Same violation, second Task spawn attempt |
| 08:39:29.862 | routing-guard (Task) | **BLOCK** | 3rd | Same violation, third Task spawn attempt |
| 08:39:34.009 | reflection-step0-guard (TaskList) | **BLOCK** | 1st | 3 pending reflection requests; Step 0 not completed |

**Analysis**: The TASKLIST-FIRST enforcement worked correctly, blocking 3 consecutive Task spawns before the router called TaskList(). The reflection-step0-guard then correctly blocked TaskList itself because 3 stale reflection requests existed. This demonstrates proper layered enforcement but reveals the router struggled with the Step 0 / TaskList-first ordering for 3 iterations before adapting.

### 2.3 Hook Performance

| Hook | Typical Latency | Status |
|---|---|---|
| Pre-Read hooks (2 matched) | ~120-320ms | Within budget (<500ms) |
| Pre-Task hooks (2 matched) | ~230-370ms | Within budget |
| Pre-Skill hooks (1 matched) | ~260ms | Within budget |
| Pre-TaskList hooks (2 matched) | ~310ms | Within budget |
| Post-Tool hooks (2-4 matched) | ~160-200ms | Within budget |

**No hooks exceeded the 500ms warning threshold.** All within performance budget.

### 2.4 Non-JSON Hook Output Pattern

"Hook output does not start with {, treating as plain text" appears approximately 40+ times in the log section analyzed. These are hooks returning stderr text instead of structured JSON. This is expected behavior for informational hooks but could be improved for consistency.

### 2.5 Startup Metrics

| Phase | Duration | Notes |
|---|---|---|
| Setup | 44ms | Fast |
| MCP configs | 644ms | 6 MCP servers (Exa 825ms, Ref 1518ms, Hugging Face 1449ms, Stripe FAILED 809ms) |
| Commands/agents | 264ms | Acceptable |
| Setup screens | 319ms | Acceptable |
| File index | 3862ms | 7978 tracked files (git ls-files 3788ms) |
| Skills | - | 288 unique skills loaded (177 project, 111 legacy commands) |

### 2.6 Findings Not Present

- No JSON parse errors detected
- No sanitize/security events from user-prompt-submit (beyond standard debug path mapping)
- No schema validation failures
- No hook timeouts or crashes

---

## Part 3: Session Process Improvement Deep-Dive

### 3.1 What Worked Well

1. **Hook enforcement layering**: TASKLIST-FIRST + reflection-step0-guard correctly enforced ordering constraints. The system self-corrected after 3 blocked attempts.
2. **Audit logging**: external-fetch-audit.jsonl captured all external fetch decisions with timestamps, trust levels, and actions.
3. **Trusted-sources.json structure**: Clean separation of domains, orgs, repos with fetch_policy declarations.
4. **Skill preloading**: reflection-agent got 21 skills preloaded efficiently (each preload took <2ms).
5. **MCP server resilience**: Stripe auth failure was isolated; other 5 MCP servers connected successfully.

### 3.2 Session Improvement Matrix

| # | Gap | Severity | Fix Type | Files to Change |
|---|---|---|---|---|
| G1 | No enforcement-mode env var for external-content-guard | **P1** | Code change | `.claude/hooks/safety/external-content-guard.cjs`, `.env.example` |
| G2 | fetch_policy "scan_and_quarantine" is misleading (no quarantine files written) | **P1** | Code change OR config rename | `.claude/config/trusted-sources.json` or `external-content-guard.cjs` |
| G3 | `gh api` to untrusted orgs only warns, never blocks | **P1** | Code change | `.claude/hooks/safety/external-content-guard.cjs` (handleBash, line 342) |
| G4 | 3 stale reflection requests persisted from prior session | **P1** | Process fix | `.claude/hooks/reflection/reflection-cleanup.cjs` (needs cross-session cleanup) |
| G5 | Router attempted Task 3x before adapting to TaskList-first | **P2** | Prompt improvement | Router agent template or routing-guard messaging |
| G6 | drift-detector reported 0% overlap (false positive for session continuation) | **P2** | Algorithm fix | drift-detector hook (needs session-continuation awareness) |
| G7 | MCP Stripe auth unconfigured | **P2** | Config fix | MCP server configuration (OAuth token) |
| G8 | 40+ non-JSON hook outputs | **P3** | Hook output normalization | Multiple hooks (return JSON instead of plain text) |

### 3.3 Root Cause: Stale Reflection Requests

**Evidence chain**:
1. `reflection-cleanup.cjs` (line 50-53) requires `processedReflectionIds` in TaskUpdate metadata to trigger cleanup
2. If reflection agents complete without this metadata, `removeRequests()` is never called
3. `issues.md` documents 18+ TaskUpdate metadata failures (P0 escalation)
4. The 3 stale reflections from the prior session triggered the step0-guard block at 08:39:34, adding ~70 seconds of delay while the router adapted

**Fix path**: Two complementary approaches:
- **Short-term**: Add a session-startup cleanup pass that removes reflection requests older than the current session start time
- **Long-term**: Activate `COMPLETION_METADATA_ENFORCEMENT=block` to prevent the root cause (agents completing without metadata)

### 3.4 Root Cause: Missing Enforcement Mode

**Evidence chain**:
1. `external-content-guard.cjs` reads only `process.env.DEBUG_HOOKS` (confirmed via grep)
2. `issues.md` line 298 references `EXTERNAL_CONTENT_GUARD_MODE` but this variable does not exist in the code
3. The hook behavior is hardcoded: block for WebFetch/curl, warn for gh api
4. Other hooks follow the convention `{HOOK_NAME}_MODE=block|warn|off` or `{FEATURE}_ENFORCEMENT=block|warn|off`

**Fix path**: Add `EXTERNAL_CONTENT_GUARD_MODE` env var reading at hook start, with three modes:
- `block` (default): Current WebFetch/curl behavior + upgrade gh api from warn to block
- `warn`: All untrusted actions log warnings but allow (current gh api behavior applied to all)
- `off`: Hook exits immediately with code 0

---

## Summary

### P0 Findings

None identified in this session (all existing P0s are tracked in issues.md).

### P1 Findings

1. **G1**: Missing `EXTERNAL_CONTENT_GUARD_MODE` env var (hardcoded behavior, no runtime control)
2. **G2**: fetch_policy "scan_and_quarantine" label is misleading (hook blocks or warns, never quarantines)
3. **G3**: `gh api` to untrusted orgs only warns (weakest enforcement path in supply chain)
4. **G4**: Stale reflection requests persisted cross-session (root cause: metadata enforcement gap)

### Enterprise Pipeline Assessment

**Enterprise pipeline needed**: No. The findings are targeted code changes (3 files) and a config correction (1 file). A developer + security-architect pair can address G1-G3 in one sprint. G4 requires activating an existing env var (`COMPLETION_METADATA_ENFORCEMENT=block`), which is a human authorization decision, not a code change.

---

*End of report.*
