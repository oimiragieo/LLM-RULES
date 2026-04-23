<!-- Agent: architect | Task: #79 | Session: 2026-02-09 -->

# Architecture Comparison: pro-workflow vs agent-studio

## Executive Summary

**pro-workflow** is a 53-file Claude Code plugin focused on individual developer productivity through self-correcting memory loops, session analytics, and lightweight workflow enforcement. **agent-studio** is a 2,254-file enterprise multi-agent orchestration framework with 59 agents, 45 enforcement hooks, 448 skills, and a formal router-first architecture.

They are not competitors -- they solve fundamentally different problems at different scales. However, pro-workflow contains several architectural ideas that agent-studio lacks, and agent-studio contains enforcement depth that pro-workflow cannot match.

---

## 1. Router Architecture

### pro-workflow: No Router

pro-workflow has **no router layer**. There is no centralized request dispatcher. The user directly interacts with Claude Code, and the SKILL.md file provides behavioral guidance. Agent selection (planner, reviewer, scout) is manual -- the user or Claude decides which subagent to invoke based on context.

**Configuration:** `config.json` (45 lines) stores preferences for quality gates, model selection, parallel sessions, and self-correction behavior. There is no routing table, no intent classification, and no enforcement of which agent handles what.

```
User prompt -> Claude Code (with SKILL.md loaded) -> Direct execution or manual subagent spawn
```

### agent-studio: Multi-Layer Router

agent-studio has a formal Router (CLAUDE.md, ~700 lines of routing logic) that:

1. Classifies intent (complexity, domain, risk)
2. Matches against a 26-row routing table
3. Resolves model from config.yaml
4. Spawns 1+ subagents via Task() tool
5. Enforces 4 self-check gates before every spawn
6. Is programmatically enforced by `routing-guard.cjs` (blocking hooks)

```
User prompt -> Router (CLAUDE.md) -> Gate checks -> Routing table lookup -> Task() spawn -> Subagent executes
```

### Assessment

| Criterion              | pro-workflow                           | agent-studio                                               |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------- |
| **Complexity ratio**   | 0 LOC (no router)                      | ~2,000 LOC (CLAUDE.md + routing-guard + routing-table)     |
| **Maintenance burden** | Zero (nothing to maintain)             | High (routing table, gate checks, enforcement hooks)       |
| **Failure modes**      | User picks wrong approach manually     | Router misroutes; hooks block valid work; orphaned tasks   |
| **Scalability**        | Breaks at 5+ agents (manual selection) | Handles 59 agents with automated routing                   |
| **Correctness**        | Depends entirely on user/LLM judgment  | Enforced: planner-first, security-review, specialist-first |

**Verdict:** pro-workflow's lack of router is appropriate for 3 agents. agent-studio's router is necessary for 59 agents. Neither approach is wrong -- they serve different scales. However, agent-studio's routing overhead (4 gates, 7 enforcement checks, 10+ hook evaluations per spawn) could benefit from pro-workflow's simplicity for TRIVIAL/LOW complexity tasks where the routing overhead exceeds the task complexity.

---

## 2. Agent Spawning

### pro-workflow: Minimal Agent Definitions

3 agents (planner, reviewer, scout), each ~50 lines of markdown with YAML frontmatter:

```yaml
---
name: planner
description: Specialized agent for breaking down complex tasks
tools: ['Read', 'Glob', 'Grep']
model: opus
---
```

Agents are self-contained -- one file defines the entire agent. No spawn templates, no TaskUpdate protocol, no warning boxes, no identity integration.

**Spawn mechanism:** Claude Code's native subagent spawning. The user says "use the planner" and Claude spawns it using the agent definition.

### agent-studio: Template-Based Spawning System

59 agents with 4 spawn templates:

- `universal-agent-spawn.md` (standard agents)
- `orchestrator-spawn.md` (agents that spawn other agents)
- `agent-identity-integration.md` (agents with personality)
- `subordinate-once.md` (one-shot agents)

Every spawn includes:

- 70-line TaskUpdate warning box
- Agent file reference
- Task ID injection
- Model resolution from config.yaml
- Memory protocol instructions
- Skill invocation protocol

A single spawn prompt can be 200-500 tokens after template expansion.

### Assessment

| Criterion              | pro-workflow                            | agent-studio                                                 |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------ |
| **Complexity ratio**   | ~150 LOC total (3 agents)               | ~15,000 LOC (59 agents + 4 templates + spawn assembler)      |
| **Maintenance burden** | Trivial (edit one .md file)             | High (template changes affect all 59 agents)                 |
| **Failure modes**      | Agent forgets its role (no enforcement) | Template load failure; TaskUpdate forgotten despite warnings |
| **Scalability**        | Manual addition of new agents           | Formal creator workflow with catalog integration             |
| **Task tracking**      | None (no TaskUpdate protocol)           | Mandatory (enforced by hooks, but still ~20% forget rate)    |

**Verdict:** pro-workflow's simplicity is elegant but fragile. There is zero traceability -- if an agent completes work, no record exists. agent-studio's template system adds significant overhead but solves real problems (task tracking, memory persistence, spawn traceability). The TaskUpdate enforcement is necessary -- without it, the multi-agent system becomes opaque.

**Notable pro-workflow innovation: Scout Agent.** The confidence-gated exploration pattern (score 5 dimensions 0-20 each, proceed only if total >= 70) is a genuinely useful concept that agent-studio lacks. It prevents premature implementation when context is insufficient.

---

## 3. Enforcement Architecture

### pro-workflow: Advisory Hooks

8 hook registrations in `hooks.json`, all **non-blocking** (exit 0 always):

| Hook                 | Event                   | Purpose                                   |
| -------------------- | ----------------------- | ----------------------------------------- |
| quality-gate.js      | PreToolUse (Edit/Write) | Track edit count, remind at thresholds    |
| pre-commit reminder  | PreToolUse (git commit) | Remind to run quality gates               |
| pre-push reminder    | PreToolUse (git push)   | Remind about /wrap-up                     |
| post-edit-check.js   | PostToolUse (Edit)      | Check for console.log, TODOs, secrets     |
| test-failure suggest | PostToolUse (Bash test) | Suggest [LEARN] from failures             |
| session-check.js     | Stop                    | Periodic wrap-up/compact reminders        |
| session-start.js     | SessionStart            | Load learnings from database              |
| session-end.js       | SessionEnd              | Save session stats to database            |
| prompt-submit.js     | UserPromptSubmit        | Track prompts, detect correction patterns |
| drift-detector.js    | UserPromptSubmit        | Warn when straying from original intent   |
| pre-compact.js       | PreCompact              | Save state before compaction              |

**Philosophy:** "Non-blocking -- hooks remind, don't block (except dangerous ops)." This is explicitly stated in their SKILL.md.

**Total hook code:** ~600 lines across 8 scripts.

### agent-studio: Blocking Enforcement System

45 hooks organized across 8 categories, with **blocking as default**:

| Category    | Hooks                                                        | Mode        |
| ----------- | ------------------------------------------------------------ | ----------- |
| routing/    | routing-guard.cjs (10 checks)                                | block       |
| safety/     | unified-creator-guard.cjs, unified-pre-write-hook.cjs, etc.  | block       |
| validation/ | spawn-prompt-validator.cjs, config-model-validator.cjs, etc. | warn        |
| reflection/ | reflection-step0-guard.cjs                                   | block       |
| workflow/   | post-completion-chain.cjs                                    | warn        |
| git/        | commit-validator.cjs                                         | warn        |
| memory/     | sync-memory-index.cjs                                        | passthrough |
| session/    | user-prompt-unified.cjs                                      | passthrough |

**Total hook code:** ~8,000+ lines across 45 hooks.

### Assessment

| Criterion              | pro-workflow                                  | agent-studio                                                                                 |
| ---------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Complexity ratio**   | ~600 LOC / 8 hooks                            | ~8,000+ LOC / 45 hooks                                                                       |
| **Maintenance burden** | Low (each hook is independent, ~75 lines avg) | High (hooks depend on shared libs, state files, config)                                      |
| **Failure modes**      | Reminders ignored (no enforcement)            | Hooks block valid operations (false positives ~40% for creator guard); state file corruption |
| **Scalability**        | Works for any project size                    | Requires restart for hook registration changes; hooks add latency per tool call              |
| **Effectiveness**      | Depends on user discipline                    | Provably prevents orphaned artifacts (0% vs 70% before)                                      |

**Verdict:** This is the most instructive comparison. pro-workflow's advisory approach is lower friction but has no teeth. agent-studio's blocking approach is higher friction but provably effective. The critical insight is that **enforcement exists in agent-studio because advisory approaches failed** -- the 70% orphan rate before enforcement proves that "reminders" alone are insufficient for multi-agent systems where the agents themselves need guardrails.

However, pro-workflow's **adaptive quality gates** are a genuinely novel pattern. The quality-gate.js script adjusts edit thresholds based on historical correction rate:

- High correction rate (>25%) -> tighter gates (every 3 edits)
- Low correction rate (<5%) -> relaxed gates (every 10 edits)

This adaptive pattern does not exist in agent-studio. Our quality gates are static.

**Notable pro-workflow innovation: Drift Detection.** The drift-detector.js tracks the original user intent via keyword extraction and warns when subsequent prompts diverge beyond a relevance threshold. This is a lightweight but useful pattern for maintaining focus during long sessions. agent-studio has no equivalent.

---

## 4. State Management

### pro-workflow: Dual-Layer Persistence

**Layer 1: SQLite Database** (`~/.pro-workflow/data.db`)

- `learnings` table: category, rule, mistake, correction, times_applied
- `sessions` table: edit_count, corrections_count, prompts_count
- `learnings_fts` virtual table: FTS5 full-text search with BM25 ranking
- Auto-sync triggers for FTS index maintenance

**Layer 2: Temp Files** (fallback when SQLite unavailable)

- `os.tmpdir()/pro-workflow/edit-count-{sessionId}`
- `os.tmpdir()/pro-workflow/intent-{sessionId}`
- `os.tmpdir()/pro-workflow/response-count-{sessionId}`

**State lifecycle:** SessionStart hook initializes DB session -> hooks track edits/corrections/prompts during session -> SessionEnd hook finalizes session -> data persists across sessions.

### agent-studio: Multi-File State System

**Layer 1: Markdown Memory** (persistent across sessions)

- `learnings.md`: Patterns and solutions (append-only, ~80KB)
- `decisions.md`: Architecture Decision Records (~20KB)
- `issues.md`: Blockers and workarounds (~53KB)
- `active_context.md`: Scratchpad for current session

**Layer 2: JSON Runtime State** (ephemeral per session)

- `workflow-state.json`: Current phase, agent assignments
- `router-state.json`: Creator intent flags, routing context
- `active-creators.json`: Creator token TTLs
- `reflection-spawn-request.json`: Pending reflection requests
- `integration-queue.jsonl`: Post-creation integration tasks

**Layer 3: JSONL Metrics** (append-only logs)

- `spawn-log.jsonl`: Agent spawn traceability
- `hook-metrics.jsonl`: Hook execution timing
- `error-metrics.jsonl`: Error tracking
- `router-violations.jsonl`: Policy violation tracking

### Assessment

| Criterion              | pro-workflow                                                             | agent-studio                                                                      |
| ---------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Complexity ratio**   | ~400 LOC (schema + store + fts)                                          | ~2,000+ LOC (memory manager + scheduler + rotator + pruner)                       |
| **Maintenance burden** | Low (SQLite is self-maintaining)                                         | High (markdown files grow unbounded; rotation/pruning needed; 82KB active memory) |
| **Failure modes**      | DB corruption (mitigated by SQLite ACID); temp file race conditions      | Markdown parsing errors; state file staleness; context budget exhaustion (40%)    |
| **Scalability**        | Excellent (SQLite handles millions of rows; FTS5 scales logarithmically) | Poor (markdown files are O(n) to parse; no indexing; context budget constrains)   |
| **Query capability**   | Full SQL + FTS5 BM25 search                                              | Grep-based text search; no structured queries                                     |

**Verdict:** pro-workflow's SQLite-backed state management is architecturally superior for learnings persistence. Structured data in a relational database with FTS5 full-text search is fundamentally better than appending to markdown files for:

- Search: BM25 ranking vs grep
- Growth management: SQL DELETE vs markdown rotation
- Analytics: SQL aggregation vs manual parsing
- Cross-session persistence: SQLite WAL vs file locks

agent-studio's markdown memory is simpler to read/write from LLM context but scales poorly. The 82KB active memory consuming 40% of context budget (ADR-102) is a direct consequence of flat-file architecture. pro-workflow avoids this entirely -- learnings are in the DB, and only relevant ones are loaded at session start.

However, agent-studio's multi-layer state system (runtime JSON + JSONL metrics + markdown memory) serves a different purpose -- orchestrating 59 agents with workflow state, creator tokens, and integration queues. pro-workflow does not need this because it has no multi-agent orchestration.

**Notable pro-workflow innovation: FTS5 Learnings Database.** The combination of SQLite + FTS5 + BM25 ranking + correction tracking + times_applied counter is a genuinely excellent learning system. The `/replay` command that surfaces relevant past learnings before starting a task, and the `/insights` command with correction heatmaps, are patterns that agent-studio should adopt.

---

## 5. File Organization

### pro-workflow: Flat and Minimal

```
pro-workflow/           (53 files total)
  agents/               3 agents
  commands/             10 commands
  contexts/             3 contexts
  hooks/                1 hooks.json
  rules/                1 core-rules.md
  scripts/              8 hook scripts
  skills/               1 SKILL.md
  src/                  5 TypeScript source files
  templates/            5 split-claude-md templates
  references/           1 reference doc
```

**Everything is flat.** No nested categories, no catalogs, no registries. Finding something means scanning ~10 directories.

### agent-studio: Deep Hierarchy

```
.claude/                (2,254 files total)
  agents/               59 agents in 4 categories (core/domain/specialized/orchestrators)
  context/              Memory, reports, plans, artifacts, runtime, metrics, data
  docs/                 15 reference documents (@files)
  hooks/                45 hooks in 8 categories
  lib/                  30+ library modules in 6 categories
  schemas/              27 JSON schemas
  skills/               448 SKILL.md files
  templates/            30+ templates in 5 categories
  tools/                66 CLI tools in 13 categories
  workflows/            20+ workflows in 3 categories
```

### Assessment

| Criterion              | pro-workflow                                 | agent-studio                                                                    |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| **Complexity ratio**   | 53 files / 53 files = 1.0 (no overhead)      | ~2,254 files / ~200 functional files = 11:1 (significant overhead)              |
| **Maintenance burden** | Trivial (add file, done)                     | High (add file + catalog + registry + routing + hooks + tests)                  |
| **Failure modes**      | Missing file = feature absent (simple)       | Missing catalog entry = invisible artifact (70% orphan rate before enforcement) |
| **Scalability**        | Breaks at ~20 agents (flat dir unmanageable) | Handles 59 agents with categorization                                           |
| **Discoverability**    | Scan 10 dirs manually                        | Catalogs + registries + routing table                                           |

**Verdict:** pro-workflow's flat structure is appropriate for a plugin with 53 files. agent-studio's deep hierarchy is necessary for 2,254 files but creates a "catalog tax" where every new artifact requires 3-5 integration steps. The 11:1 overhead ratio suggests that significant portions of agent-studio are meta-infrastructure (catalogs about catalogs, hooks about hooks, schemas about schemas).

---

## 6. Configuration Management

### pro-workflow: Single JSON Config

One file: `config.json` (45 lines)

```json
{
  "quality_gates": { "run_lint": true, "lint_command": "npm run lint" },
  "model_preferences": { "quick_fixes": "sonnet", "architecture": "opus-thinking" },
  "self_correction": { "enabled": true, "require_approval": true },
  "plan_mode": { "threshold_files": 3 }
}
```

All configuration in one place. No environment variables, no override hierarchy, no per-agent configuration.

### agent-studio: Multi-Layer Configuration

- `config.yaml`: Agent model assignments, workflow settings
- `.env`: Environment-specific variables (30+ variables)
- `settings.json`: Hook registrations (registered at startup, cached)
- Agent frontmatter: Per-agent model/tools/skills
- `router-state.json`: Runtime routing context
- Environment variables: Override enforcement modes (`PLANNER_FIRST_ENFORCEMENT=warn`)

**Resolution precedence:** Explicit Task() > Agent frontmatter > config.yaml > Complexity defaults > Fallback (sonnet)

### Assessment

| Criterion              | pro-workflow                                            | agent-studio                                           |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| **Complexity ratio**   | 45 LOC (1 file)                                         | ~500+ LOC (6+ config sources)                          |
| **Maintenance burden** | Trivial (edit one file)                                 | High (changes may need updates in 3+ places)           |
| **Failure modes**      | Missing config = defaults work                          | Config precedence confusion; stale settings.json cache |
| **Scalability**        | Limited (single file becomes unwieldy at 100+ settings) | Good (layered config handles complex scenarios)        |

**Verdict:** pro-workflow's single config is cleaner for its scope. agent-studio's multi-layer configuration is overengineered for many use cases but necessary for fine-grained control of 59 agents with different model/tool requirements. The **settings.json caching issue** (hooks require restart after registration changes) is a pain point that pro-workflow avoids entirely.

---

## 7. Memory/Context Management

### pro-workflow: Database-Backed Learning Loop

**Core innovation:** The self-correction loop.

```
User corrects Claude -> Claude proposes rule -> User approves -> Rule saved to DB ->
Future sessions search DB for relevant rules -> Rules surfaced before similar tasks
```

Features:

- `/learn` captures corrections as structured records (category, rule, mistake, correction)
- `/search` performs FTS5 BM25-ranked search across all learnings
- `/replay` proactively surfaces relevant learnings before starting a task
- `/insights` shows analytics: correction rates, heatmaps, stale learnings
- `/handoff` creates structured session-to-session transfer documents
- `times_applied` counter tracks which learnings are actually used
- Adaptive quality gates adjust based on correction history

**Cross-session continuity:** SQLite database persists at `~/.pro-workflow/data.db`, surviving session resets, context compaction, and machine restarts.

### agent-studio: File-Based Memory Protocol

**Core approach:** Append to markdown files.

```
Agent starts -> Read learnings.md -> Do work -> Append findings to learnings.md/decisions.md/issues.md
```

Features:

- `learnings.md`: Unstructured text patterns/solutions
- `decisions.md`: Architecture Decision Records (formal ADRs)
- `issues.md`: Blockers and workarounds
- Memory rotation (ADR-102): When files exceed 20KB, rotate to archives
- Smart pruner: Jaccard-similarity deduplication
- Cold storage: 3-tier (HOT/WARM/COLD) archival
- Named memory API: Topic-specific notes in `memory/named/`

**Cross-session continuity:** Files persist on disk. LLM must re-read them at session start (consuming context tokens).

### Assessment

| Criterion              | pro-workflow                                           | agent-studio                                                                          |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| **Complexity ratio**   | ~400 LOC (DB + search + commands)                      | ~1,500+ LOC (memory manager + rotator + pruner + cold storage + scheduler)            |
| **Maintenance burden** | Low (SQLite self-manages; FTS auto-syncs via triggers) | High (rotation thresholds, pruning algorithms, archive management)                    |
| **Failure modes**      | DB corruption (rare, SQLite is battle-tested)          | Unbounded growth (82KB consuming 40% context); duplicate entries; rotation edge cases |
| **Scalability**        | Excellent (SQLite + FTS5 handles millions of entries)  | Poor (grows until rotation triggers; grep-based search is O(n))                       |
| **Query quality**      | BM25-ranked search with snippets                       | Grep text match (no ranking, no relevance scoring)                                    |
| **Analytics**          | Correction rates, heatmaps, trends, stale detection    | None (no analytics on memory usage or effectiveness)                                  |

**Verdict:** pro-workflow's database-backed memory is architecturally superior for the learning/correction loop. agent-studio's markdown memory is simpler to author but harder to maintain and query at scale.

However, agent-studio's ADR system (formal Architecture Decision Records with Status/Context/Decision/Rationale/Consequences) is more structured for architectural decisions than pro-workflow's flat `[LEARN] Category: Rule` format. These serve different purposes: pro-workflow captures tactical corrections; agent-studio captures strategic decisions.

---

## Quantitative Summary

| Dimension        | pro-workflow       | agent-studio   | Ratio              |
| ---------------- | ------------------ | -------------- | ------------------ |
| Total files      | 53                 | 2,254          | 1:43               |
| Agents           | 3                  | 59             | 1:20               |
| Skills           | 1                  | 448            | 1:448              |
| Hooks (active)   | 8                  | 45             | 1:6                |
| Hook LOC         | ~600               | ~8,000+        | 1:13               |
| Config sources   | 1                  | 6+             | 1:6                |
| Commands         | 10                 | 15+            | 1:1.5              |
| Dependencies     | 1 (better-sqlite3) | 5+ (various)   | 1:5                |
| Enforcement mode | Advisory           | Blocking       | N/A                |
| Memory storage   | SQLite + FTS5      | Markdown files | Structured vs flat |

---

## Innovations Worth Adopting

These pro-workflow patterns deliver genuine value that agent-studio lacks, and could be adopted **without removing existing enforcement**:

### P1: Adopt (High Value, Low Risk)

1. **Drift Detection Hook** -- Track original user intent per session, warn when prompts diverge beyond keyword-overlap threshold. Could be added to `user-prompt-unified.cjs` as an additional check. ~100 LOC.

2. **Adaptive Quality Gates** -- Adjust edit-check frequency based on historical correction rate. Currently agent-studio's quality gates are static. Could be implemented in the existing quality-gate infrastructure. ~50 LOC.

3. **Session Handoff Command** -- `/handoff` generates a structured document designed for consumption by the next session. agent-studio has `session-handoff` skill but it is less structured than pro-workflow's approach with DB-backed stats. Enhance existing skill with pro-workflow's format.

4. **Correction Detection in UserPromptSubmit** -- pro-workflow detects correction patterns ("no, that's wrong", "undo that", "revert") and suggests capturing them as learnings. This is a simple regex-based pattern that could enhance `user-prompt-unified.cjs`.

### P2: Evaluate (Medium Value, Medium Risk)

5. **SQLite Learnings Store** -- Replace or supplement markdown-based learnings with a SQLite+FTS5 database. This would solve the 82KB context budget issue (ADR-102) and enable BM25-ranked search. Risk: significant refactoring of memory protocol; all 59 agents reference markdown files.

6. **Scout/Confidence-Gating Pattern** -- Before implementation, score readiness across 5 dimensions. If score < 70, gather more context before proceeding. Could be implemented as a skill invoked by the planner agent.

7. **Learning Analytics** (`/insights` pattern) -- Correction heatmaps, stale learning detection, productivity metrics. Requires structured learning storage (see P2-5).

### P3: Do Not Adopt (agent-studio approach is superior)

8. **No-Router Architecture** -- pro-workflow has no router because it has 3 agents. With 59 agents, removing the router would reintroduce the misrouting problem.

9. **Advisory-Only Enforcement** -- pro-workflow's non-blocking hooks work for a solo developer workflow. For multi-agent orchestration, blocking enforcement is necessary (proven by 70% -> 0% orphan rate).

10. **Flat File Organization** -- Works for 53 files, breaks at 2,254. The categorized hierarchy is necessary.

11. **Manual Agent Selection** -- Works for 3 agents, breaks at 59. Automated routing is necessary.

---

## Architectural Lessons

### What pro-workflow does better

1. **Data over documents.** SQLite + FTS5 for learnings is fundamentally better than appending to markdown files. Structured data enables search, analytics, and growth management that flat files cannot provide.

2. **Feedback loops.** The self-correction loop (correction -> learning -> search -> application -> tracking) is a closed loop with measurable improvement. agent-studio's memory protocol is open-loop (append and hope someone reads it).

3. **Adaptive behavior.** Quality gates that adjust based on historical performance are smarter than static thresholds. This principle could be applied beyond quality gates to routing confidence, spawn model selection, and enforcement strictness.

4. **Session lifecycle awareness.** SessionStart/SessionEnd/PreCompact hooks create a clear session boundary. agent-studio hooks are event-driven without a cohesive session lifecycle concept.

5. **Simplicity as a feature.** 53 files, 1 dependency, 1 config file. The cognitive load to understand and modify pro-workflow is dramatically lower. Every additional file in agent-studio is a maintenance liability.

### What agent-studio does better

1. **Multi-agent orchestration.** 59 specialized agents with automated routing, template-based spawning, and task tracking. pro-workflow cannot handle complex multi-phase work.

2. **Enforcement depth.** 4-layer defense-in-depth (detection -> routing -> write-blocking -> post-creation audit) with provable results (70% -> 0% orphan rate). Advisory hooks are insufficient for automated systems.

3. **Formal architecture decisions.** ADR system with status tracking, rationale, alternatives considered, and consequences. pro-workflow's `[LEARN]` format is too informal for architectural decisions.

4. **Artifact lifecycle management.** Creator workflows, companion checks, integration queues, and catalog maintenance. pro-workflow has no concept of artifact management.

5. **Workflow orchestration.** Enterprise workflow with phased execution (Triage -> Design -> Implement -> Review -> Deploy -> Document -> Reflect), quality gates between phases, and automatic advancement. pro-workflow handles one task at a time.

### The fundamental tension

pro-workflow optimizes for **individual developer velocity**: minimize friction, maximize learning from corrections, ship faster.

agent-studio optimizes for **multi-agent correctness**: ensure routing accuracy, enforce creation protocols, track task completion, prevent invisible artifacts.

These are not contradictory goals. The ideal system would have pro-workflow's learning infrastructure feeding into agent-studio's enforcement engine -- adaptive enforcement based on measured correction rates, database-backed learnings accessible to all 59 agents, and session analytics driving routing improvements.

---

## Recommendations

### Immediate (This Sprint)

1. **Add drift detection** to `user-prompt-unified.cjs` using pro-workflow's keyword-overlap algorithm. Warn when user prompts diverge from original session intent.

2. **Add correction detection** to `user-prompt-unified.cjs` using pro-workflow's regex patterns. Surface correction opportunities and track correction rates.

3. **Create `/handoff` command** modeled on pro-workflow's structured handoff document format. Enhance existing `session-handoff` skill with DB stats if available.

### Near-Term (Next 2 Sprints)

4. **Implement SQLite learnings store** alongside existing markdown memory. Use the pro-workflow schema (learnings + learnings_fts + sessions) as a starting point. Keep markdown as the authoring interface; sync to DB for search/analytics.

5. **Create Scout skill** implementing the confidence-gating pattern. Planner invokes Scout before spawning developer for complex tasks.

6. **Add adaptive quality gate logic** to the enterprise workflow quality-gates.cjs. Adjust gate strictness based on historical task completion rates and correction counts.

### Long-Term (Quarter)

7. **Build analytics dashboard** (`/insights` equivalent) showing correction rates, agent effectiveness, routing accuracy, and memory utilization. Powered by the SQLite store.

8. **Implement feedback loop** where correction-rate data informs enforcement strictness. High-correction agents get tighter gates; low-correction agents get relaxed gates. This is the synthesis of pro-workflow's adaptive approach with agent-studio's enforcement depth.

---

_Analysis based on pro-workflow v1.2.0 (53 files) and agent-studio v2.2.1 (2,254 files). Last updated: 2026-02-09._
