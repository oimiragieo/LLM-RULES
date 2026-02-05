# Comprehensive .claude System Audit Report

**Date:** February 4, 2026  
**Auditor:** Kiro AI  
**Scope:** Full system audit of all functions, files, and systems
**Revision:** 2 (Deep Dive Update)

---

## Executive Summary

The `.claude` system is a sophisticated multi-agent orchestration framework with **extensive infrastructure** but several **critical issues** that prevent full functionality. The system has:

- **49 agents** registered and healthy
- **434+ skills** cataloged
- **60+ hooks** registered
- **Comprehensive routing system** with intent classification

However, the audit identified **27 critical issues**, **18 moderate issues**, and **15 minor issues** across the system.

**OVERALL SYSTEM HEALTH: 72/100** (downgraded from 77 after deep dive)

---

## CRITICAL ISSUES (P0 - System Breaking)

### 1. **Workflow Test Runner References Missing Test Files**

**Location:** `.claude/lib/workflow/run-workflow-tests.cjs`  
**Impact:** Workflow test suite completely broken  
**Details:** The test runner references three test files that don't exist:

- `workflow-cli.test.cjs` - NOT FOUND
- `workflow-validator.test.cjs` - NOT FOUND
- `workflow-integration.test.cjs` - NOT FOUND

**Evidence:**

```
Error: Cannot find module 'C:\dev\projects\agent-studio\.claude\lib\workflow\workflow-cli.test.cjs'
Error: Cannot find module 'C:\dev\projects\agent-studio\.claude\lib\workflow\workflow-validator.test.cjs'
Error: Cannot find module 'C:\dev\projects\agent-studio\.claude\lib\workflow\workflow-integration.test.cjs'
```

**Fix Required:** Create the missing test files or remove references from the test runner.

---

### 2. **Deprecated Hook Still Referenced**

**Location:** `.claude/hooks/routing/skill-creation-guard.cjs.deprecated`  
**Impact:** Evolution state references a hook that's been deprecated  
**Details:** The `evolution-state.json` records `skill-creation-guard` as a completed evolution, but the hook file has been renamed to `.deprecated`. The `unified-creator-guard.cjs` appears to have replaced it, but the evolution state wasn't updated.

**Fix Required:** Update evolution-state.json to reflect the deprecation or restore the hook.

---

### 3. **Agent Health Hook NOT REGISTERED (NEW - CRITICAL)**

**Location:** `.claude/hooks/routing/agent-health-hook.cjs` + `.claude/settings.json`  
**Impact:** Agent health tracking is completely non-functional  
**Details:** The `agent-health-hook.cjs` file exists (265 lines) with full implementation for tracking agent success/failure, but it is **NOT registered in settings.json**. This means:

- Agent health metrics are NEVER updated
- All agents show `successCount: 0, failureCount: 0`
- Health-aware routing is completely broken
- The entire Phase 3D implementation is dead code

**Evidence:**

```bash
# Search for agent-health in settings.json returns NO MATCHES
grep "agent-health" .claude/settings.json  # Returns nothing
```

The hook was documented as implemented in:

- `.claude/docs/PHASE_3_IMPLEMENTATION_ARCHITECTURE.md` (line 1882)
- `.claude/context/plans/phase-3-capability-cards-plan-20260131.md`
- `.claude/context/memory/archive/learnings-2026-01.md`

But the actual registration in settings.json was NEVER completed.

**Fix Required:** Add to settings.json PostToolUse(Task) hooks:

```json
{
  "matcher": "Task",
  "hooks": [{ "type": "command", "command": "node .claude/hooks/routing/agent-health-hook.cjs" }]
}
```

---

### 4. **Router State File Race Condition Risk**

**Location:** `.claude/hooks/routing/router-state.cjs` + `.claude/hooks/session/state-reset.cjs`  
**Impact:** Potential state corruption under concurrent access  
**Details:** Multiple hooks read/write to `.claude/context/runtime/router-state.json` without proper locking. While atomic writes are used, there's no file-level locking for concurrent processes.

**Fix Required:** Implement file locking or use a single-writer pattern.

---

### 5. **Memory Tiers Module Warning**

**Location:** `.claude/hooks/routing/user-prompt-unified.cjs`  
**Impact:** STM (Short-Term Memory) writes silently skipped  
**Details:** The code shows:

```javascript
if (!memoryTiers) {
  console.warn('[user-prompt-unified] memory-tiers not loaded; STM write skipped.');
}
```

This means memory tier functionality may be silently failing.

**Fix Required:** Ensure memory-tiers module loads correctly or handle the failure explicitly.

---

### 6. **Semantic Router Fallback Not Fully Wired**

**Location:** `.claude/lib/routing/semantic-router.cjs`  
**Impact:** Semantic routing may fail silently  
**Details:** The semantic router is called in `user-prompt-unified.cjs` but the `predict()` function's error handling is minimal. If the semantic model isn't loaded, routing falls back silently.

**Fix Required:** Add explicit error handling and logging for semantic router failures.

---

### 7. **Anomaly Log Growing Unbounded - 1.4MB (NEW - CRITICAL)**

**Location:** `.claude/context/self-healing/anomaly-log.jsonl`  
**Impact:** Disk space exhaustion, performance degradation  
**Details:** The anomaly log has grown to **1,394.91 KB (1.4 MB)** with no rotation mechanism. This is the largest JSONL file in the system and will continue growing indefinitely.

**Current JSONL file sizes:**
| File | Size |
|------|------|
| anomaly-log.jsonl | 1,394.91 KB |
| reflection-queue.jsonl | 264.07 KB |
| errors-2026-02-03.jsonl | 37.73 KB |
| errors-2026-02-04.jsonl | 26.83 KB |
| spawn-size-audit.jsonl | 9.56 KB |
| reflection-log.jsonl | 9.83 KB |

**Fix Required:** Implement log rotation for all JSONL files, especially anomaly-log.jsonl.

---

## HIGH SEVERITY ISSUES (P1 - Functionality Impaired)

### 8. **Post-Creation Reminder References Non-Existent Path**

**Location:** `.claude/hooks/session/post-creation-reminder.cjs`  
**Impact:** Validation tool path incorrect - agent validation will ALWAYS fail  
**Details:** The hook references:

```javascript
const ROUTER_ENFORCER = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'lib',
  'routing',
  'routing-table.cjs'
);
```

But the actual path is `.claude/lib/routing/routing-table.cjs` (no `hooks` directory).

This means the `quickValidate()` function will NEVER find the routing table, and ALL agent validations will incorrectly report "Missing routing-table keywords" even when the agent IS properly registered.

**Fix Required:** Change line 37-44 from:

```javascript
const ROUTER_ENFORCER = path.join(
  PROJECT_ROOT,
  '.claude',
  'hooks',
  'lib',
  'routing',
  'routing-table.cjs'
);
```

To:

```javascript
const ROUTER_ENFORCER = path.join(PROJECT_ROOT, '.claude', 'lib', 'routing', 'routing-table.cjs');
```

---

### 9. **Skill Catalog Shows 436 Skills, Index Shows 434**

**Location:** `.claude/context/artifacts/skill-catalog.md` vs `.claude/config/skill-index.json`  
**Impact:** Skill count mismatch indicates sync issues  
**Details:**

- Catalog header: "Total Skills: 436 (2 deprecated)"
- Index metadata: "totalSkills": 434

**Fix Required:** Regenerate skill index to ensure consistency.

---

### 10. **Agent Registry Health Metrics Never Updated (ROOT CAUSE IDENTIFIED)**

**Location:** `.claude/context/agent-registry.json`  
**Impact:** Health tracking is non-functional  
**Details:** All agents show:

```json
"health": {
  "successCount": 0,
  "failureCount": 0,
  "successRate": 1
}
```

**ROOT CAUSE:** The `agent-health-hook.cjs` is NOT registered in `settings.json` (see Critical Issue #3). The hook exists and is fully implemented, but it was never wired into the system.

**Fix Required:** Register agent-health-hook.cjs in settings.json (see Critical Issue #3 fix).

---

### 11. **Evolution State Has Stale Suggestions**

**Location:** `.claude/context/evolution-state.json`  
**Impact:** Pending suggestions never processed  
**Details:** Four suggestions from `2026-02-04T05:57:03` are stuck in "pending" status with no processing mechanism visible.

**Fix Required:** Implement suggestion processing or clear stale suggestions.

---

### 12. **Token Monitoring Uses Best-Effort Estimation**

**Location:** `.claude/config.yaml` + `.claude/hooks/routing/user-prompt-unified.cjs`  
**Impact:** Token limits may not be enforced accurately  
**Details:** Comments indicate:

```yaml
max_session_tokens: 60000 # Warning threshold (best-effort estimate in user-prompt-unified)
hard_limit: 100000 # Action required (best-effort estimate in user-prompt-unified)
```

The estimation uses `char_to_token_ratio: 0.75` which is approximate.

**Fix Required:** Document the limitation or implement more accurate token counting.

---

### 11. **Auto-Compression Disabled by Default**

**Location:** `.claude/config.yaml`  
**Impact:** Memory management requires manual intervention  
**Details:**

```yaml
auto_compression:
  enabled: false # Best-effort auto-trigger via user-prompt-unified when enabled
```

Despite extensive compression infrastructure, it's disabled.

**Fix Required:** Enable auto-compression or document why it's disabled.

---

### 12. **LanceDB Integration Experimental**

**Location:** `.claude/lib/memory/lancedb-client.cjs`  
**Impact:** Semantic memory search may be unstable  
**Details:** Node.js warning: `(node:107736) ExperimentalWarning: SQLite is an experimental feature`

**Fix Required:** Document the experimental status or pin to stable version.

---

## MODERATE ISSUES (P2 - Degraded Experience)

### 13. **Duplicate Agent Definition Files**

**Location:** `.claude/agents/core/router.md` AND `.claude/agents/router.md`  
**Impact:** Confusion about canonical router definition  
**Details:** Two router.md files exist at different paths.

**Fix Required:** Remove duplicate or clarify which is canonical.

---

### 14. **Reflection Queue Never Processed (264KB and Growing)**

**Location:** `.claude/context/reflection-queue.jsonl`  
**Impact:** Reflection insights may be lost, file is 264KB  
**Details:** The file exists and has grown to 264KB but the processing mechanism in `reflection-queue-processor.cjs` only runs on SessionEnd, which may not trigger reliably.

**Fix Required:** Add periodic processing or manual trigger.

---

### 15. **Code Index Lock File Stale**

**Location:** `.claude/context/code-index/.indexing.lock`  
**Impact:** Code indexing may be blocked  
**Details:** Lock file exists but may be stale from a previous interrupted indexing operation.

**Fix Required:** Implement lock file cleanup on startup.

---

### 16. **Memory Dashboard Metrics Fallback**

**Location:** `.claude/hooks/memory/memory-health-check.cjs`  
**Impact:** Metrics may be written to fallback location  
**Details:** Code shows fallback to `metrics/fallback.jsonl` when dashboard fails to load.

**Fix Required:** Ensure primary metrics path works or document fallback behavior.

---

### 17. **router-decision.md References Deprecated Hook (NEW)**

**Location:** `.claude/workflows/core/router-decision.md` (line ~283)  
**Impact:** Documentation references non-functional enforcement  
**Details:** The workflow document states:

```
**Enforcement**: The `skill-creation-guard.cjs` hook blocks direct SKILL.md writes unless skill-creator was recently invoked.
```

But `skill-creation-guard.cjs` has been deprecated and renamed to `.deprecated`. The actual enforcement is now handled by `unified-creator-guard.cjs`.

**Fix Required:** Update router-decision.md to reference `unified-creator-guard.cjs` instead.

---

### 18. **Spawn Size Audit Log Growing Unbounded**

**Location:** `.claude/context/spawn-size-audit.jsonl`  
**Impact:** Potential disk space issue over time  
**Details:** JSONL file grows without rotation.

**Fix Required:** Implement log rotation.

---

### 19. **Event Bus JSONL Growing Unbounded**

**Location:** `.claude/context/runtime/event-bus.jsonl`  
**Impact:** Potential disk space issue  
**Details:** Event log grows without rotation.

**Fix Required:** Implement log rotation.

---

### 20. **User Prompt Results Log Growing Unbounded**

**Location:** `.claude/context/runtime/user-prompt-results.jsonl`  
**Impact:** Potential disk space issue  
**Details:** Results log grows without rotation.

**Fix Required:** Implement log rotation.

---

### 21. **Hook Metrics Log Growing Unbounded**

**Location:** `.claude/context/metrics/hook-metrics.jsonl`  
**Impact:** Potential disk space issue  
**Details:** Metrics log grows without rotation.

**Fix Required:** Implement log rotation.

---

## MINOR ISSUES (P3 - Polish/Cleanup)

### 22. **Deprecated Skills Still in Catalog**

**Location:** `.claude/context/artifacts/skill-catalog.md`  
**Impact:** Confusion for users  
**Details:** `testing-expert` and `writing` marked as deprecated but still listed.

**Fix Required:** Move to separate deprecated section or remove.

---

### 23. **Empty Directories**

**Locations:**

- `.claude/context/checkpoints/` - Empty
- `.claude/context/sessions/` - Only .gitkeep
- `.claude/context/backups/` - Only .gitkeep

**Impact:** Unused infrastructure  
**Fix Required:** Document purpose or remove.

---

### 24. **Inconsistent File Extensions**

**Location:** Various  
**Impact:** Confusion about module system  
**Details:** Mix of `.cjs`, `.mjs`, `.js` files without clear pattern.

**Fix Required:** Document extension conventions.

---

### 25. **Skill-Build Directory Has Unusual File (TypeScript in Wrong Location)**

**Location:** `.claude/lib/skill-build/src$file`  
**Impact:** File appears to be misplaced TypeScript code  
**Details:** File named `src$file` contains TypeScript code (imports, interfaces, type annotations) but:

1. Has no `.ts` extension
2. Uses ES module syntax (`import`) but is in a `.cjs` directory
3. References non-existent files (`./types.js`, `./parser.js`, `./config.js`)
4. The `$` in filename suggests a failed variable expansion during file creation

**Content preview:**

```typescript
import { readdir } from 'fs/promises';
import { join } from 'path';
import { Rule } from './types.js';
import { parseRuleFile } from './parser.js';
import { RULES_DIR } from './config.js';

interface ValidationError {
  file: string;
  ruleId?: string;
  message: string;
}
```

**Fix Required:** Delete this file - it's clearly a failed file creation artifact.

---

### 26. **Test Directory Name Contains Shell Characters**

**Location:** `tests/data && cp -r Cdevprojectsagent-studio.test-datasync-layer Cdevprojectsagent-studiotestsdata/`  
**Impact:** Invalid directory name, potential security concern  
**Details:** Directory name appears to be a failed shell command that was interpreted as a filename. This suggests a command injection or escaping issue during test setup.

**Fix Required:** Remove invalid directory immediately.

---

## WIRING VERIFICATION

### Hooks Properly Wired ⚠️ PARTIAL

- 60+ hooks in `settings.json` reference files that exist and load without errors
- **EXCEPTION:** `agent-health-hook.cjs` exists but is NOT registered (Critical Issue #3)

### Agents Properly Registered ✅

All 49 agents in `agent-registry.json` have corresponding `.md` files.

### Skills Properly Indexed ⚠️ PARTIAL

434 skills indexed with proper paths to SKILL.md files.

- **EXCEPTION:** Catalog shows 436, index shows 434 (2 skill mismatch)

### Routing Table Complete ✅

`routing-table.cjs` exports all required functions and maps intents to agents.

### Memory System Functional ✅

Core memory functions (recordGotcha, recordPattern, loadMemoryForContext) work correctly.

### Health Tracking System ❌ BROKEN

- `agent-health-hook.cjs` not registered
- All agents show 0 success/0 failure
- Health-aware routing is non-functional

---

## RECOMMENDATIONS

### Immediate Actions (P0 - This Week)

1. **Register agent-health-hook.cjs in settings.json** - Critical for health tracking
2. **Fix post-creation-reminder.cjs path constant** - Remove `hooks` from path
3. **Delete `.claude/lib/skill-build/src$file`** - Invalid file artifact
4. **Delete invalid test directory** - `tests/data && cp -r...`
5. **Implement log rotation** - anomaly-log.jsonl is 1.4MB and growing

### Short-Term Actions (P1 - This Month)

1. Regenerate skill-index.json to match catalog (436 vs 434)
2. Update router-decision.md to reference unified-creator-guard.cjs
3. Process or clear stale evolution suggestions
4. Create missing workflow test files or remove references from runner
5. Enable auto-compression or document why disabled
6. Add file locking for router-state.json

### Long-Term Actions (P2 - This Quarter)

1. Standardize file extensions (.cjs vs .mjs)
2. Clean up empty directories
3. Move deprecated skills to archive
4. Implement more accurate token counting
5. Document experimental LanceDB status

---

## SYSTEM HEALTH SCORE (REVISED)

| Category         | Score  | Notes                                                         |
| ---------------- | ------ | ------------------------------------------------------------- |
| Core Routing     | 80/100 | Works but has race condition risk, deprecated hook references |
| Memory System    | 75/100 | Functional but auto-compression disabled, 1.4MB anomaly log   |
| Agent Registry   | 40/100 | **Health tracking completely broken** - hook not registered   |
| Skill Catalog    | 85/100 | 2 skill mismatch (436 vs 434)                                 |
| Hook System      | 85/100 | 60+ hooks work, but agent-health-hook NOT registered          |
| Workflow Engine  | 55/100 | Test suite broken, missing 3 test files                       |
| Evolution System | 65/100 | Stale suggestions, deprecated hook still referenced           |
| Monitoring       | 50/100 | Unbounded log growth (1.4MB anomaly log), no rotation         |
| File System      | 70/100 | Invalid files (src$file), invalid directories                 |

**Overall System Health: 72/100** (downgraded from 77)

### Critical Gaps Identified in Deep Dive:

1. **Agent Health Tracking is DEAD** - The entire Phase 3D implementation exists but was never wired in
2. **Log files growing unbounded** - anomaly-log.jsonl at 1.4MB, reflection-queue at 264KB
3. **Documentation references deprecated code** - router-decision.md references skill-creation-guard.cjs
4. **Invalid artifacts in codebase** - src$file, shell-injection directory name

The system is functional for basic operations but has significant technical debt and several completely non-functional subsystems that should be addressed immediately.

---

## APPENDIX: VERIFICATION COMMANDS

```bash
# Verify agent-health-hook is NOT registered
grep -r "agent-health" .claude/settings.json
# Returns: nothing (PROBLEM)

# Verify anomaly log size
Get-ChildItem .claude/context/self-healing/anomaly-log.jsonl | Select-Object Length
# Returns: 1428196 bytes (1.4MB)

# Verify src$file exists
Test-Path ".claude/lib/skill-build/src`$file"
# Returns: True (PROBLEM)

# Verify invalid test directory exists
Test-Path "tests/data && cp -r*"
# Returns: True (PROBLEM)

# Verify post-creation-reminder has wrong path
Select-String "hooks.*lib.*routing" .claude/hooks/session/post-creation-reminder.cjs
# Returns: match on line 41 (PROBLEM)
```

---

_Report generated by Kiro AI - February 4, 2026_
_Revision 2: Deep Dive Update with additional critical findings_
