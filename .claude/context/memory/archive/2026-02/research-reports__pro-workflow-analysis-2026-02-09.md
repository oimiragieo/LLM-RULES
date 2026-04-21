<!-- Agent: researcher | Task: #79 | Session: 2026-02-09 -->

# Pro-Workflow Codebase Analysis Report

**Date:** 2026-02-09
**Researcher:** researcher agent (research-synthesis skill)
**Target:** pro-workflow v1.2.0 by Rohit Ghumare
**Source:** .claude.archive/.tmp/pro-workflow-main

---

## 1. Executive Summary

Pro-workflow is a Claude Code plugin/skill focused on **individual developer productivity** through self-correcting memory, session management, and quality gates. It has approximately 45 files total, 3 agents, 1 skill, 10 commands, 8 hook events, and a SQLite-backed persistent learning database with FTS5 full-text search.

**Our system (agent-studio)** is an **enterprise multi-agent orchestrator** with 49+ agents, 30+ skills, 20+ workflows, 50+ hooks, and a complex routing/enforcement system.

**Key finding:** Pro-workflow and agent-studio solve fundamentally different problems. Pro-workflow is a lightweight individual developer tool; agent-studio is a multi-agent enterprise framework. However, pro-workflow has **5 genuinely novel features** we lack entirely and **3 areas** where their simpler approach reveals gaps in ours.

## **Bottom line:** We should adopt 5 specific features from pro-workflow without replacing any existing capabilities. These are additive improvements, not replacements.

## 2. Directory Structure Comparison

### Pro-workflow (45 files)

- .claude-plugin/ - Plugin manifest (3 files)
- agents/ - 3 agents (planner, reviewer, scout)
- commands/ - 10 commands
- contexts/ - 3 mode contexts (dev, review, research)
- hooks/ - 1 hooks.json (8 hook events)
- scripts/ - 7 hook scripts (500 LOC total)
- skills/ - 1 skill (pro-workflow)
- src/ - TypeScript source (SQLite + FTS5)
- templates/ - Split CLAUDE.md templates
- rules/ - 1 core rules file
- references/ - 1 Claude Code resources file
- config.json, package.json, README.md

### Agent-studio (2000+ files)

- agents/ - 49+ agents (core/domain/specialized/orchestrators)
- commands/ - 17 commands
- context/ - Memory, reports, artifacts, runtime state
- docs/ - 14+ reference docs
- hooks/ - 50+ hooks across 10 categories
- lib/ - Library modules (routing, memory, utils)
- schemas/ - 27 JSON schemas
- skills/ - 30+ skills
- templates/ - Spawn templates
- tools/ - 66 CLI tools
- workflows/ - 20+ workflows
- config.yaml, settings.json, CLAUDE.md (2000 lines)

**Verdict:** Our structure is necessarily more complex (multi-agent vs single-agent). No structural changes recommended.

---

## 3. Feature-by-Feature Comparison Table

| Feature                   | Pro-workflow                                           | Agent-studio                                              | Verdict                                                          |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------------------------- |
| **Agents**                | 3 (planner, reviewer, scout)                           | 49+ agents                                                | Ours is richer. Keep ours.                                       |
| **Agent definitions**     | 50 lines each, simple                                  | 100-300 lines, structured                                 | DO NOT simplify (user rejected).                                 |
| **Skills**                | 1 (pro-workflow, 467 lines)                            | 30+ skills                                                | Ours is richer.                                                  |
| **Commands**              | 10                                                     | 17                                                        | Partial gap: we lack wrap-up, insights, replay.                  |
| **Hook events used**      | 8 (incl. Stop, SessionStart, PreCompact, Notification) | 4 (PreToolUse, PostToolUse, UserPromptSubmit, SessionEnd) | Gap: we do not use Stop, SessionStart, PreCompact, Notification. |
| **Persistent storage**    | SQLite + FTS5                                          | SQLite BM25 for code, markdown for memory                 | Gap: no FTS5 learning search.                                    |
| **Drift detection**       | UserPromptSubmit hook tracking original intent         | None                                                      | **Novel feature we lack entirely.**                              |
| **Quality gate tracking** | Edit counter with adaptive thresholds                  | No edit counting                                          | **Novel feature we lack entirely.**                              |
| **Post-edit checks**      | PostToolUse scans for console.log, TODOs, secrets      | No post-edit scanning                                     | **Novel feature we lack entirely.**                              |
| **PreCompact hook**       | Saves session state before compaction                  | No PreCompact hook                                        | **Novel feature we lack entirely.**                              |
| **Correction detection**  | Automatic correction pattern matching                  | Manual memory append only                                 | Gap.                                                             |
| **Scout agent**           | Confidence-gated exploration (0-100)                   | No equivalent                                             | Partially covered by planner.                                    |
| **Self-correction loop**  | Explicit correction detection, [LEARN] protocol        | Memory protocol (manual append)                           | Gap: no automatic correction detection.                          |
| **Session analytics**     | /insights with heatmap, correction rates               | No session analytics                                      | **Novel feature we lack entirely.**                              |
| **Session handoff**       | /handoff command                                       | session-handoff skill (exists)                            | Partial overlap.                                                 |
| **Replay/recall**         | /replay surfaces past learnings by FTS5                | No equivalent                                             | **Novel feature we lack entirely.**                              |
| **Configuration**         | Simple config.json (45 lines)                          | config.yaml + .env + settings.json                        | Ours is more flexible.                                           |
| **Router/routing**        | No router (single-agent)                               | Full router with 4 gates                                  | Ours is necessarily more complex.                                |

---

## 4. Unique Features Worth Adopting

### P0 (High Priority - Genuine gaps)

#### 4.1 Drift Detection Hook

**What it does:** Tracks the user original intent at session start. On every subsequent prompt, compares keyword overlap between current prompt and original intent. After 6+ edits with less than 20% relevance, warns that current work seems unrelated.

**Why we need it:** Sessions regularly drift during multi-agent orchestration. No mechanism currently detects scope creep.

**Implementation effort:** Low. One 125-line JavaScript file as a UserPromptSubmit hook.

**Do we have this?** No. Nothing in our 50+ hooks tracks original intent or measures drift.

**Regression risk:** None. Purely additive, non-blocking (stderr warnings only).

**Reference implementation:** .claude.archive/.tmp/pro-workflow-main/scripts/drift-detector.js

#### 4.2 Adaptive Quality Gate (Edit Counter)

**What it does:** Counts edits per session via PreToolUse hook. At 5 edits, suggests review. At 10, recommends quality gates. Thresholds adapt based on correction history -- high correction rate = tighter gates (3/6), low rate = relaxed gates (10/20).

**Why we need it:** We have quality rules but no automated checkpoint reminders. Agents can make 50+ edits without a quality pause.

**Implementation effort:** Low. One 120-line JavaScript file.

**Do we have this?** No.

**Regression risk:** None. Non-blocking.

**Reference implementation:** .claude.archive/.tmp/pro-workflow-main/scripts/quality-gate.js

#### 4.3 Post-Edit Scanning Hook

**What it does:** After every code edit, scans the file for console.log, print(), TODO/FIXME/XXX/HACK, and hardcoded secret patterns.

**Why we need it:** code-standards.md says no console.log but nothing enforces it during editing.

**Implementation effort:** Low. One 80-line JavaScript file.

**Do we have this?** No.

**Regression risk:** None. Non-blocking.

**Reference implementation:** .claude.archive/.tmp/pro-workflow-main/scripts/post-edit-check.js

### P1 (Medium Priority)

#### 4.4 PreCompact State Preservation Hook

**What it does:** Before context compaction, saves edit count, prompt count, and session summary. Resets counters after compaction.

**Why we need it:** Session state is lost during compaction.

**Implementation effort:** Very low. 95-line JavaScript file.

**Regression risk:** None.

**Reference:** .claude.archive/.tmp/pro-workflow-main/scripts/pre-compact.js

#### 4.5 Session Start Lifecycle Hook

**What it does:** At session start, loads recent learnings, shows readiness information.

**Why we need it:** Automated loading ensures context is never forgotten.

**Implementation effort:** Low-medium. One hook (120 LOC).

**Reference:** .claude.archive/.tmp/pro-workflow-main/scripts/session-start.js

#### 4.6 Correction Detection in UserPromptSubmit

**What it does:** Pattern-matches user prompts for correction signals and suggests capturing the pattern.

**Why we need it:** Our self-correction loop is entirely manual.

**Implementation effort:** Low. Can be folded into existing UserPromptSubmit hook.

**Reference:** .claude.archive/.tmp/pro-workflow-main/scripts/prompt-submit.js

### P2 (Lower Priority)

- **4.7 Structured Learning DB** - Using SQLite+FTS5 for searchable learnings. High effort.
- **4.8 Scout/Confidence Scoring** - Add confidence rubric to planner. Medium effort.
- **4.9 Session Analytics** - Correction heatmap and productivity metrics. Medium effort.

---

## 5. Areas Where We Are Overcomplicated

### 5.1 CLAUDE.md Size: 2000 lines vs 44 lines

**Assessment:** NOT a bug. It is the cost of being a multi-agent router. We already use @references to offload content. No action needed.

### 5.2 Hook Count: 50+ vs 8

**Assessment:** Our hooks are necessarily more numerous for multi-agent enforcement. Their hooks focus on developer productivity. These are COMPLEMENTARY. We recently consolidated 6 wildcard hooks into 2.

**Recommendation:** Adopt their productivity hooks as additions.

### 5.3 Memory System: SQLite+FTS5 vs Markdown Files

**Assessment:** Their approach is superior for RETRIEVAL. We already have SQLite/BM25 for code indexing.

**Recommendation:** Consider (P2) adapting SQLite/BM25 for learnings.

---

## 6. Anti-Patterns to Avoid (Things They Do That Are Worse)

| Anti-Pattern               | Why to Avoid                                        |
| -------------------------- | --------------------------------------------------- |
| No multi-agent routing     | Would be catastrophic for our use case              |
| Minimal agent definitions  | User explicitly rejected simpler agents             |
| No blocking enforcement    | Our blocking hooks prevent real issues              |
| Temp-file state management | Fragile, non-portable. Use .claude/context/runtime/ |
| No schema validation       | Our 27 schemas enforce consistency                  |
| Single monolithic skill    | Our skill-per-concern pattern scales better         |

---

## 7. Recommended Adoption List (Prioritized)

### P0 - Adopt Immediately (This Sprint)

| #   | Feature                   | Effort        | Integration Point     |
| --- | ------------------------- | ------------- | --------------------- |
| 1   | **Drift Detection Hook**  | Low (125 LOC) | UserPromptSubmit      |
| 2   | **Adaptive Quality Gate** | Low (120 LOC) | PreToolUse Edit/Write |
| 3   | **Post-Edit Scanning**    | Low (80 LOC)  | PostToolUse Edit      |

Total: 325 LOC across 3 files + 3 registrations.

### P1 - Adopt Next Sprint

| #   | Feature                  | Effort            | Integration                 |
| --- | ------------------------ | ----------------- | --------------------------- |
| 4   | **PreCompact Hook**      | Very Low (95 LOC) | PreCompact event (new)      |
| 5   | **SessionStart Hook**    | Low (120 LOC)     | SessionStart event (new)    |
| 6   | **Correction Detection** | Low               | UserPromptSubmit (existing) |

### P2 - Evaluate Later

| #   | Feature                  | Effort | Notes                    |
| --- | ------------------------ | ------ | ------------------------ |
| 7   | Structured Learning DB   | High   | Adapt SQLite/BM25        |
| 8   | Scout/Confidence Scoring | Medium | Add rubric to planner    |
| 9   | Session Analytics        | Medium | Requires data collection |

### What NOT to Adopt

| Feature                         | Reason                                |
| ------------------------------- | ------------------------------------- |
| Simple agent definitions        | User rejected previously              |
| Non-blocking enforcement        | Blocking hooks prevent real problems  |
| Temp-file state management      | Fragile. Use .claude/context/runtime/ |
| Monolithic skill design         | Skill-per-concern scales better       |
| Plugin manifest system          | We are self-contained                 |
| LEARNED.md file-based learnings | We have a richer memory protocol      |

---

## 8. Implementation Notes

### Hook Architecture Compatibility

Pro-workflow hooks follow the same stdin/stdout JSON protocol as ours. Adaptation requires:

1. Replace os.tmpdir() with .claude/context/runtime/ paths
2. Use CLAUDE_SESSION_ID env var instead of process.ppid
3. Add standard error handling (try/catch wrapping)
4. Normalize Windows paths per our learnings

### State Storage

For transient state, use:

- .claude/context/runtime/drift-state.json for drift detection
- .claude/context/runtime/edit-counter.json for quality gate tracking
- .claude/context/runtime/session-metrics.json for session analytics

### Hook Registration

Register in .claude/settings.json. Note: Claude Code caches settings.json at session startup; hook changes require restart.

---

## 9. Conclusion

Pro-workflow is a well-designed developer productivity tool for individual Claude Code users. It excels at **self-correction loops**, **session lifecycle management**, and **learning persistence** -- areas where our enterprise framework has gaps because we focused on multi-agent orchestration.

The recommended adoptions (3 P0 hooks, 3 P1 hooks) are purely additive, low-risk, and address genuine gaps. They require no changes to existing routing, agents, skills, or enforcement infrastructure.

The anti-adoption list is equally important: do not simplify agents, remove enforcement hooks, or adopt temp-file state management. These would cause regressions.

---

_End of analysis report._
