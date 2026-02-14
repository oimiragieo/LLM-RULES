# UI vs Reflection Review — Task Handling and Improvement Ideas

**Context:** Review of how the current codebase (and Claude Code host UI) present task/pipeline handling compared to reflection, using the 9-wave enterprise pipeline run as reference. Goal: align visibility, reduce noise, and make reflection a first-class phase.

---

## 1. How the Current "UI" Presents Task Handling

The "UI" here is the **Router’s conversational output** plus **host tool/task events** (Read, Task completed, Background command, etc.) — not a separate app in agent-studio.

### 1.1 What the user sees

- **Session start:** `Read reflection-spawn-request.json (1 lines)`, `Read reflection-reminder.txt (2 lines)` — no explicit "Step 0" label or outcome.
- **Background completions:** `Task "PM sprint backlog audit" completed in background` (and similar) — no wave label.
- **Pipeline status:** Prose like "Wave 3 IN PROGRESS", "Waves 4–9 PENDING" and wave summaries (e.g. "Planner: 93+ tests planned…").
- **Agent completions:** `developer(…) Done (14 tool uses · 153.2k tokens · 2m 52s)` and sometimes "Reports weren't written".
- **Wave 9:** `reflection-agent (Reflection agent captures learnings)` + `developer (Git commit)` — reflection is one line among others.
- **Final summary:** ASCII table (Wave 1–9, agents, status), P0/P1 list, "Reports Generated", "Remaining Work", "Deployment Verdict".
- **Late notifications:** Many "Agent X completed" messages after the pipeline is done, each with a paragraph explaining "late-arriving… No further action needed."
- **Background commands:** Multiple "Background command X completed/failed" with per-command explanations (format, test suite, find failing tests, etc.).
- **Cleanup:** A separate `Task(Clean up reflection reminder file)` (Haiku, 3 tool uses) at the end.

### 1.2 What the codebase does (no UI code)

- **user-prompt-unified.cjs:** When `reflection-spawn-request.json` exists and has requests, writes `reflection-reminder.txt` with: *"You have N pending reflection spawn request(s). Read … spawn reflection-agent for each … Then delete this file and clear/trim the spawn request file."*
- **CLAUDE.md:** Router must do Step 0 before TaskList: read reminder, read spawn-request, spawn reflection-agent, delete reminder, clear/trim spawn request.
- **reflection-step0-guard.cjs:** PreToolUse(TaskList) can block with a message that says "STEP 0 REQUIRED: (1) Read … (2) Spawn … (3) Clear/trim … (4) Clear reminder … THEN TaskList()."
- **Enterprise workflow:** Phase 6 = REFLECT, Gate 6 = "Learnings recorded"; pipeline implementation uses "Wave 9: Reflection + Developer (commit)".
- **Reflection agent:** Writes a structured report (e.g. `.claude/context/reports/reflections/pipeline-reflection-YYYY-MM-DD.md`) with RECE/RBT, learnings, integration health.

So: the codebase defines **when** reflection runs (Step 0 at start, Wave 9 in pipeline) and **what** reflection produces (report path), but the **narrative and grouping** the user sees are entirely from the Router’s prose and host event display. There is no dashboard or dedicated "reflection" widget in the repo; improvements are about **messages, Router instructions, and optional dashboard data** so the host can show a clearer story.

---

## 2. Comparison: Task Handling vs Reflection

| Aspect | Task / pipeline | Reflection |
|--------|----------------|------------|
| **Visibility at start** | TaskList() and "Pipeline Status" with wave table. | Only "Read reflection-spawn-request.json" and "Read reflection-reminder.txt" — no "Step 0: N pending reflections; spawning…" or "Step 0 complete." |
| **Phase label** | Waves 1–9 with names (PM, Architect, Developer, QA, etc.). | Reflection appears as one agent in Wave 9 ("Reflection + Developer (commit)") with no dedicated "Reflection phase" line. |
| **Outcome** | Wave summary (e.g. "Planner: 93+ tests…") and final table. | "Reflection agent captures learnings" → "Done (8 tool uses · 112.3k tokens)" — no report path or one-line summary in the main flow. |
| **Report** | Reports list at end (pm-sprint-backlog, architecture-design, etc.). | `pipeline-reflection-2026-02-13.md` is in the list but not called out as "Reflection learnings" or summarized. |
| **Cleanup** | No separate task for pipeline state. | Separate Task "Clean up reflection reminder file" suggests reminder wasn’t cleared in Step 0 (or was re-created), and adds an extra step the user sees. |
| **Noise** | Late "Task X completed in background" and "Agent X completed" messages. | Same channel; reflection isn’t noisier, but late notifications apply to all agents. |
| **Blocking** | Guard blocks TaskList when pending reflections exist. | User only sees the block message from the guard; no prior "You have N pending reflections" banner. |

**Summary:** Task handling is presented as a clear, wave-based pipeline with a final table and reports list. Reflection is under-presented: Step 0 has no explicit start/complete line, Wave 9 reflection has no one-line outcome (report path + summary), and reminder cleanup is a separate task. Late agent/background notifications affect both; batching them would help the whole UI.

---

## 3. Improvement Ideas

### 3.1 Reflection visibility (codebase + Router instructions)

- **Step 0 banner (Router):** When the Router reads `reflection-reminder.txt` and/or finds pending requests, its **first** visible statement should be explicit, e.g.  
  *"Step 0: N pending reflection(s) from previous session. Spawning reflection-agent for each (or first batch)."*  
  After spawning and clearing:  
  *"Step 0 complete. Reminder cleared; spawn request trimmed. Proceeding to TaskList()."*  
  **Where:** Document in CLAUDE.md or a Router rule that the first response must include these two lines when Step 0 runs.
- **Reflection outcome in pipeline:** When reflection-agent finishes (e.g. in Wave 9), the Router should add one line, e.g.  
  *"Reflection report: `.claude/context/reports/reflections/pipeline-reflection-YYYY-MM-DD.md` — learnings recorded (patterns/gotchas/decisions)."*  
  **Where:** Orchestrator / enterprise workflow instructions or a Router rule for "after reflection-agent completes."
- **Final summary:** In the "Reports Generated" section, always list the reflection report with a short label, e.g.  
  *"Reflection learnings: `.claude/context/reports/reflections/pipeline-reflection-YYYY-MM-DD.md`"*  
  and optionally one sentence (e.g. "3 patterns, 2 gotchas, 1 decision") if the Router can read the report or the agent returns a one-line summary.

### 3.2 Reminder cleanup (codebase)

- **Single place for clearing reminder:** Step 0 in CLAUDE.md already says "delete the reminder file and clear/trim the spawn request file." If the Router does that immediately after spawning reflection-agent, the reminder should not persist. Then a separate "Clean up reflection reminder file" task should not be needed.
- **If cleanup is intentional:** If the design is to clear the reminder only after the full pipeline (e.g. so the reminder persists until "session end"), document that in MEMORY_SYSTEM.md or reflection docs and have the Router say once: *"Reflection reminder will be cleared after pipeline (by design)."* so the user understands why a cleanup task exists.
- **Recommendation:** Prefer clearing in Step 0 so the user does not see an extra cleanup task. If the pipeline writes a new reminder for the *next* session (e.g. on SessionEnd), that can be documented separately.

### 3.3 Guard message (codebase)

- **reflection-step0-guard.cjs** already returns a clear block message. Optionally add a short, user-facing line at the top, e.g.  
  *"You have N pending reflection(s). Process them (Step 0) before continuing."*  
  so the first thing the user sees is context, then the existing "(1) Read … (2) Spawn …" steps.
- **Reminder text (user-prompt-unified.cjs):** The reminder already says "You have N pending reflection spawn request(s)…" — good. No change required unless we want to add "Step 0" explicitly: *"Step 0: You have N pending…"*.

### 3.4 Late-arriving and background noise (Router instructions)

- **Late agent completions:** After the pipeline is complete, instead of one paragraph per "Agent X completed," the Router could batch:  
  *"All pipeline notifications received (PM, Researcher, Architect, Security, Context-Compressor, Planner, etc.). All already incorporated. Pipeline complete."*  
  **Where:** Router rule or orchestrator instructions: "When pipeline is complete and late Task/agent completions arrive, acknowledge in a single batched message, not per-agent."
- **Background commands:** Similarly, batch at the end:  
  *"Background commands: format (ok), test suite (exit 1 — 13 known P0-002 failures), test summary (ok), test output (ok). No new failures from this run."*  
  **Where:** Router/QA wave instructions so the final summary doesn’t repeat the same explanation for each background command.

### 3.5 Reflection as first-class phase (workflow / Router)

- **Wave table:** Keep "Wave 9: Reflection + Developer (commit)" but optionally split for clarity:  
  *"9a – Reflection (learnings recorded)"* and *"9b – Developer (commit)."*  
  So "Reflect" is explicitly its own row in the narrative.
- **Phase 6 REFLECT:** The enterprise workflow already has Phase 6 REFLECT and Gate 6. Ensure any Router summary that mentions "phases" or "gates" includes "Phase 6: Reflect — Gate 6: Learnings recorded" so reflection is not omitted in high-level descriptions.

### 3.6 Reports and missing outputs (agents + Router)

- **"Reports weren't written":** When the Router says "Reports weren't written (agents likely hit context limits)," add a single follow-up line, e.g.  
  *"Missing reports: Wave X (agent Y), Wave Z (agent W). Consider re-running or smaller context."*  
  So the user knows which wave/agent to re-run or debug.
- **Reflection agent:** Ensure reflection-agent always writes to the standard path (e.g. `reports/reflections/pipeline-reflection-YYYY-MM-DD.md`) and, if possible, returns a one-line summary (e.g. in task output or a small JSON sidecar) so the Router can surface it without reading the full report.

### 3.7 Optional: Dashboard / pendingReflectionRequests

- CLAUDE.md says "Check dashboard for `pendingReflectionRequests`." If the host has a dashboard, ensure it shows:
  - Count of pending reflection requests (from `reflection-spawn-request.json`).
  - After Step 0: "0 pending" and last reflection report path.
- If there is no dashboard yet, this can be a single file or endpoint the host reads (e.g. `.claude/context/runtime/reflection-step0-state.json` or a new `reflection-dashboard.json` with `pendingCount` and `lastReportPath`). The reflection-step0-guard and queue processor could write this so the UI can show "N pending reflections" without the Router having to say it every time.

---

## 4. Priority and Implementation

| Priority | Improvement | Owner | Effort |
|----------|-------------|--------|--------|
| P0 | Step 0 explicit banner + "Step 0 complete" (Router rule / CLAUDE.md) | Router instructions | Low |
| P0 | Reflection report path + one-line summary after reflection-agent (Wave 9) | Orchestrator / Router rule | Low |
| P0 | List reflection report in final summary with "Reflection learnings" label | Router / workflow instructions | Low |
| P1 | Single reminder cleanup in Step 0; remove or document separate cleanup task | Codebase (Step 0 flow + docs) | Low |
| P1 | Batch late agent completions and background command messages | Router / orchestrator instructions | Low |
| P2 | Optional split Wave 9a/9b and Phase 6 mention in summaries | Workflow / Router | Low |
| P2 | "Missing reports" one-liner when reports weren’t written | Router rule | Low |
| P3 | reflection-agent one-line summary (task output or sidecar) | reflection-agent + schema | Medium |
| P3 | Dashboard or `reflection-dashboard.json` for pending count + last report | Hooks + host | Medium |

---

## 5. Relation to Reflection + Evolution Skills Plan

- The **reflection + evolution skills** plan (framework-context, recommend-evolution) improves **what** reflection knows (memory, agents, workflows, when to recommend evolution). This UI review improves **how** reflection (and the pipeline) are **presented** to the user and how **noise** is reduced.
- Both are complementary: better context → better reflection content; better presentation → clearer understanding of when reflection ran and what it produced. Implementing the UI improvements above does not depend on the new skills; the new skills do not depend on the UI changes.

---

**Document version:** 1.0  
**Based on:** 9-wave enterprise pipeline log (reflection at start + Wave 9, late notifications, background commands, cleanup task).  
**Next:** Add Router rules or CLAUDE.md bullets for Step 0 banner and reflection outcome; optionally add a rule file under `.claude/rules/` for "Pipeline and reflection UX."
