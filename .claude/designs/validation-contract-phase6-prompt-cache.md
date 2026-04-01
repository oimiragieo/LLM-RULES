# Validation Contract: Phase 6 — Prompt Cache & Context Intelligence

> **Status**: Draft
> **Date**: 2026-03-31
> **Scope**: Testable assertions for prompt cache optimization, context management, and cross-area integration
> **Source Files**:
> - `.claude/lib/spawn/prompt-assembler.cjs`
> - `.claude/lib/spawn/prompt-assembler-sections.cjs`
> - `.claude/lib/spawn/prompt-assembler-data.cjs`
> - `.claude/hooks/session/pre-compact.cjs`
> - `.claude/hooks/monitoring/context-window-monitor.cjs`
> - `.claude/skills/context-degradation/SKILL.md`

---

## Milestone 1 — Prompt Cache Optimization (`VAL-PC-*`)

### VAL-PC-001: Tools sorted alphabetically in filterAndDescribeTools()

`filterAndDescribeTools()` in `prompt-assembler-data.cjs` returns tool descriptors sorted alphabetically by `name`, regardless of input order. This ensures stable prompt prefix ordering for cache hits.

**Pass condition**: Given tools `["Write", "Bash", "Read", "Edit"]`, the returned array has names in order `["Bash", "Edit", "Read", "Write"]`.

**Fail condition**: Returned array preserves input order or uses any non-alphabetical ordering.

**Evidence**: Unit test calls `filterAndDescribeTools()` with shuffled tool names and asserts `result.map(t => t.name)` equals the alphabetically sorted version. Run with at least 3 different input orderings.

---

### VAL-PC-002: Skills sorted alphabetically in getSkillsByAgent()

`getSkillsByAgent()` in `prompt-assembler-data.cjs` returns skills sorted alphabetically by `name` within each priority tier (primary, supporting, generic). Final output is deterministic across calls with the same inputs.

**Pass condition**: Two consecutive calls to `getSkillsByAgent('developer', 20)` return identical arrays with names in alphabetical order within each tier grouping. Primary skills come first (alphabetically sorted), then supporting (alphabetically sorted), then generic (alphabetically sorted).

**Fail condition**: Output order varies between calls, or skills within the same tier are not alphabetically sorted.

**Evidence**: Unit test calls `getSkillsByAgent()` twice with the same agent type, asserts deep equality. Separately verifies alphabetical ordering within each tier by mocking a skill-index with known multi-skill tiers.

---

### VAL-PC-003: Section content memoization caches formatted strings

A memoization layer caches the output of `buildToolsSection()`, `buildSkillsSection()`, and `buildDiscoverySection()` keyed by their inputs. Repeated calls with identical inputs return the cached string without re-computation.

**Pass condition**: After calling `buildToolsSection(tools)` once, a second call with the same `tools` array returns in <1ms and produces the identical string (reference or value equality). A spy/counter on the internal formatting logic confirms it executed exactly once.

**Fail condition**: Each call re-executes formatting logic, or cache returns stale data after inputs change.

**Evidence**: Unit test with a call-counter wrapper around `buildToolsSectionInternal`. First call increments counter to 1. Second identical call keeps counter at 1. Third call with different tools increments to 2. Assert string equality for cached calls.

---

### VAL-PC-004: Safety and protocol blocks in stable prefix, not dynamic basePrompt

The FORBIDDEN COMMANDS, SPAWNED AGENT PROTOCOL, and TOKEN USAGE REPORTING blocks are injected via `injectSections()` as part of the static hierarchy top (before the volatile basePrompt), not appended to `buildBasePrompt()`.

**Pass condition**: The assembled prompt from `assembleSpawnPrompt()` places `FORBIDDEN COMMANDS`, `SPAWNED AGENT PROTOCOL`, and `TASKUPDATE CONTRACT` text **before** the `basePrompt` content in the final string. These blocks appear in the stable prefix zone (alongside tools/skills sections).

**Fail condition**: These blocks appear after the basePrompt content, or are still concatenated inside `buildBasePrompt()`.

**Evidence**: Call `assembleSpawnPrompt({ basePrompt: '%%MARKER%%' })`. Assert that `indexOf('FORBIDDEN COMMANDS') < indexOf('%%MARKER%%')` and `indexOf('SPAWNED AGENT PROTOCOL') < indexOf('%%MARKER%%')`.

---

### VAL-PC-005: Duplicate TaskUpdate contract eliminated

The TaskUpdate completion contract is defined in exactly one location. Currently it is duplicated in both `buildBasePrompt()` (prompt-assembler.cjs, agent protocol block) and `buildToolsSection()` (prompt-assembler-sections.cjs, TASKUPDATE CONTRACT section).

**Pass condition**: After the fix, searching the full output of `assembleSpawnPrompt()` for the string `"TaskUpdate"` contract headers finds exactly **one** canonical section. No duplicate `TASKUPDATE CONTRACT` or `TaskUpdate Completion Contract` headings appear.

**Fail condition**: Two or more distinct TaskUpdate contract blocks appear in the assembled prompt.

**Evidence**: `const prompt = assembleSpawnPrompt(defaults); const matches = prompt.match(/TASK.?UPDATE.*CONTRACT/gi); assert(matches.length === 1)`.

---

### VAL-PC-006: Cache-break-detector hashes sections and logs changes

A `cache-break-detector` module exists that computes a hash (e.g., SHA-256 or FNV) of each prompt section (tools, skills, discovery, memory, behaviour, basePrompt) and logs hash changes to the flight recorder.

**Pass condition**: When any section content changes between two `assembleSpawnPrompt()` calls, the detector identifies which section(s) changed and writes a structured entry to the flight recorder with `{ event: 'cache-break', changedSections: [...], hashes: { before, after } }`.

**Fail condition**: No logging occurs on section change, or the detector fails to identify which specific section broke the cache.

**Evidence**: Unit test calls `assembleSpawnPrompt()` twice — first with tools `[A, B]`, second with tools `[A, B, C]`. Assert flight recorder received exactly one `cache-break` event with `changedSections` containing `'toolsSection'`.

---

### VAL-PC-007: Cache-break-detector does not log when sections are stable

The cache-break-detector does **not** emit false-positive cache-break events when sections are identical between calls.

**Pass condition**: Two consecutive `assembleSpawnPrompt()` calls with identical inputs produce zero `cache-break` events in the flight recorder.

**Fail condition**: A `cache-break` event is emitted despite no section content change.

**Evidence**: Unit test calls `assembleSpawnPrompt()` twice with identical args. Assert flight recorder has zero `cache-break` entries for that interval.

---

### VAL-PC-008: Memoization cache invalidates on input change

The section memoization cache (VAL-PC-003) correctly invalidates when inputs change, preventing stale cached content from being served.

**Pass condition**: After `buildToolsSection([A, B])` is cached, calling `buildToolsSection([A, B, C])` produces a fresh result containing tool C. The old cached value is not returned.

**Fail condition**: Stale cached string (without tool C) is returned after inputs change.

**Evidence**: Unit test verifies output string contains the new tool name after input change, and call-counter increments.

---

## Milestone 2 — Context Management (`VAL-CM-*`)

### VAL-CM-001: Pre-compact hook persists active file list

The `pre-compact.cjs` hook saves an `activeFiles` array in its snapshot, capturing the list of files the agent has read or edited in the current session (sourced from edit-counter or session state).

**Pass condition**: After triggering pre-compact, the snapshot file (`pre-compact-snapshot.json`) contains an `activeFiles` array with ≥1 file path entry when files have been accessed in the session.

**Fail condition**: The snapshot lacks an `activeFiles` field, or the field is always empty despite file activity.

**Evidence**: Seed `edit-counter.json` with `{ count: 3, files: ["a.js", "b.js"] }`. Run pre-compact hook. Read snapshot file. Assert `snapshot.activeFiles` deep-equals `["a.js", "b.js"]`.

---

### VAL-CM-002: Pre-compact snapshot includes all existing state fields

The pre-compact snapshot retains backward compatibility: `timestamp`, `editCount`, `correctionCount`, `promptCount`, `originalIntent`, and `driftEditCount` are all present alongside the new `activeFiles` field.

**Pass condition**: Snapshot JSON contains all 7 fields (6 existing + `activeFiles`), none are `undefined`.

**Fail condition**: Any pre-existing field is missing or renamed.

**Evidence**: Run pre-compact hook with populated source state files. Parse snapshot. Assert all 7 keys exist with appropriate types.

---

### VAL-CM-003: Context-degradation thresholds align with CC auto-compact constant

The context-degradation skill's severity zone thresholds are updated to align with Claude Code's auto-compact trigger at `contextWindow - 13K` tokens (approximately 187K for a 200K window, i.e., ~93.5%).

**Pass condition**: The SKILL.md severity zones use thresholds that are consistent with a 200K context window where auto-compact fires at ~187K. The Critical zone boundary is set at or below 187K (not above auto-compact). The context-window-monitor.cjs thresholds are consistent with the skill's zones.

**Fail condition**: Skill zones reference arbitrary thresholds (e.g., 140K Critical) that don't account for the CC auto-compact boundary, or monitor thresholds contradict skill zones.

**Evidence**: Parse SKILL.md severity zone table. Assert Critical zone upper bound ≤ 187K. Assert `context-window-monitor.cjs` CRITICAL_THRESHOLD_PCT corresponds to the same boundary (e.g., 0.80 aligning with Red zone at 160K).

---

### VAL-CM-004: Microcompact detection identifies silent token drops

A microcompact detector identifies when the token count drops significantly (>10K tokens) between consecutive turns without a PreCompact hook having fired. This indicates the CC runtime performed a silent compaction.

**Pass condition**: When token usage drops by >10K between turns and no `pre-compact-snapshot.json` was written in that interval, the detector logs a `microcompact-detected` event to the flight recorder with `{ tokensBefore, tokensAfter, delta }`.

**Fail condition**: Silent token drops go undetected, or the detector false-positives on normal PreCompact-triggered compaction.

**Evidence**: Unit test simulates budget-tracker showing 120K → 95K between turns, with no snapshot timestamp change. Assert `microcompact-detected` event logged. Then simulate the same drop WITH a fresh snapshot timestamp — assert no event logged.

---

### VAL-CM-005: Microcompact detector does not false-positive on normal compaction

The microcompact detector distinguishes between CC-triggered silent compaction and normal PreCompact-triggered compaction by checking the pre-compact snapshot timestamp.

**Pass condition**: When a token drop occurs AND a fresh `pre-compact-snapshot.json` was written within the last 30 seconds, no `microcompact-detected` event is logged.

**Fail condition**: A `microcompact-detected` event is logged when the drop was caused by a normal PreCompact flow.

**Evidence**: Set snapshot timestamp to `now - 5s`, simulate 120K → 80K drop. Assert zero `microcompact-detected` events.

---

### VAL-CM-006: Auto-compact circuit breaker detects sustained high usage

A circuit breaker detector identifies when context usage remains ≥93% for 3 or more consecutive turns, indicating the agent is stuck in a produce-compact-produce loop.

**Pass condition**: After 3 consecutive turns where `budget-tracker.json` shows ≥93% usage, the detector logs a `circuit-breaker-tripped` event with `{ consecutiveTurns, avgUsagePct }` and injects an advisory message recommending session handoff.

**Fail condition**: The detector does not trigger after 3+ consecutive high-usage turns, or triggers prematurely after only 1-2 turns.

**Evidence**: Unit test simulates budget-tracker at 94%, 95%, 93% across 3 turn boundaries. Assert `circuit-breaker-tripped` event logged after the 3rd turn. Reset and simulate 94%, 95%, 70% — assert no event (usage dropped below threshold on turn 3).

---

### VAL-CM-007: Circuit breaker resets after usage drops below threshold

The circuit breaker's consecutive-turn counter resets to zero when usage drops below 93% on any turn.

**Pass condition**: After a sequence of 94%, 95%, 80%, 94%, 95% — the counter is 2 (not 5), because the 80% turn reset it.

**Fail condition**: The counter accumulates across non-consecutive high-usage turns, causing premature triggering.

**Evidence**: Unit test simulates the 5-turn sequence above. Assert counter is 2 after the final turn. Assert no `circuit-breaker-tripped` event was logged.

---

### VAL-CM-008: Context-degradation skill updated for post-compact behavior

The `context-degradation` SKILL.md includes guidance for post-compact behavior: what to expect after compaction (loss of tool call details, retention of summaries), how to verify critical context survived, and when to re-read key files.

**Pass condition**: SKILL.md contains a "Post-Compact Recovery" or equivalent section with ≥3 concrete action items (e.g., re-read active files, verify task state, check for microcompact indicators).

**Fail condition**: SKILL.md has no post-compact guidance, or guidance is generic/vague (fewer than 3 actionable steps).

**Evidence**: Parse SKILL.md. Assert a section heading matching `/post.compact/i` exists. Assert the section body contains ≥3 bullet points or numbered items with actionable verbs.

---

### VAL-CM-009: Circuit breaker advisory message is actionable

When the circuit breaker trips (VAL-CM-006), the injected advisory message includes specific remediation steps: invoke `session-handoff` skill, spawn a fresh subagent, or invoke `context-compressor`.

**Pass condition**: The advisory message contains at least two of: `session-handoff`, `context-compressor`, `spawn fresh`. The message is injected via the hook's `additionalContext` field.

**Fail condition**: Advisory is vague ("context is high") without specific skill/action references, or is not injected into the hook response.

**Evidence**: Trigger circuit breaker in test. Capture the hook's JSON output. Assert `additionalContext` contains `session-handoff` and at least one other remediation keyword.

---

### VAL-CM-010: Pre-compact hook remains fail-open

After adding `activeFiles` persistence (VAL-CM-001), the pre-compact hook continues to exit 0 and pass through stdin unchanged even when source state files are missing or malformed.

**Pass condition**: Running the hook with missing `edit-counter.json`, malformed `session-metrics.json`, and absent `drift-state.json` still exits 0, writes a valid snapshot (with empty/default `activeFiles`), and passes stdin through to stdout.

**Fail condition**: Hook exits non-zero, crashes, or corrupts stdout passthrough when state files are unavailable.

**Evidence**: Delete all source state files. Pipe `{"test": true}` to the hook. Assert exit code 0. Assert stdout equals `{"test": true}`. Assert snapshot file exists with `activeFiles: []`.

---

## Milestone 3 — Cross-Area Integration (`VAL-CROSS-*`)

### VAL-CROSS-006: Cache stability under repeated identical assembleSpawnPrompt calls

Calling `assembleSpawnPrompt()` 10 times with identical inputs produces byte-identical output strings and zero cache-break events.

**Pass condition**: All 10 output strings are `===` identical. Flight recorder shows 0 `cache-break` events. Memoization cache is hit 9 out of 10 times for each section.

**Fail condition**: Any output differs, or cache-break events are logged, or sections are recomputed on every call.

**Evidence**: Integration test in `tests/integration/`. Loop 10 calls, collect outputs, assert all equal. Check flight recorder for `cache-break` count === 0.

---

### VAL-CROSS-007: Cache invalidation on tool list change propagates correctly

When the `allowedTools` input changes, only the `toolsSection` cache entry invalidates. Skills, discovery, memory, and behaviour sections remain cached.

**Pass condition**: Changing tools from `[Read, Write]` to `[Read, Write, Bash]` triggers exactly one `cache-break` event with `changedSections: ['toolsSection']`. Other section hashes remain unchanged.

**Fail condition**: Multiple sections report as changed, or no cache-break is detected.

**Evidence**: Integration test calls assembleSpawnPrompt with tools A, then tools B. Assert `cache-break` event lists only `toolsSection`.

---

### VAL-CROSS-008: Compaction cycle does not corrupt prompt assembly

After a simulated compaction (clear caches, write new snapshot), the next `assembleSpawnPrompt()` call produces a valid prompt with all required sections present.

**Pass condition**: Post-compaction prompt contains: `AVAILABLE_TOOLS`, `AVAILABLE_SKILLS`, `SKILL DISCOVERY PROTOCOL`, and the basePrompt content. No section is missing or truncated.

**Fail condition**: Any required section is missing from the post-compaction prompt.

**Evidence**: Call `_clearCache()`, write a fresh pre-compact snapshot, call `assembleSpawnPrompt()`. Assert all 4 section markers are present via regex.

---

### VAL-CROSS-009: Circuit breaker integrates with context-window-monitor

When the circuit breaker is tripped (≥93% for 3+ turns), the `context-window-monitor.cjs` hook's output includes both the standard threshold warning AND the circuit breaker advisory in `additionalContext`.

**Pass condition**: Hook output JSON has `additionalContext` containing both a usage percentage warning (from existing thresholds) and a circuit breaker message (from new detector). Messages are concatenated, not overwritten.

**Fail condition**: Circuit breaker message overwrites the existing threshold warning, or only one of the two messages appears.

**Evidence**: Integration test sets budget-tracker to 95% for 3 consecutive invocations of the monitor hook. Assert final `additionalContext` contains both `"CRITICAL"` (existing) and `"circuit-breaker"` or `"session-handoff"` (new).

---

### VAL-CROSS-010: Alphabetical sorting produces deterministic prompt prefix hash

The combination of alphabetical tool sorting (VAL-PC-001) and skill sorting (VAL-PC-002) produces a prompt prefix that has a stable hash across process restarts (given the same tool-manifest.json and skill-index.json).

**Pass condition**: Compute SHA-256 of the prompt substring from start to end of `SKILL DISCOVERY PROTOCOL` section. Call `_clearCache()` to simulate a fresh process. Recompute. Hashes match.

**Fail condition**: Hashes differ between runs due to non-deterministic ordering.

**Evidence**: Integration test computes prefix hash, clears all caches (simulating restart), recomputes, asserts hash equality.

---

### VAL-CROSS-011: End-to-end prompt assembly under context pressure

Full pipeline test: assemble a prompt, simulate 3 turns at >93% usage, trigger circuit breaker, run pre-compact hook, clear caches, reassemble prompt. Verify the reassembled prompt is valid and all detection systems fired correctly.

**Pass condition**: All of the following occur in sequence: (1) initial prompt is valid, (2) circuit breaker fires after turn 3, (3) pre-compact snapshot includes `activeFiles`, (4) post-clear prompt is valid with all sections, (5) cache-break detector logs the full cache invalidation.

**Fail condition**: Any step in the sequence fails or produces unexpected side effects.

**Evidence**: Integration test orchestrates the full sequence, asserting each intermediate state. Final assert: flight recorder contains entries for `cache-break` and `circuit-breaker-tripped` in chronological order.

---

## Summary

| Milestone | ID Range | Count |
|-----------|----------|-------|
| Prompt Cache Optimization | VAL-PC-001 – VAL-PC-008 | 8 |
| Context Management | VAL-CM-001 – VAL-CM-010 | 10 |
| Cross-Area Integration | VAL-CROSS-006 – VAL-CROSS-011 | 6 |
| **Total** | | **24** |

### ID Registry

| ID | Title |
|----|-------|
| VAL-PC-001 | Tools sorted alphabetically in filterAndDescribeTools() |
| VAL-PC-002 | Skills sorted alphabetically in getSkillsByAgent() |
| VAL-PC-003 | Section content memoization caches formatted strings |
| VAL-PC-004 | Safety and protocol blocks in stable prefix |
| VAL-PC-005 | Duplicate TaskUpdate contract eliminated |
| VAL-PC-006 | Cache-break-detector hashes and logs changes |
| VAL-PC-007 | Cache-break-detector no false positives on stable sections |
| VAL-PC-008 | Memoization cache invalidates on input change |
| VAL-CM-001 | Pre-compact hook persists active file list |
| VAL-CM-002 | Pre-compact snapshot backward compatibility |
| VAL-CM-003 | Context-degradation thresholds align with CC auto-compact |
| VAL-CM-004 | Microcompact detection identifies silent token drops |
| VAL-CM-005 | Microcompact detector no false positive on normal compaction |
| VAL-CM-006 | Auto-compact circuit breaker detects sustained high usage |
| VAL-CM-007 | Circuit breaker resets after usage drops |
| VAL-CM-008 | Context-degradation skill updated for post-compact behavior |
| VAL-CM-009 | Circuit breaker advisory message is actionable |
| VAL-CM-010 | Pre-compact hook remains fail-open |
| VAL-CROSS-006 | Cache stability under repeated identical calls |
| VAL-CROSS-007 | Cache invalidation on tool list change propagates correctly |
| VAL-CROSS-008 | Compaction cycle does not corrupt prompt assembly |
| VAL-CROSS-009 | Circuit breaker integrates with context-window-monitor |
| VAL-CROSS-010 | Alphabetical sorting produces deterministic prefix hash |
| VAL-CROSS-011 | End-to-end prompt assembly under context pressure |
