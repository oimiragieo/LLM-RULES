# Optional Tasks Outline

Concrete steps for the remaining optional/doc/maintenance items. None are required for current scope.

---

## 1. Optional doc polish: CLAUDE.md registry-first + CI note

**Goal:** One-line redundancy so Router instructions mention agent discovery and CI gate (GETTING_STARTED already has it).

**File:** `.claude/CLAUDE.md`

**Where:** In or near the Router Protocol (e.g. after step 4 “Check: scan `.claude/agents/`” or in a short “Agent discovery” bullet). Current line 35 says “Check: scan `.claude/agents/` for best agent match.”

**Change:**
- Add one line after that step (or in a small subsection):  
  **Agent discovery:** Registry-first (`agent-registry.json`); filesystem fallback if registry missing. CI enforces registry freshness on PRs (see GETTING_STARTED).

**Constraints:** One sentence or two short sentences; no restructuring. Link to GETTING_STARTED for detail.

---

## 2. Optional observability: “Observability” section in GETTING_STARTED

**Goal:** One place that points to worker heartbeat, worker.jsonl, event bus, and how to inspect them.

**File:** `.claude/docs/GETTING_STARTED.md`

**Where:** New subsection, e.g. after “Worker Runtime (Optional)” or before “Environment Configuration.” Title: **Observability** (or **Monitoring & observability**).

**Content (short):**
- **Worker:** Heartbeat at `.claude/context/runtime/worker-heartbeat.json` (`lastTick`, `status`, tasks). Metrics: `.claude/context/metrics/worker.jsonl` (one JSONL line per tick). Summary CLI: `pnpm worker:summary`.
- **Event bus:** Blocking hooks emit `TOOL_BLOCKED` / `TOOL_FAILED` before exit; worker emits `TOOL_COMPLETED` / `TOOL_FAILED` per tick. Subscribe via `.claude/lib/events/event-bus.cjs` and `EventTypes` for dashboards or logging.

**Constraints:** 1 short paragraph or 2 bullet blocks. Reuse existing paths/names; no new behavior.

---

## 3. Optional: Warning banner in archived session-end-recorder.cjs

**Goal:** Extra guardrail so anyone opening or running the archived hook sees that `saveSession()` throws.

**File:** `.claude/archive/hooks/memory/session-end-recorder.cjs`

**Current state:** The file already has in the top JSDoc:  
`NOTE: memory-manager.saveSession() is now deprecated and throws; do not run this hook in production.`

**Optional “banner” addition:**
- Add a one-line runtime warning at the top of the script (after `'use strict';`), e.g.  
  `console.warn('[session-end-recorder.cjs] DEPRECATED: saveSession() throws; do not run in production. Use unified-reflection-handler.cjs.');`  
  so that if someone runs the file directly, they see the warning immediately.

**Constraints:** Single line; no change to hook logic. Skip if you consider the JSDoc sufficient.

---

## 4. Optional: Cold-storage search example (CLI snippet) in MEMORY_SYSTEM

**Goal:** Operators can copy-paste a minimal example for querying cold tier.

**File:** `.claude/docs/MEMORY_SYSTEM.md`

**Where:** In the existing “Search behavior (hot vs cold)” subsection, after the line that describes `searchColdStorage()` (around line 225). Current text:  
“Cold-tier helper: `searchColdStorage()` (in `.claude/lib/memory/cold-storage.cjs`) performs a best-effort LanceDB search with `metadata.tier = 'cold'` filter and returns `[]` when unavailable.”

**Addition:** Add a small “Example” or “Usage” line(s), e.g.:

```bash
# From project root (Node)
node -e "
const { searchColdStorage } = require('./.claude/lib/memory/cold-storage.cjs');
searchColdStorage('your query', { limit: 5 }).then(rows => console.log(rows));
"
```

Or a one-liner that runs a small script under `.claude/tools/` if you prefer not to inline `node -e` in the doc.

**Constraints:** Best-effort, no guarantees in doc that LanceDB is always available; keep the snippet short (3–5 lines).

---

## 5. Maintenance: Run test:framework or full suite for release gate

**Goal:** Gate releases on a known-good test run.

**What to run:**
- **Option A:** `pnpm test:framework` (if it includes hooks, worker, and critical paths).
- **Option B:** Full suite, e.g. `pnpm test` (or whatever runs all tests in the repo).

**When:** Before tagging or releasing a version; optionally in CI on main or release branches.

**No code changes:** This is a process step. Optionally document in CONTRIBUTING.md or a “Release checklist” section (e.g. “Run `pnpm test` and `pnpm lint` before release”).

---

## Summary

| # | Task                         | File(s)                          | Effort  |
|---|-----------------------------|----------------------------------|---------|
| 1 | CLAUDE.md registry + CI     | `.claude/CLAUDE.md`              | 1 line  |
| 2 | Observability section       | `.claude/docs/GETTING_STARTED.md`| 1 block |
| 3 | session-end-recorder banner | `.claude/archive/.../session-end-recorder.cjs` | 1 line (optional; JSDoc already present) |
| 4 | Cold-storage CLI example    | `.claude/docs/MEMORY_SYSTEM.md`  | 3–5 lines |
| 5 | Release gate (test run)     | Process / checklist               | No code |
