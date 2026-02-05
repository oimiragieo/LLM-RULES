# Memory System & Core Fundamentals – 100% Audit

**Date:** 2026-02-04  
**Scope:** `.claude` memory system and core application fundamentals  
**Standard:** Critical, thorough; no slack. Every unwired, broken, or inconsistent item documented with **what is wrong** and **why it matters**.  
**Context:** This audit reflects the codebase **after** the remediation plan (CONFIG-001, ROUTER-MONITORING-001, shell validators, docs). Items previously marked critical may now be fixed; remaining gaps are called out explicitly.

---

## Executive Summary

The memory system and core routing are **largely wired and working** after remediation. Config-based model selection is **now applied** via spawn-prompt-assembler (model injected into prompt; config-model-validator blocks mismatch by default). Agent-context-tracker and post-spawn-task-updater are **registered** on PostToolUse(Task). Variable-quoting, shellcheck, and command-allowlist validators are **registered** on PreToolUse(Bash). planning-progress-tracker is **documented** in MEMORY_SYSTEM.md. saveSession is **not exported** from memory-manager.

**Remaining gaps:** (1) **router-enforcer.cjs** is still not registered; enforcement is correctly documented as routing-guard + routing-table only. (2) Several routing/task hooks exist in repo but are **not wired**: router-mode-reset, agent-context-pre-tracker, task-completion-guard, task-auto-route (and task-update-tracker logic is consolidated into unified-reflection-handler). (3) **SessionEnd-dependent behavior** (reflection queue drain, weekly maintenance, STM consolidation) remains a structural risk in headless or rarely-closed-session environments; documented and mitigated by env/cron/worker. (4) **Documentation error:** HOOKS_REFERENCE.md states documentation-routing-guard.cjs is "not registered" but it **is** registered under PreToolUse(Task). (5) **Embeddings doc vs code:** MEMORY_SYSTEM.md says auto-embeddings run for `learnings.md`; sync-memory-index.cjs only includes decisions.md, issues.md, patterns.json, gotchas.json in EMBEDDING_MEMORY_FILES—learnings.md is **excluded** in code.

**Overall assessment:** ~90% of the intended design is wired and working. The remaining 10% is optional/unwired hooks (router-enforcer, router-mode-reset, agent-context-pre-tracker, task-completion-guard, task-auto-route), SessionEnd design limitation, one doc/code mismatch (embeddings + learnings.md), and one doc inaccuracy (documentation-routing-guard).

---

## 1. Memory System Audit

### 1.1 Hook Wiring (Memory)

**What was checked:** `.claude/settings.json` vs MEMORY_SYSTEM.md “Hook Wiring” and actual hook files.

| Hook | Documented | settings.json | Status |
|------|------------|---------------|--------|
| user-prompt-unified.cjs (UserPromptSubmit) | ✓ | ✓ | **Wired** |
| memory-health-check.cjs (UserPromptSubmit) | ✓ | ✓ | **Wired** |
| format-memory.cjs (PostToolUse Edit\|Write\|NotebookEdit) | ✓ | ✓ | **Wired** |
| sync-memory-index.cjs (PostToolUse Edit\|Write\|NotebookEdit, MemoryRecord) | ✓ | ✓ | **Wired** |
| planning-progress-tracker.cjs (PostToolUse Edit\|Write\|NotebookEdit) | ✓ | ✓ | **Wired**; doc now lists it |
| unified-reflection-handler.cjs (SessionEnd, PostToolUse Task\|TaskUpdate\|Bash) | ✓ | ✓ | **Wired** |
| reflection-queue-processor.cjs (SessionEnd) | ✓ | ✓ | **Wired** |
| reflection-step0-guard.cjs (PreToolUse TaskList) | ✓ | ✓ | **Wired** |

**Conclusion:** All memory-related hooks that are registered in settings.json are documented in MEMORY_SYSTEM.md. No memory hook documented as “runs when X” is missing from settings.json.

---

### 1.2 STM / MTM / LTM Write and Read Paths

**STM write:**  
- **UserPromptSubmit:** `user-prompt-unified.cjs` calls `memoryTiers.writeSTMEntry(...)` when `memoryTiers?.writeSTMEntry` is available (lines ~1202–1224). STM is written on every user prompt.  
- **SessionEnd / PostToolUse:** `unified-reflection-handler.cjs` calls `memoryTiers.writeSTMEntry(sessionData, PROJECT_ROOT)` (line 742) and `memoryTiers.consolidateSession(...)` (line 745).  
- **What is wrong:** Nothing. Paths are correct.

**STM clear / consolidation:**  
- On SessionEnd, `unified-reflection-handler.cjs` runs consolidation (STM → MTM, then MTM → LTM).  
- **What is wrong:** If **SessionEnd never fires** (e.g. headless, or host never emitting SessionEnd), consolidation never runs. STM stays as `session_current.json`; MTM/LTM updates and cold archival depend on SessionEnd or on the **UserPromptSubmit fallback** for weekly maintenance only.  
- **Why it matters:** In headless or long-lived sessions, STM can grow without being consolidated; reflection queue does not drain. Documented; mitigation is REFLECTION_QUEUE_PROCESS_ON_PROMPT=on and cron/worker for weekly. **Design limitation**, not a wiring bug.

**LTM retention / cold storage:**  
- Weekly maintenance runs from `memory-scheduler.cjs` when SessionEnd fires or when UserPromptSubmit detects overdue weekly (maintenance-status.json).  
- **What is wrong:** In headless or rarely-closed-session environments without cron or worker, weekly can be delayed indefinitely; LTM can grow and cold archival may not run.  
- **Why it matters:** Documented; mitigation is manual/cron `pnpm run memory:weekly` or worker. No code bug; design limitation.

**Conclusion:** STM/MTM/LTM write/read paths are correct. The only “won’t work as expected” case is environments where SessionEnd never fires and no fallback (prompt-based or cron) is used.

---

### 1.3 Entity Index (SQLite)

**Population:**  
- `sync-memory-index.cjs` (PostToolUse Edit|Write|NotebookEdit and MemoryRecord) syncs:  
  - **Markdown:** `decisions.md`, `issues.md` only (CORE_MEMORY_MARKDOWN_FILES).  
  - **JSON:** `patterns.json`, `gotchas.json`.  
- **learnings.md** is **not** in CORE_MEMORY_MARKDOWN_FILES and is **not** synced to the entity index. MEMORY_SYSTEM.md states: “learnings.md is legacy and not synced to the entity index; only decisions, issues, patterns, gotchas are indexed.”

**What is wrong:**  
- Any content that exists only in `learnings.md` is not in the entity index and not queryable via `findEntities` / `getRelated` or the spawn-prompt entity graph.  
- **Why it matters:** Only decisions, issues, patterns, gotchas are in SQLite. Intentional; must remain clear in docs and prompts.

**Read path:**  
- `ContextualMemory` uses SQLite for `findEntities` and `getRelated`.  
- `memory-manager.cjs` `loadMemoryForContext` / `loadMemoryForContextAsync` delegate to `ContextualMemory.loadContextSync` / `loadContext`.  
- **Single read path:** Confirmed; no split-brain.

**Schema init:**  
- sync-memory-index and ContextualMemory/entity-extractor can create schema if missing (or rely on `pnpm run memory:init`). No bug.

**Conclusion:** Entity index is wired and consistent. learnings.md is out of scope by design.

---

### 1.4 ContextualMemory and Spawn Prompt / Config Model

**Entity graph:**  
- `spawn-prompt-assembler.cjs` uses `ContextualMemory` when `SPAWN_PROMPT_ENTITY_GRAPH !== 'off'` to build an “Entity Graph (SQLite)” section. **Wired and working.**

**Config model (CONFIG-001 – remediated):**  
- **spawn-prompt-assembler.cjs** calls `appendConfigModelSection(assembled, agentType)`, which uses `resolveAgentModel(agentType, PROJECT_ROOT)` from agent-config-reader.cjs and appends a “### Model (from config)” section to the assembled prompt when `SPAWN_PROMPT_INJECT_CONFIG_MODEL !== 'off'`. So the **configured model is now injected into the spawn prompt**; the Router is instructed to pass it into Task().  
- **config-model-validator.cjs** is PreToolUse(Task), defaults to **block** (`getEnforcementMode('CONFIG_MODEL_VALIDATOR', 'block')`), and blocks spawn when the Task’s model does not match config.  
- **What is wrong:** Nothing. Config is validated and applied via prompt injection; validator enforces by default.

**Conclusion:** ContextualMemory, entity graph, and config model application are wired and work.

---

### 1.5 Reflection Queue and Step 0

**Reflection queue processor:**  
- Runs on **SessionEnd** (settings.json: SessionEnd → reflection-queue-processor.cjs).  
- **user-prompt-unified.cjs** can run the reflection-queue-processor on UserPromptSubmit when `REFLECTION_QUEUE_PROCESS_ON_PROMPT=on` (with interval guard).  
- **What is wrong:** If SessionEnd never fires and REFLECTION_QUEUE_PROCESS_ON_PROMPT is not set, the queue never drains. Documented; design limitation.

**Step 0 guard:**  
- `reflection-step0-guard.cjs` is registered for PreToolUse(TaskList). Blocks (or warns) when pending reflections exist. **Wired and working.**

**Conclusion:** Reflection is wired correctly; queue drain depends on SessionEnd or opt-in prompt-based processing.

---

### 1.6 Embeddings (Auto-Index) – Doc/Code Mismatch

**MEMORY_SYSTEM.md (line 121):**  
- “The PostToolUse memory index hook will invoke the embedding generator for **learnings.md**, decisions.md, issues.md, patterns.json, and gotchas.json …”

**sync-memory-index.cjs (EMBEDDING_MEMORY_FILES):**  
- Only: `decisions.md`, `issues.md`, `patterns.json`, `gotchas.json`.  
- **learnings.md is NOT in EMBEDDING_MEMORY_FILES.**

**What is wrong:**  
- Documentation claims learnings.md receives auto-embeddings on edit when `MEMORY_EMBED_ON_EDIT=on`. The code **never** invokes the embedding generator for learnings.md in this hook; `maybeGenerateEmbeddingsForFile` only runs for files in EMBEDDING_MEMORY_FILES.  
- **Why it matters:** Operators who enable MEMORY_EMBED_ON_EDIT and expect learnings.md to be embedded will find it is not. Semantic search over learnings content will not be updated on edit. Either add learnings.md to EMBEDDING_MEMORY_FILES (if desired) or correct the doc to say “decisions.md, issues.md, patterns.json, gotchas.json” only.

**Conclusion:** Doc/code mismatch; **medium** (documentation accuracy and behavioral expectation).

---

### 1.7 Legacy / Deprecated

- **saveSession():** Grep of `.claude/lib/memory` shows **no** `saveSession` definition or export in memory-manager.cjs. **Not exported;** previous audit’s “still exported” is **no longer accurate** (remediated or never present in current tree).  
- **session-end-recorder.cjs, SyncLayer, BackgroundSyncWorker:** Archived; not in settings. Documented.  
- **Legacy sessions/:** loadMemoryForContext falls back to `.claude/context/memory/sessions/` if MTM is empty. Legacy path still a fallback; not removed.

**Conclusion:** No remaining saveSession export issue. Other deprecated pieces are documented and not wired.

---

## 2. Core Fundamentals Audit

### 2.1 Routing Hooks

**user-prompt-unified.cjs:**  
- UserPromptSubmit. Memory reminder, STM write, token/compression, maintenance fallback, optional reflection-queue-processor run when REFLECTION_QUEUE_PROCESS_ON_PROMPT=on. **Wired and working.**

**routing-guard.cjs:**  
- PreToolUse(Task|TaskCreate|Edit|Write|NotebookEdit|Glob|Grep|WebSearch). Uses routing-table.cjs. **Wired and working.**

**router-enforcer.cjs:**  
- **Not in settings.json.** ROUTER_ENFORCEMENT.md and HOOKS_REFERENCE.md state that router-enforcer is not registered and enforcement is via routing-guard and routing-table.  
- **What is wrong:** router-enforcer.cjs is **never invoked**. Any “router enforcer” behavior that might have been intended as a standalone hook does not run.  
- **Why it matters:** Design clarity; routing still works via routing-guard and routing-table. **Documented as not registered;** severity **low** (optional/advisory hook).

---

### 2.2 Task / Spawn Flow – Current Wiring

**PreToolUse(Task)** in settings.json (order):  
1. config-model-validator.cjs  
2. spawn-prompt-assembler.cjs  
3. spawn-prompt-validator.cjs  
4. pre-spawn-tool-validator.cjs  
5. tool-availability-validator.cjs  
6. documentation-routing-guard.cjs  
7. pre-task-unified.cjs  

**PostToolUse(Task)** in settings.json (order):  
1. agent-context-tracker.cjs  
2. auto-rerouter.cjs  
3. agent-health-hook.cjs  
4. post-spawn-task-updater.cjs  
5. post-task-unified.cjs  

**agent-context-tracker.cjs** and **post-spawn-task-updater.cjs** are **wired** (PostToolUse Task). ROUTER-MONITORING-001 is **remediated**.

**documentation-routing-guard.cjs:**  
- **Is registered** under PreToolUse(Task) in settings.json.  
- HOOKS_REFERENCE.md incorrectly states “not registered; logic in pre-task-unified.cjs (CHECK 3)”. **What is wrong:** Doc says it is not registered; it **is** registered. **Why it matters:** Developers may believe the guard does not run; it does. **Recommendation:** Update HOOKS_REFERENCE.md to remove the “not registered” note for documentation-routing-guard.cjs.

---

### 2.3 Unwired Routing/Task Hooks (Present in Repo)

The following files exist under `.claude/hooks/routing/` but are **not** in settings.json:

| Component | Purpose (inferred) | Impact |
|-----------|--------------------|--------|
| **router-mode-reset.cjs** | Reset router mode state | No automatic reset by this hook; behavior may live elsewhere or be manual. |
| **agent-context-pre-tracker.cjs** | Pre-Task context tracking (distinct from agent-context-tracker) | If intended to run before Task(), it never does. |
| **task-completion-guard.cjs** | Guard task completion | Not in hook chain; task completion flow does not include this hook. |
| **task-auto-route.cjs** | Auto-routing for tasks | Not in hook chain. |
| **task-update-tracker.cjs** | Track TaskUpdate | Comment in unified-reflection-handler.cjs says “consolidated from task-update-tracker.cjs”; logic lives in unified-reflection-handler. Standalone file may be legacy. |

**What is wrong:** These hooks are never run. If they were intended as part of the design, the system does not use them.  
**Why it matters:** Low to medium depending on whether they are obsolete (e.g. consolidated) or intentionally optional. **Recommendation:** Either wire them where design requires, or document them as “present but not wired (legacy/optional)” and remove or archive if dead.

---

### 2.4 Shell Safety Validators

**PreToolUse(Bash)** in settings.json includes:  
- context-mode-tool-guard, windows-null-sanitizer, bash-cwd-validator, shell-injection-validator, **variable-quoting-validator**, **shellcheck-validator**, **command-allowlist-validator**, routing-guard, bash-command-validator.

**Conclusion:** Variable-quoting, shellcheck, and command-allowlist are **wired**. Shell safety Phase 2/3 is active. No unwired shell validator finding.

---

### 2.5 Event Bus and Monitoring

- PostToolUse (matcher "") runs metrics-collector-hook, error-tracker-hook, anomaly-detector. **Wired.**  
- execution-limit-monitor-hook is PreToolUse (matcher ""). **Wired.**  
- No additional unwired or broken findings in this pass.

---

## 3. Documentation vs Reality

### 3.1 HOOKS_REFERENCE.md

- **router-enforcer.cjs:** Correctly noted as “Not registered in settings.json; routing uses routing-guard and routing-table only.”  
- **agent-context-tracker.cjs:** Correctly noted as “PostToolUse(Task); sets router state to agent mode, marks PLANNER/SECURITY spawns.” It **is** registered.  
- **documentation-routing-guard.cjs:** **Incorrect.** Doc says “not registered; logic in pre-task-unified.cjs (CHECK 3)”. In fact it **is** registered under PreToolUse(Task). **Fix:** Remove or correct the “not registered” note for documentation-routing-guard.cjs.

### 3.2 MEMORY_SYSTEM.md

- Hook wiring lists planning-progress-tracker. SessionEnd and headless caveats are present. Config model sentence (validator block by default; spawn prompt augmented) is present.  
- **Embeddings:** Doc says learnings.md is included in auto-embed list; code does not include it. See §1.6.

### 3.3 ROUTER_ENFORCEMENT.md

- States router-enforcer is not registered; enforcement is via routing-guard and routing-table. **Accurate.**

---

## 4. Explicit Lists

### 4.1 Unwired Components (Present in Repo, Not in settings.json)

| Component | Purpose | Impact |
|-----------|---------|--------|
| **router-enforcer.cjs** | Advisory prompt analysis / routing | No standalone “router enforcer” hook runs; routing uses routing-guard + routing-table. Documented. |
| **router-mode-reset.cjs** | Reset router mode | Not in hook chain. |
| **agent-context-pre-tracker.cjs** | Pre-Task context tracking | Not in hook chain. |
| **task-completion-guard.cjs** | Task completion guard | Not in hook chain. |
| **task-auto-route.cjs** | Task auto-routing | Not in hook chain. |
| **task-update-tracker.cjs** | TaskUpdate tracking | Logic consolidated into unified-reflection-handler; standalone file likely legacy. |

### 4.2 Won’t Work / Broken (Without Change)

| Item | What is wrong | Why it matters |
|------|----------------|----------------|
| **Reflection queue drain** | Processor runs only on SessionEnd unless REFLECTION_QUEUE_PROCESS_ON_PROMPT=on. | In environments where SessionEnd never fires, queue never drains. Documented; design limitation. |
| **Weekly maintenance / cold archival** | Runs on SessionEnd or UserPromptSubmit fallback when weekly overdue. | In headless/rare-prompt environments without cron or worker, LTM can grow and cold archival may not run. Documented. |
| **Auto-embeddings for learnings.md** | MEMORY_SYSTEM claims learnings.md is included; EMBEDDING_MEMORY_FILES does not include it. | learnings.md is not auto-embedded on edit when MEMORY_EMBED_ON_EDIT=on. Doc/code mismatch. |

### 4.3 Documentation Gaps / Errors

- **HOOKS_REFERENCE.md:** documentation-routing-guard.cjs is stated as “not registered”; it **is** registered. Correct the note.
- **MEMORY_SYSTEM.md (Embeddings):** Either add learnings.md to EMBEDDING_MEMORY_FILES in sync-memory-index.cjs or change the doc to list only “decisions.md, issues.md, patterns.json, gotchas.json”.

---

## 5. Severity Summary and Recommendations

### High

1. **Embeddings doc/code mismatch:** MEMORY_SYSTEM says auto-embeddings run for learnings.md; code does not. **Recommendation:** Align doc with code (remove learnings.md from the list) or add learnings.md to EMBEDDING_MEMORY_FILES if product intent is to embed it.

### Medium

2. **HOOKS_REFERENCE.md – documentation-routing-guard:** Doc says “not registered”; it is registered. **Recommendation:** Update HOOKS_REFERENCE to state that documentation-routing-guard.cjs runs on PreToolUse(Task) (or remove the “not registered” note).

3. **Unwired routing/task hooks:** router-mode-reset, agent-context-pre-tracker, task-completion-guard, task-auto-route (and task-update-tracker if still considered standalone). **Recommendation:** Document as “present but not wired (optional/legacy)” or wire if design requires; archive or remove if dead.

### Low

4. **router-enforcer.cjs** not wired. Already documented; enforcement is via routing-guard and routing-table. No change required unless product wants this hook active.

5. **SessionEnd-dependent behavior.** Documented and mitigated by REFLECTION_QUEUE_PROCESS_ON_PROMPT and cron/worker. Design limitation; no code change required.

---

## 6. Conclusion

The memory system’s **write/read paths, entity index, ContextualMemory, spawn-prompt entity graph, and config model application** are wired and work. **Config model** is injected by spawn-prompt-assembler and enforced by config-model-validator (block by default). **Router monitoring** (agent-context-tracker, post-spawn-task-updater) is wired on PostToolUse(Task). **Shell validators** (variable-quoting, shellcheck, command-allowlist) are wired on PreToolUse(Bash). **saveSession** is not exported.

**Remaining issues:** (1) **Doc/code mismatch:** Auto-embeddings doc includes learnings.md; code does not. (2) **Doc error:** HOOKS_REFERENCE claims documentation-routing-guard is not registered; it is. (3) **Unwired hooks:** router-enforcer, router-mode-reset, agent-context-pre-tracker, task-completion-guard, task-auto-route (and possibly task-update-tracker as standalone). (4) **SessionEnd-dependent behavior** for reflection queue and weekly maintenance remains a design limitation with documented mitigations.

This audit should be used to: (1) Fix the embeddings and HOOKS_REFERENCE documentation; (2) Decide whether the unwired routing/task hooks are legacy or should be wired; (3) Keep SessionEnd caveats visible for headless/rare-session deployments.
