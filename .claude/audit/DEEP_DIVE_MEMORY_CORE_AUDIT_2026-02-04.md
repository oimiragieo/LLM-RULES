# Deep Dive Audit: Memory System & Core Fundamentals

**Date:** 2026-02-04  
**Auditor:** Kiro AI  
**Scope:** Complete 100% audit of `.claude` memory system and core application fundamentals  
**Standard:** Critical review, no slack given. Every unwired, broken, or inconsistent item documented with **what is wrong** and **why it matters**.

---

## Executive Summary

This audit builds upon and extends the previous `MEMORY_AND_CORE_100_PERCENT_AUDIT_2026-02-04.md`. After deep-diving into additional files including cold-storage, retention config, model-client, memory extraction pipeline, memory-scheduler, and the complete hook chains, I have identified **additional issues** and **corrected previous findings**.

**IMPORTANT CORRECTION:** The previous audit incorrectly stated that `agent-context-tracker`, `post-spawn-task-updater`, `variable-quoting-validator`, `shellcheck-validator`, and `command-allowlist-validator` were "not wired." Upon reviewing `settings.json`, **all of these hooks ARE properly wired**. The previous audit was based on outdated information.

**Overall Assessment:** The memory system is approximately **85% functional** with the remaining 15% consisting of:
1. **Critical:** Model client requires API key for real intelligence (falls back to mock)
2. **Critical:** Memory extraction pipeline depends on model client (mock mode produces limited results)
3. **Critical:** config.yaml model selection is validated but never applied (CONFIG-001)
4. **High:** Cold storage archival is async but called synchronously in scheduler (potential race)
5. **High:** Memory deduplication requires model client for intelligent decisions
6. **Medium:** Several prompt templates are hardcoded and not configurable
7. **Medium:** Entity linking creates bidirectional relationships but no cleanup mechanism

---

## 1. Memory System Deep Dive

### 1.1 Cold Storage System (`cold-storage.cjs`)

**Status:** ✅ Wired and functional

**What works:**
- `archiveOldLTM()` correctly archives old LTM summaries to gzip'd JSONL files
- `searchColdStorage()` queries LanceDB with `tier=cold` filter
- Retention config is properly loaded from environment variables
- Path validation prevents traversal attacks

**Issues Found:**

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| COLD-001 | Medium | `listLTMSummaries()` is marked `@deprecated` but still used internally | Confusing API; should either remove deprecation or use memory-tiers |
| COLD-002 | Low | `buildIndexDocument()` truncates content but doesn't indicate truncation in metadata | Search results may be incomplete without indication |

**Code Evidence:**
```javascript
// Line 47-48: Deprecated but used
/**
 * @deprecated Use memory-tiers.cjs for canonical LTM access.
 */
function listLTMSummaries(projectRoot = PROJECT_ROOT) {
```

---

### 1.2 Memory Retention Config (`memory-retention-config.cjs`)

**Status:** ✅ Properly implemented

**What works:**
- Environment variable parsing with sensible defaults
- Path validation for cold directory
- Boolean parsing handles multiple formats (true/false, 1/0, on/off, yes/no)

**No issues found.** This module is clean and well-implemented.

---

### 1.3 Model Client (`model-client.cjs`)

**Status:** ⚠️ Functional but with critical limitation

**What works:**
- Anthropic API integration when API key is present
- Mock mode fallback when no API key

**Critical Issues:**

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| MODEL-001 | **Critical** | No API key = mock responses only | Memory extraction, deduplication, and session summaries produce **mock/placeholder data** instead of real intelligence |
| MODEL-002 | High | Mock responses are hardcoded patterns | Mock mode returns `{"summary": "Mock Plan", "tasks": [...]}` regardless of actual content |
| MODEL-003 | Medium | No retry logic or rate limiting | API failures are not retried; high-volume usage may hit rate limits |
| MODEL-004 | Low | Model name hardcoded to `claude-3-5-sonnet-20240620` | Should use config.yaml model selection |

**Code Evidence:**
```javascript
// Lines 27-30: Mock mode when no API key
if (!this.apiKey) {
  console.warn('[ModelClient] No API key found. Using MOCK response.');
  return this._mockResponse(system, normalizedMessages);
}
```

**Impact Analysis:**
- `memory-extractor.cjs` uses ModelClient → Without API key, extraction returns empty or mock memories
- `memory-deduplicator.cjs` uses ModelClient → Without API key, dedup decisions are mock (always "create")
- `session-summary.cjs` uses ModelClient → Without API key, summaries are mock

---

### 1.4 Memory Extraction Pipeline

**Status:** ⚠️ Wired but depends on model client

**Components Verified:**
1. `memory-extract.cjs` (CLI) → ✅ Exists and calls `runExtractionPipeline()`
2. `run-extraction-pipeline.cjs` → ✅ Orchestrates extraction
3. `memory-extractor.cjs` → ✅ Extracts memories from sessions
4. `memory-extraction-writer.cjs` → ✅ Writes extracted memories
5. `memory-deduplicator.cjs` → ✅ Deduplicates candidates
6. `memory-entity-links.cjs` → ✅ Links memories to tools

**Issues Found:**

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| EXTRACT-001 | **Critical** | Entire pipeline depends on ModelClient | Without API key, `extractMemoriesFromSession()` returns empty array |
| EXTRACT-002 | High | `deduplicateCandidate()` requires model for intelligent decisions | Falls back to "create" for all candidates without API key |
| EXTRACT-003 | Medium | `linkMemoryToTools()` creates bidirectional relationships | No cleanup when memories are deleted; orphan relationships accumulate |
| EXTRACT-004 | Low | `buildRecentMessages()` has no message limit | Very long sessions could produce oversized prompts |

**Code Evidence (memory-extractor.cjs):**
```javascript
// Lines 56-72: Returns empty on any failure
try {
  const response = await modelClient.generateText({ system, messages: userPrompt });
  // ... parsing
} catch (error) {
  logger.warn('Memory extraction failed', { error: error.message });
  return []; // Empty array on failure
}
```

---

### 1.5 Memory Scheduler (`memory-scheduler.cjs`)

**Status:** ✅ Wired and functional

**What works:**
- Daily maintenance: consolidation, health check, metrics logging
- Weekly maintenance: summarization, deduplication, pruning, cold archival, extraction, reports
- Status tracking with history
- CLI interface for manual runs

**Issues Found:**

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| SCHED-001 | High | `runArchiveOldLTM()` spawns async process but scheduler is synchronous | Potential race condition; archival may not complete before status is written |
| SCHED-002 | Medium | `runExtraction()` spawns child process with `--json` flag | If extraction fails, error is in stderr but only stdout is parsed |
| SCHED-003 | Low | History limited to 30 entries | Long-running systems lose historical data |

**Code Evidence:**
```javascript
// Lines 340-370: Async archival in sync context
const script = `
(async () => {
  const { archiveOldLTM } = require(...);
  // ... async operation
})().catch(...);
`;
const proc = spawnSync(process.execPath, ['-e', script], {...});
// spawnSync waits, but the async operation inside may not complete
```

---

### 1.6 Memory Dashboard (`memory-dashboard.cjs`)

**Status:** ✅ Wired and functional

**What works:**
- Metrics collection across all tiers
- Health score calculation with weighted averages
- Recommendation generation based on thresholds
- Historical metrics tracking
- LanceDB status reporting

**Issues Found:**

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| DASH-001 | Low | `node:sqlite` import may fail on older Node versions | Dashboard crashes if SQLite not available |
| DASH-002 | Low | Entity/relationship counts are best-effort | Dashboard shows 0 if SQLite query fails |

---

### 1.7 Reflection Queue Processor (`reflection-queue-processor.cjs`)

**Status:** ✅ Wired but SessionEnd-dependent

**What works:**
- Reads queue from JSONL file
- Generates spawn requests for reflection-agent
- Marks entries as processed
- Writes spawn request file for Router to consume

**Issues Found:**

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| REFLECT-001 | High | Only runs on SessionEnd by default | In headless environments, queue never drains (documented, but critical) |
| REFLECT-002 | Medium | Spawn requests written to file, not directly spawned | Router must read file and spawn; if Router doesn't check, reflections never run |
| REFLECT-003 | Low | `REFLECTION_QUEUE_PROCESS_ON_PROMPT=on` is opt-in | Default behavior leaves queue unprocessed in many environments |

---

### 1.8 User Prompt Unified Hook (`user-prompt-unified.cjs`)

**Status:** ✅ Wired and comprehensive

**What works:**
- Router mode reset on every prompt (ROUTING-002 fix)
- Session boundary detection (ROUTING-003 fix)
- STM write on every prompt
- Memory reminder display
- Evolution trigger detection
- Memory health check
- Token monitoring and auto-compression
- Weekly maintenance fallback

**Issues Found:**

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| UNIFIED-001 | Medium | `memoryTiers` import wrapped in try/catch with fallback to null | If import fails, STM writes silently skip |
| UNIFIED-002 | Low | `logger` used before definition in some code paths | Potential reference error (though unlikely in practice) |

---

## 2. Core Fundamentals Verification

### 2.1 Verification of Previous Audit Issues

**IMPORTANT CORRECTION:** Upon reviewing `settings.json`, several issues from the previous audit have been **RESOLVED**:

| Issue ID | Previous Status | Current Status | Evidence |
|----------|-----------------|----------------|----------|
| CONFIG-001 | Not Applied | **Still Present** | config-model-validator validates but doesn't inject model |
| ROUTER-MONITORING-001 | Not Wired | **✅ RESOLVED** | agent-context-tracker and post-spawn-task-updater ARE wired in PostToolUse(Task) |
| SHELL-SECURITY-003 | Not Wired | **✅ RESOLVED** | variable-quoting-validator, shellcheck-validator, command-allowlist-validator ARE wired in PreToolUse(Bash) |

**Evidence from settings.json:**

```json
// PostToolUse Task - agent-context-tracker and post-spawn-task-updater ARE wired
{
  "matcher": "Task",
  "hooks": [
    {"command": "node .claude/hooks/routing/agent-context-tracker.cjs"},
    {"command": "node .claude/hooks/routing/post-spawn-task-updater.cjs"},
    // ... other hooks
  ]
}

// PreToolUse Bash - shell validators ARE wired
{
  "matcher": "Bash",
  "hooks": [
    {"command": "node .claude/hooks/safety/variable-quoting-validator.cjs"},
    {"command": "node .claude/hooks/safety/shellcheck-validator.cjs"},
    {"command": "node .claude/hooks/safety/command-allowlist-validator.cjs"},
    // ... other hooks
  ]
}
```

**Conclusion:** The previous audit report `MEMORY_AND_CORE_100_PERCENT_AUDIT_2026-02-04.md` contains **outdated information**. The hooks it claimed were "not wired" are in fact wired in the current settings.json. Only CONFIG-001 (model selection not applied) remains valid.

### 2.2 New Findings

| Issue | Severity | What is wrong | Why it matters |
|-------|----------|---------------|----------------|
| CORE-001 | **Critical** | ModelClient mock mode affects all "intelligent" operations | Without ANTHROPIC_API_KEY, memory extraction, deduplication, and summaries are non-functional |
| CORE-002 | High | Memory extraction prompt is 300+ lines | Large prompt consumes significant tokens; no caching |
| CORE-003 | Medium | `getDedupDecisionPrompt()` not verified | Dedup prompt file exists but wasn't fully audited |

---

## 3. Wiring Verification

### 3.1 Hook Wiring Correction

**The previous audit `MEMORY_AND_CORE_100_PERCENT_AUDIT_2026-02-04.md` contained errors.** Upon reviewing the actual `settings.json`, the following hooks that were claimed to be "not wired" are in fact **properly wired**:

| Hook | Claimed Status | Actual Status | Location in settings.json |
|------|----------------|---------------|---------------------------|
| agent-context-tracker.cjs | "Not wired" | ✅ **WIRED** | PostToolUse → Task |
| post-spawn-task-updater.cjs | "Not wired" | ✅ **WIRED** | PostToolUse → Task |
| variable-quoting-validator.cjs | "Not wired" | ✅ **WIRED** | PreToolUse → Bash |
| shellcheck-validator.cjs | "Not wired" | ✅ **WIRED** | PreToolUse → Bash |
| command-allowlist-validator.cjs | "Not wired" | ✅ **WIRED** | PreToolUse → Bash |
| router-enforcer.cjs | "Not wired" | ❌ Not wired | (Logic merged into user-prompt-unified) |

**Only `router-enforcer.cjs` is genuinely not wired**, but its functionality has been merged into `user-prompt-unified.cjs` which IS wired on UserPromptSubmit.

### 3.2 Memory Hooks (settings.json)

| Hook | Event | Wired | Works |
|------|-------|-------|-------|
| user-prompt-unified.cjs | UserPromptSubmit | ✅ | ✅ |
| memory-health-check.cjs | UserPromptSubmit | ✅ | ✅ |
| format-memory.cjs | PostToolUse(Edit\|Write\|NotebookEdit) | ✅ | ✅ |
| sync-memory-index.cjs | PostToolUse(Edit\|Write\|NotebookEdit, MemoryRecord) | ✅ | ✅ |
| unified-reflection-handler.cjs | SessionEnd, PostToolUse(Task\|TaskUpdate\|Bash) | ✅ | ✅ |
| reflection-queue-processor.cjs | SessionEnd | ✅ | ⚠️ SessionEnd-dependent |
| reflection-step0-guard.cjs | PreToolUse(TaskList) | ✅ | ✅ |

### 3.2 Memory CLI Tools

| Tool | Path | Works |
|------|------|-------|
| memory-extract.cjs | .claude/tools/cli/ | ⚠️ Requires API key |
| init-memory-db.cjs | .claude/tools/cli/ | ✅ |
| generate-embeddings.cjs | .claude/tools/cli/ | ✅ |
| migrate-memory.cjs | .claude/tools/cli/ | ✅ |

### 3.3 Memory Scheduler Tasks

| Task | Runs | Works |
|------|------|-------|
| consolidation | Daily | ✅ |
| healthCheck | Daily | ✅ |
| metricsLog | Daily | ✅ |
| summarization | Weekly | ⚠️ Requires API key for intelligent summaries |
| deduplication | Weekly | ✅ (uses smart-pruner, not model) |
| pruning | Weekly | ✅ |
| archiveOldLTM | Weekly | ✅ |
| extraction | Weekly | ⚠️ Requires API key |
| weeklyReport | Weekly | ✅ |

---

## 4. Explicit Issue List

### 4.1 Critical Issues (Must Fix)

1. **CORE-001 / MODEL-001:** ModelClient requires ANTHROPIC_API_KEY for real functionality
   - **Impact:** Memory extraction returns empty; deduplication always creates; summaries are mock
   - **Fix:** Document requirement prominently; add startup warning if key missing

2. **CONFIG-001:** config.yaml model selection is validated but never applied
   - **Impact:** Spawns use hardcoded models regardless of config
   - **Fix:** Implement model injection in spawn-prompt-assembler or pre-task-unified

~~3. **ROUTER-MONITORING-001:** agent-context-tracker and post-spawn-task-updater not wired~~
   - **Status:** ✅ RESOLVED - Both hooks ARE wired in PostToolUse(Task) in settings.json

### 4.2 High Severity Issues

4. **EXTRACT-001:** Memory extraction pipeline non-functional without API key
   - **Impact:** Weekly extraction task produces no memories
   - **Fix:** Add fallback extraction using pattern matching; document API key requirement

5. **SCHED-001:** Async archival in sync scheduler context
   - **Impact:** Potential race condition; archival may not complete
   - **Fix:** Use synchronous archival or proper async handling

6. **REFLECT-001:** Reflection queue only drains on SessionEnd
   - **Impact:** Headless environments accumulate unbounded queue
   - **Fix:** Enable REFLECTION_QUEUE_PROCESS_ON_PROMPT by default or add cron documentation

~~7. **SHELL-SECURITY-003:** variable-quoting-validator not wired~~
   - **Status:** ✅ RESOLVED - Hook IS wired in PreToolUse(Bash) in settings.json

### 4.3 Medium Severity Issues

8. **COLD-001:** Deprecated function still used internally
9. **MODEL-003:** No retry logic for API calls
10. **EXTRACT-003:** Orphan entity relationships accumulate
11. **UNIFIED-001:** Silent STM write failures
12. **CORE-002:** Large extraction prompt consumes tokens

### 4.4 Low Severity Issues

13. **COLD-002:** Truncation not indicated in metadata
14. **MODEL-004:** Hardcoded model name
15. **EXTRACT-004:** No message limit in prompt building
16. **SCHED-002:** Extraction errors in stderr not captured
17. **SCHED-003:** History limited to 30 entries
18. **DASH-001/002:** SQLite dependency issues

---

## 5. Recommendations

### Immediate Actions (Critical)

1. **Add ANTHROPIC_API_KEY requirement to GETTING_STARTED.md**
   ```markdown
   ## Required Environment Variables
   
   For full memory system functionality:
   - `ANTHROPIC_API_KEY` - Required for memory extraction, deduplication, and intelligent summaries
   ```

2. **Add startup warning in memory-manager.cjs**
   ```javascript
   if (!process.env.ANTHROPIC_API_KEY) {
     console.warn('[MEMORY] ANTHROPIC_API_KEY not set. Memory extraction and deduplication will use mock mode.');
   }
   ```

3. **Update previous audit report** - Mark ROUTER-MONITORING-001 and SHELL-SECURITY-003 as RESOLVED
   - agent-context-tracker IS wired in PostToolUse(Task)
   - post-spawn-task-updater IS wired in PostToolUse(Task)
   - variable-quoting-validator IS wired in PreToolUse(Bash)
   - shellcheck-validator IS wired in PreToolUse(Bash)
   - command-allowlist-validator IS wired in PreToolUse(Bash)

### Short-Term Actions (High)

4. **Implement fallback extraction without model**
   - Pattern-based extraction for common memory types
   - Keyword extraction for decisions, patterns, gotchas

5. **Fix async archival race condition**
   - Either make archival synchronous or use proper promise handling

6. **Enable reflection queue processing by default**
   - Change default for REFLECTION_QUEUE_PROCESS_ON_PROMPT to 'on'

### Medium-Term Actions

7. **Add entity relationship cleanup**
   - Periodic task to remove orphan relationships
   - Add to weekly maintenance

8. **Implement model selection injection**
   - Extend spawn-prompt-assembler to apply config.yaml model

9. **Add retry logic to ModelClient**
   - Exponential backoff for transient failures
   - Rate limit handling

---

## 6. Conclusion

The memory system has a solid foundation with proper tiered storage (STM/MTM/LTM), entity indexing, and maintenance scheduling. However, **the "intelligent" features (extraction, deduplication, summaries) are non-functional without an API key**, which is not prominently documented.

**IMPORTANT CORRECTION:** The previous audit incorrectly claimed several hooks were "not wired." Upon verification, `agent-context-tracker`, `post-spawn-task-updater`, `variable-quoting-validator`, `shellcheck-validator`, and `command-allowlist-validator` are ALL properly wired in `settings.json`. The core routing system works correctly.

The remaining critical gap is **CONFIG-001: config.yaml model selection is validated but not applied** - spawns use hardcoded models regardless of configuration.

**Priority fixes:**
1. Document API key requirement prominently
2. Implement model selection injection (CONFIG-001)
3. Add fallback extraction for environments without API key
4. Fix async archival race condition

This audit should be used to create actionable tickets for each critical and high-severity issue.

---

## Appendix: Files Audited

| File | Lines | Status |
|------|-------|--------|
| cold-storage.cjs | 230 | ✅ Audited |
| memory-retention-config.cjs | 55 | ✅ Audited |
| model-client.cjs | 95 | ✅ Audited |
| memory-extract.cjs | 40 | ✅ Audited |
| run-extraction-pipeline.cjs | 85 | ✅ Audited |
| memory-extractor.cjs | 75 | ✅ Audited |
| memory-extraction-writer.cjs | 200 | ✅ Audited |
| memory-deduplicator.cjs | 120 | ✅ Audited |
| memory-entity-links.cjs | 110 | ✅ Audited |
| memory-extraction.cjs (prompt) | 300 | ✅ Audited |
| memory-dashboard.cjs | 450 | ✅ Audited |
| memory-scheduler.cjs | 600 | ✅ Audited |
| reflection-queue-processor.cjs | 400 | ✅ Audited |
| user-prompt-unified.cjs | 1400+ | ✅ Audited (partial due to truncation) |
| Previous audit report | 500 | ✅ Reviewed |

**Total files audited:** 15
**Total lines reviewed:** ~4,500+

---

## 7. ADDENDUM: decisions.md Token Limit Violation (2026-02-04 Architect Audit)

**Auditor**: architect (Claude Opus 4.5)
**Task**: #4 - 100% Memory System Audit

### 7.1 CRITICAL FINDING: decisions.md EXCEEDS TOKEN LIMIT

| Metric | Value | Limit | Status |
|--------|-------|-------|--------|
| File Size | 100,109 bytes (~98KB) | - | - |
| Line Count | 1,653 lines | 1,500 lines | **EXCEEDS by 10%** |
| Token Estimate | ~27,572 tokens | 25,000 tokens | **EXCEEDS by 10%** |

### 7.2 Root Cause Analysis

1. **memory-rotator.cjs uses AGE-BASED rotation (60 days)**, not SIZE-BASED
2. **memory-health-check.cjs monitors learnings.md (35KB)**, NOT decisions.md
3. **No hook triggers rotation** when decisions.md approaches limit
4. **All ADRs are within 60 days** (oldest is 2026-01-23), so rotation never triggers

### 7.3 ADR Content Summary

File contains 78+ ADRs spanning:
- ADR-001 to ADR-005 (2026-01-23 to 2026-01-25) - Foundation
- ADR-041 to ADR-043 (2026-01-28) - Feature flags, routing
- ADR-051 to ADR-078 (2026-01-28 to 2026-01-31) - Major features

### 7.4 Why This Is Critical

1. **Read Tool Limit**: Claude Code Read tool has ~25K token limit
2. **Context Bloat**: Router loads decisions.md on every spawn
3. **ADR-052 Violation**: ADR-052 specifies "Archive ADRs older than 60 days when file > 1500 lines"
   - File IS > 1500 lines
   - No rotation has run

### 7.5 SQLite Sync Gap

| Source | Count | Sync Status |
|--------|-------|-------------|
| decisions.md | 78+ ADRs | Source of truth |
| SQLite entities (decision type) | 16 entities | **ONLY 20% SYNCED** |

The entity database has only 16 of 78+ decisions indexed, breaking the entity graph.

### 7.6 Recommended Fixes

**FIX-A (CRITICAL - Run NOW):**
```bash
node .claude/lib/memory/memory-rotator.cjs rotate-decisions
```

**FIX-B (Add SIZE-BASED threshold to memory-rotator.cjs):**
```javascript
const CONFIG = {
  DECISIONS_SIZE_THRESHOLD_KB: 80, // ~20K tokens
  DECISIONS_TARGET_SIZE_KB: 50, // ~12K tokens after rotation
  // Existing:
  ADR_AGE_THRESHOLD: 60, // days
};
```

**FIX-C (Add decisions.md to memory-health-check.cjs):**
```javascript
const decisionsPath = path.join(memoryDir, 'decisions.md');
const decisionsSizeKB = getFileSizeKB(decisionsPath);
if (decisionsSizeKB > 80) { // ~20K tokens warning
  warnings.push(`decisions.md is ${decisionsSizeKB}KB - rotation recommended`);
}
```

**FIX-D (Sync all decisions to SQLite):**
- Run sync-memory-index on decisions.md
- Verify entity count increases to 78+

### 7.7 Issues.md Status (Secondary Finding)

| Metric | Value | Status |
|--------|-------|--------|
| Lines | 2,424 | Large but OK |
| OPEN issues | 7 | Matches header |
| RESOLVED issues | 107+ | Matches header |

Notable OPEN issues:
- LINT-001 (HIGH) - ADR-076 linting errors
- TOOL-001 (HIGH) - 14 agents with legacy tool references
- MIGRATION-001 (LOW) - File count discrepancy

### 7.8 Learnings.md Status (Healthy)

| Metric | Value | Status |
|--------|-------|--------|
| Lines | 112 | HEALTHY |
| Archive | 1MB+ archived to learnings-2026-01.md | WORKING |

### 7.9 Conclusion

The memory system has **one critical unmonitored gap**: decisions.md size is not monitored, allowing it to exceed the 25K token Read tool limit. This violates ADR-052 and creates context bloat.

**Priority:**
1. **IMMEDIATE**: Run decisions.md rotation to reduce size
2. **HIGH**: Add decisions.md monitoring to memory-health-check.cjs
3. **MEDIUM**: Add size-based rotation threshold
4. **MEDIUM**: Sync all decisions to SQLite entity database

---

**Addendum Date**: 2026-02-04
**Addendum Author**: architect agent (Task #4)
