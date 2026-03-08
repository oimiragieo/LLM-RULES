## MEGA EPIC: Telegram Chat + File Drop (2026-03-08)

- Commit 373209b8: outbox-based /ask reply delivery, file drop handler, markitdown skill
- GAP-A fixed: processOutbox() runs each polling cycle before new messages
- Security: 5 findings fixed (cmd injection, path traversal, memory poison, token exposure, HTML injection)
- Architecture: outbox.json atomic queue, reply_to_message_id threading, 5-min timeout
- Markitdown: pip install markitdown[all], Python wrapper at .claude/tools/cli/markitdown-convert.py
- 47+ TDD tests: telegram-outbox (13), telegram-file-drop (13), markitdown-converter (11), markitdown-convert (10)
- Multi-LLM council: Gemini unavailable, Codex minimal, chairman synthesis applied
- TELEGRAM_OWNER_USERNAME=Oimirageio, TELEGRAM_OWNER_CHAT_ID (numeric) in .env

## 2026-03-08 — Batch 3 Reflections (Tasks 25-35 + reflection meta-tasks)

- **[PATTERN] EPIC commit 40d4f0e3 covered three major features together**: heartbeat auto-spawn (CLAUDE.md Step 0.5 sentinel check), Telegram v2 (10 commands + DM pairing security), and memory importance scoring (scoreImportance() 60/20/20). Large EPIC commits are valid when phases are tightly coupled, but each feature should still have an individual task with summary metadata.
- **[INTEGRATION] CLAUDE.md Step 0.5 now includes heartbeat sentinel check**: Router reads `heartbeat-active.json` on every prompt; if file is missing/expired/loop_count < 8, spawns heartbeat-orchestrator in background. This closes the gap where the heartbeat ecosystem could silently die between sessions. File path: `.claude/context/runtime/heartbeat-active.json`.
- **[SKILL] heartbeat-sentinel.cjs created (Tasks 25/28)**: Sentinel file writer for heartbeat ecosystem. Writes/updates `heartbeat-active.json` with `loop_count`, `last_heartbeat`, and 46h expiry. Pattern: sentinel = lightweight file-based liveness signal, checked by Router at Step 0.5. Idempotent — safe to call multiple times.
- **[SKILL] telegram-polling v2 with 10 commands + security (Task 26)**: v2 adds `/start`, `/status`, `/approve`, `/deny`, `/memory`, `/plan`, `/report`, `/kill`, `/pause`, `/resume` commands. DM pairing security gate fully implemented. 15 tests confirmed passing. Security pattern: unknown senders receive pairing code before any message is routed.
- **[MEMORY] scoreImportance() 60/20/20 weighted retrieval confirmed (Task 27)**: 60% importance score, 20% recency, 20% access frequency. This weighting is the production contract in `contextual-memory.cjs`. Do not adjust weights without updating all 32 memory tests. The Google Always-On-Memory pattern (P0 implemented) uses this formula.
- **[DOCS] HEARTBEAT_STATE_CONTRACTS.md created (Task 30)**: Documents the complete heartbeat ecosystem state machine: sentinel file schema, loop lifecycle, restart policy, failure thresholds. Canonical reference for heartbeat-orchestrator and all Loop 1-6 skills. Location: `.claude/context/artifacts/`.
- **[QA] Gate 0.7 PASS 8/8 (Task 31)**: Proactive audit found all 8 checks passing after the EPIC session. Framework integrity verified — hooks, skills, agents, and workflows all consistent after the batch of changes. Gate 0.7 = QA with proactive-audit skill; passing 8/8 is the green signal to declare pipeline complete.
- **[DEVOPS] README.md updated (5011d0b7) and .env.example completed (e1ea288e) then pushed (Task 35)**: Documentation tasks paired with environment config completion. Both commits pushed successfully. Pattern: doc updates should be bundled with the feature that introduces new config vars, not deferred.
- **[COMPLIANCE] Tasks 33 and 34 completed without summary metadata**: dataQuality: insufficient for both. Score withheld per Iron Law. Pattern continues — agents completing non-trivial tasks without providing summary in TaskUpdate. This is a systemic P1 gap requiring enforcement at the pre-completion-validation.cjs hook level.
- **[PATTERN] Reflection meta-tasks (reflecting on reflections)**: The system now generates reflection tasks for completed reflection agents. These meta-reflections validate the reflection handshake worked (processedReflectionIds present) and confirm dataQuality. Score for task 14 meta-reflection: dataQuality insufficient, 15+ systemic metadata violations flagged in issues.md.

---

## 2026-03-08 — Batch 2 Reflections (Tasks 21-24 + reflection-06-26)

- **[SECURITY] Telegram credentials must stay in .env, never committed**: TELEGRAM_BOT_TOKEN and related secrets confirmed stored in .env only (Task 21). Cross-session deduplication pattern for reflecting on reflection outputs (reflection-06-26) validated at score 0.87 — the pattern works and should be retained.
- **[PATTERN] Multi-LLM council design decisions (Task 22)**: heartbeat-active.json sentinel file + native CronCreate+Task() for scheduled loops (omega-cli blocked nested calls). haiku for orchestration-layer decisions, sonnet for reasoning. 10-command Telegram UX with /approve /deny for human-in-the-loop approvals. Confidence-gated 3-tier memory promotion (only write if confidence >= 0.7).
- **[MEMORY] Google always-on-memory design (Task 23)**: P0 = importance scoring (scoreImportance()) + weighted retrieval (60/20/20 split for importance/recency/access). P1 = cross-session consolidation pass. Add `consolidated` flag + `connections` field to memory entries. Implemented in memory-extractor.cjs + contextual-memory.cjs + memory-tiers.cjs defaults. 32 tests pass.
- **[PATTERN] Importance scoring weight distribution for memory retrieval**: 60% importance, 20% recency, 20% access frequency. This is the scoreImportance() function contract — do not change weights without updating contextual-memory.cjs retrieval logic and re-running all 32 memory tests.
- **[COMPLIANCE] Task 24 (planner EPIC plan) completed without summary metadata**: dataQuality: insufficient. Score withheld per Iron Law. Pattern persists — planner agents are among the worst offenders for missing TaskUpdate summary metadata.

---

## 2026-03-08 — Task 11 scheduled-tasks Skill + Context Window Guard Wiring

- **[SKILL] scheduled-tasks SKILL.md** documents 5 loop designs (cron, polling, event-driven, heartbeat, deferred) and the heartbeat OS pattern (+93 lines /loop docs). This is the canonical reference for implementing scheduled background tasks in the ecosystem.
- **[INTEGRATION] context-window-guard.cjs wired to post-tool-metrics-unified.cjs**: The 80K/120K/150K token thresholds (previously doc-only per CLAUDE.md Section 8 and MEMORY.md) are now actively enforced. The wiring path: post-tool-metrics-unified.cjs invokes context-window-guard.cjs after each tool call, which writes compression-reminder.txt when thresholds are exceeded. This closes a critical doc-vs-reality gap.
- **[COMMAND] heartbeat-start.md** slash command created for /heartbeat-start, enabling user-facing heartbeat ecosystem management without requiring direct agent spawn knowledge.
- **[PATTERN] Skill creation + command pairing**: When a new skill introduces a user-facing capability, create a companion /command.md (`.claude/commands/`) to expose it as a slash command. Task 11 demonstrates this pattern: scheduled-tasks SKILL.md + heartbeat-start.md command created together.

---

## 2026-03-08 — Task 12 arxiv-monitor + exa-monitor Skill Creation Reflection

- **[SKILL] Heartbeat ecosystem skills pattern**: `arxiv-monitor` and `exa-monitor` are scheduled-monitor skills using CronCreate + named memory (writeMemory/readMemory) for deduplication. The deduplication pattern: load seen-IDs/URLs from named memory → filter → persist updated set capped at N entries. This is reusable for any future polling/monitoring skill.
- **[SKILL] skill-creator category mismatch gap**: SKILL.md frontmatter `category: research` does not map to an entry in `CATEGORY_MAP` in `generate-skill-index-definitions.cjs`, causing the skill-index to classify both skills as `category: Other`. New skill categories must be registered in CATEGORY_MAP or the frontmatter must use an existing key.
- **[INTEGRATION] Agent frontmatter gap for research monitor skills**: After creating arxiv-monitor and exa-monitor, no agent `.md` file was updated to list these skills in its `skills:` frontmatter array. The skill-index `agentPrimary: ["developer"]` is derived from the index generator fallback, not from actual agent frontmatter. The `researcher` agent is the natural owner for these skills.
- **[PATTERN] TDD approach for skills produces clean commits**: 20 tests written alongside the two SKILL.md files, all passing before commit d81b042f. This validates the TDD-first pattern for skill creation produces audit-traceable evidence of correctness.

---

## 2026-03-08 — Task 23 Devops Commit + Framework Fixes Reflection

- **[DEVOPS] devops agent succeeded on commit this session (1/1)**: Task 23 — devops committed d8666507 and pushed to origin/main successfully. Historical baseline is ~50% failure rate. This is a positive data point; the session's 1/1 commit rate may reflect improved spawn prompt clarity or model variance. Continue tracking per-session devops success counts before revising the 50% estimate.
- **[CODE] Surgical export additions are the correct pattern for test failures caused by missing exports**: Tasks 137-139 (router-state STATE_FILE), 542-546 (findings-registry OPEN_FINDINGS_FILE + 2 more) were fixed by adding single-line exports to existing module.exports blocks. This is the minimal, zero-risk fix for "property is not defined" test failures — no logic changes, no behavior changes.
- **[CODE] force-step0-execution.cjs uses safeParseJSON correctly**: commit d8666507 replaced raw JSON.parse with safeParseJSON in this hook (test 170). SE-02 (prototype pollution via raw JSON.parse on untrusted input) is the documented sharp edge. Hook bodies must always use safeParseJSON for stdin/JSON parsing.
- **[CODE] pre-tool-unified.read-safety.cjs path hint rewrite should not require existence check**: The fix removed the `if (fs.existsSync(canonicalTarget))` guard before returning a rewrite action. The hint map is maintained manually — if a hint path is listed, it should be trusted without a runtime existence check. This simplifies the logic and makes hints unconditionally applied (test 236).
- **[PATTERN] commit message "Net result: 18 -> 13 failures (5 fixed)" is the gold standard format for test-fix commits**: When fixing pre-existing failures, the commit body should state the before/after failure count and explicitly note "Remaining N are pre-existing." This disambiguates regression vs. pre-existing for future reviewers.

---

## 2026-03-08 — Task 22 Test Verification Reflection

- **[ROUTING] researcher agent is reliable for state checks**: When a task requires verifying current state (test pass/fail counts, file existence, configuration status) without writing code, the researcher agent performs effectively. Task 22 evidence: accurate reduction from 18 to 13 test failures with precise line-number identification of 7 pre-existing P2 failures. Use researcher for verification/audit tasks, not developer.
- **[PATTERN] real summary in TaskUpdate breaks null-yield reflection cycles**: Task 22 provided a genuine summary ("Verified: 18→13 failures...") rather than the fallback string. This is the correct behavior — it enables reflection to extract learnings and produce a scored output (0.79 PASS) instead of a withheld score.

---

## 2026-03-07 Session C — Telegram Polling Skill + Openclaw Assimilation + Routing Docs + Skill-Creator Fix

### Learnings

- **[SKILL] telegram-polling** is the 6th heartbeat ecosystem loop (Loop 6), implementing Telegram Bot API long-polling with offset tracking in `.claude/context/tmp/telegram-offset.json`. DM pairing security gate: unknown senders receive a pairing code before their messages are routed. 15 tests pass.
- **[INTEGRATION] skill-creator post-creation workflow gap**: Steps 6 and 8 in skill-creator SKILL.md referenced stale CLAUDE.md v2.x section names ("Section 8.5", `skill-catalog.md`). After the v3.0.0 rewrite, canonical refs are `@SKILL_CATALOG_TABLE.md` and `@AGENT_ROUTING_TABLE.md`. Fix commit: 76ff12f3.
- **[INTEGRATION] heartbeat-orchestrator routing**: After heartbeat/telegram-polling creation, the Router's quick routing table in CLAUDE.md and @AGENT_ROUTING_TABLE.md lacked entries. Added "Heartbeat loops / cron ecosystem mgmt → heartbeat-orchestrator". Commit 8f0593ba.
- **[RESEARCH] openclaw assimilation**: 10-category feature analysis surfaced: gateway daemon, Telegram polling, DM pairing security, multi-channel routing, cron/wakeups, skills platform, model failover, voice wake, media pipeline, session model. P0 = Telegram (done), P1 = Discord webhook, P2 = model failover. Features NOT recommended: voice/canvas/WhatsApp (TOS risk).
- **[PATTERN] skill-creator post-creation checklist must include @AGENT_ROUTING_TABLE.md**: When a new skill introduces an agent or orchestrator, Step 8b (update @AGENT_ROUTING_TABLE.md) is now required. Previously missing from the workflow — discovered and fixed in task 3.

### Operational Notes

- All 4 tasks completed without TaskUpdate summary metadata (fallback strings). Reflection analysis achieved dataQuality "partial" via trigger context. This is an ongoing P1 compliance gap.
- Commits confirmed via git log: 5421e1ae, 8f0593ba, 76ff12f3 (all real, content verified).

---

## 2026-03-07 Session B — EPIC Audit + LSP + Creator-Commons Fix

### Key Findings

- **creator-commons.cjs F-03**: registry.agents is an OBJECT keyed by agent ID, not an array. Bug at ~line 400 (registry[id] vs registry.agents[id]) and ~line 524 (Array.isArray guard skips all iteration). Fixed in commit 39c6e7d2.
- **F-01 (closed)**: compression-trigger.cjs ALREADY EXISTS and reads AUTO_COMPRESSION_PHASE_3. Multi-LLM review caught the audit reporting a stale finding.
- **F-02 (closed)**: INTENT_TO_AGENT already maps 107 keys covering all 72 agents. The "7 entries" claim was counting module exports, not intent map size.
- **Health score: 9.2/10** — highest ever recorded.

### Test Coverage Added

- tests/skills/scheduled-tasks/scheduled-tasks-skill.test.cjs (7 tests)
- tests/skills/lsp-navigator/lsp-navigator-skill.test.cjs (24 tests)
- tests/skills/token-saver/token-saver-skill.test.cjs (5 tests)
- tests/agents/search-compliance.test.cjs (36 pass, 1 todo)
- tests/lib/creators/creator-commons.test.cjs (23 tests, includes registry object structure regression)

### Operational Notes

- Pre-tool read safety hook creates placeholder files when router reads non-existent paths BEFORE agents write — causes agents to fail writing reports. Workaround: don't read target path before agent writes it.
- Subagents returning "(Subagent completed but returned no output.)" is a known pattern when context is large — work IS done, output truncated. Check git status to verify actual changes.
- Multi-LLM review (Gemini + Codex) is valuable for catching stale audit findings — Codex reads actual code to verify, while Gemini reviews at face value.

---

## Session 2026-03-06 (23:00 UTC): Gate 4 Violation and Null Metadata Batch

From reflection of session gap log and debug log (2026-03-06T23:30):

- **Gate 4 Iron Law violated**: Router directly edited `.claude/skills/lsp-navigator/SKILL.md` using Edit tool when user asked "update the skill". Correct path: spawn agent → `Skill({ skill: 'skill-updater' })`. The `unified-creator-guard.cjs` should prevent this — its CREATOR_GUARD mode may have been warn/off.
- **15th+ null-metadata batch**: All 4 tasks (1, 2, 3, 4) completed with fallback summary text. `pre-completion-validation.cjs` advisory mode is demonstrably insufficient — block mode is required.
- **general-assistant `isolation: none` invalid**: Claude Code only accepts `worktree` as valid isolation value. Omitting the field entirely = no isolation (desired behavior). Commit b0c525f8 introduced this regression.
- **Hook exit code 1 ≠ block (SE-03)**: `user-prompt-unified.cjs` returned exit code 1 at session start. Exit 1 = error, exit 2 = block. The block occurred due to JSON `block:true` in stdout overriding the exit code, but the hook is technically wrong.
- **YAML parse errors block agents silently**: `debug-log-analysis/SKILL.md` and `ux-researcher.md` both have malformed YAML frontmatter — they appear in registry but fail at spawn time.

**Actionable patterns:**

- Any user request "update the skill [X]" must trigger: spawn agent → Skill({ skill: 'skill-updater' }) — never direct Edit
- When creating agents with isolation preferences, omit `isolation:` field rather than setting to unsupported values
- Hook error exit codes must be 2 not 1; audit all hooks on error paths

---

## Debug Log Session Patterns — Streaming Stalls and Hook Errors (2026-03-06)

From task-12 debug log analysis (2026-03-06T00:26):

- **13 streaming stalls** detected in a single session — primary pattern: agent tasks approaching context/time limits mid-stream. Stalls > 60s typically precede an agent drop or incomplete TaskUpdate.
- **105 advisory hook errors** — high count of advisory-mode hook firings indicates advisory mode is being treated as a free pass. When advisory errors exceed ~20 per session, consider converting the most-fired hook to block mode.
- **YAML parse error in ux-researcher.md** — agent definition file has malformed YAML frontmatter; agent cannot be instantiated until fixed. This is a silent failure — the agent appears in the registry but fails at spawn time.
- **Bash timeout** — a Bash command hit the default 2-minute timeout. Pattern: long-running node scripts or pnpm commands without explicit `timeout` parameter.
- **Worktree permission failures** — worktree cleanup fails on Windows when the spawning agent still holds file handles. The `shouldOverrideWorktreeIsolation()` fix (commit 775ccf1f) handles framework paths but not file-handle contention.

**Actionable pattern:** Sessions with 10+ streaming stalls should trigger `context-compressor` earlier; don't wait for the 80K token threshold warning.

---

## debug-log-analysis Skill v1.3.0 Upgrade (2026-03-06)

From task 22 completion (2026-03-06T00:34):

- **Dynamic log discovery**: skill now auto-detects most recent log without requiring session UUID — removes the most common operator error (hardcoded stale UUID)
- **Structured analysis**: error categorization is now formalized into the taxonomy table (Hook Block, Read Miss, Token Overflow, Streaming Stall, Agent Drop, Tool Error)
- **Cleanup step added**: temp files are removed after analysis — prevents `.claude/context/tmp/` accumulation across sessions

Skill is catalog-present, index-present (agentPrimary: developer, supporting: reflection-agent, devops-troubleshooter). No registration gaps.

---

## Batch Reflection Closure (2026-03-05 Session 2)

Second batch: 5 stale reflection requests from enterprise-search-audit pipeline (2026-03-04 23:35:56–23:54:18). All task completion reflections with task summaries present. Gap observations repeated across all 5 requests:

- architect prompt-too-long error (2 retries)
- developer incomplete agent-skill-matrix.json update (5 agents missed, re-spawn triggered)

Pattern identified: Agent scope control failures + incomplete task metadata across multi-agent workflows.

---

## Batch Reflection Closure (2026-03-05 Session 1)

5 stale reflection requests from 2026-03-04 (21:11:00–21:23:39) acknowledged and closed. All lacked `summary` metadata — the mandatory field required for actionable reflection. Sessions completing without summary metadata are non-analyzable; reflection cannot produce quality scores or learnings without it.

**Pattern:** Task completions without summary metadata → reflection unable to analyze → institutional learnings lost across sessions.

**Recommendation:** Enforce `summary` field as BLOCKING in pre-completion-validation.cjs. TaskUpdate(completed) without summary >50 chars should error, not silently skip reflection intake.

---

### Framework-Path Worktree Override (2026-03-04)

- Worktree isolation (`isolation: worktree`) causes silent data loss when an agent targets `.claude/` framework paths — writes go into the isolated clone and are discarded at cleanup
- Fix: `shouldOverrideWorktreeIsolation()` in `spawn-prompt-assembler.task-tools.cjs` detects framework paths and overrides isolation to `none`
- Detection uses regex against 8 framework path segments: hooks, skills, agents, tools, workflows, templates, schemas, lib
- Affected agents: developer, qa, code-reviewer, frontend-pro, nextjs-pro (all have `isolation: worktree` in frontmatter)
- Safe for: source code tasks in `src/`, `tests/`, project root files
- Evidence: 43% failure rate across 5+ confirmed incidents, commit 775ccf1f, 26 tests

### Cross-Platform stdin Reading (2026-03-04)

- `/dev/stdin` throws ENOENT on every invocation on Windows (Windows-first repo — see SE-01)
- Fix: use `fs.readFileSync(0, 'utf8')` (file descriptor 0) which reads stdin cross-platform without device path
- Applied to: `worktree-auto-cleanup.cjs`
- Evidence: commit 775ccf1f

---

## Skill Updated: authentication-flow-rules (2026-02-23)

- Skill `authentication-flow-rules` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: omega-gemini-cli (2026-02-24)

- Skill `omega-gemini-cli` was reviewed and updated by the skill-updater pipeline.

---

## Skill Updated: omega-claude-cli (2026-02-24)

- Skill `omega-claude-cli` was reviewed and updated by the skill-updater pipeline.

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-02-24)

- Updated workflow: evolution-workflow (2026-02-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-02-27)

- Created new agent: qa-guardian (2026-02-27)

- Created new agent: contract-check (2026-02-27)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-02-27)

- Created new agent: bool-action (2026-02-27)

- Created new agent: repo-onboarder (2026-02-27)

- Updated workflow: evolution-workflow (2026-02-27)

- Updated workflow: missing-workflow-xyz (2026-02-27)

- Refreshed skill: nativescript (2026-03-01)

- Refreshed skill: webmcp-browser-tools (2026-03-01)

- skill-updater: Wired webmcp-browser-tools skill into agent-skill-matrix.json (frontend-pro contextual, developer contextual) and frontend-pro.md frontmatter. Added contextual trigger for @mcp-b/\* packages. (2026-03-01)

- skill-updater: Wired nativescript skill into agent-skill-matrix.json (developer contextual, mobile-ux-reviewer contextual) and added nativescript_project contextual trigger for @nativescript/core. Updated nativescript SKILL.md agents to include mobile-ux-reviewer and expo-mobile-developer. (2026-03-01)

- Refreshed skill: nativescript (2026-03-01)

- Refreshed skill: webmcp-browser-tools (2026-03-01)

---

## Pattern: Multi-LLM Code Review Consensus Detects Critical Bugs (2026-03-04)

Task 2 (2026-03-04): Multi-LLM consultation on LTM eviction fixes

**Pattern**: Running the same code review through multiple LLM models (Gemini + Codex) and synthesizing results yields higher bug detection rate than single-model review.

**Evidence**:

- Both Gemini and Codex independently identified mass-extinction bug (evicts ALL files not just overflow)
- Both independently identified NaN propagation from malformed env vars
- Both independently validated correct fixes (promoted\_ exclusion, Math.max guard)
- Single-pass review would likely have missed at least one class of bugs

**Implementation**: Create multi-llm-consultant agent task when reviewing critical code paths. Request 2-3 independent model reviews before synthesizing.

**Reuse**: This pattern is high-signal for P0 security-critical or complex algorithm reviews.

---

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

- Created new agent: qa-guardian (2026-03-02)

- Created new agent: contract-check (2026-03-02)

- Created new agent: bool-action (2026-03-02)

- Created new agent: repo-onboarder (2026-03-02)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-02)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-02)

- Updated workflow: evolution-workflow (2026-03-02)

- Updated workflow: missing-workflow-xyz (2026-03-02)

## Pattern: Worktree Infrastructure Tasks Must Route to Devops Agent (2026-03-03)

**Pattern**: Worktree lifecycle management, hook creation, and framework infrastructure tasks MUST be routed to `devops` agent, NOT `developer` agent. Developer agent has `isolation: worktree` in frontmatter. When tasked with creating `.claude/` framework files under worktree isolation, all writes go into the isolated clone and are discarded at cleanup — resulting in zero visible changes after TaskUpdate(completed).

**Evidence**:

- Task 36 (2026-03-03): developer agent assigned worktree-prune.cjs + worktree-auto-cleanup.cjs creation → zero files created → rerouted to devops → succeeded
- Gap log entry: `.claude/context/runtime/session-gap-log.jsonl` (2026-03-03T08:30:00Z, type: retry)
- Pattern also seen: code-reviewer with worktree isolation fails to see unstaged changes (Task ~1 same day)

**Routing Rule**:

- Tasks writing to `.claude/hooks/`, `.claude/tools/cli/`, `.claude/skills/` framework paths → use `devops` agent
- Tasks managing git worktree lifecycle (create, prune, cleanup) → use `devops` agent
- Tasks requiring git operations (commit, push, branch management) → use `devops` agent
- Developer agent safe for: code implementation in project source files, feature development, bug fixes

**Why Devops**: devops agent has no worktree isolation in frontmatter — it operates on the main working tree. All file writes are immediately visible to the parent repo.

**Detection for Router**: If developer agent completes a task involving `.claude/` path writes, run `git diff --name-only HEAD` to verify changes exist. If no diff, re-spawn to devops.

---

- Created new agent: aso-specialist (2026-03-03)

- Created new agent: marketing-strategist (2026-03-03)

- Created new agent: brand-guardian (2026-03-03)

---

## Pattern: Worktree Isolation Compatibility Matrix (2026-03-03)

**Pattern**: Worktree isolation (isolated git worktrees from clean HEAD) is **safe for code-generation tasks** but **breaks code-analysis tasks** that depend on uncommitted changes visibility.

**Applies to**:

- ✅ **SAFE**: developer, qa, testing agents (operate on committed code)
- ❌ **UNSAFE**: code-reviewer, architect, code-simplifier (need working-tree visibility)

**Evidence**:

- Task 1 (2026-03-03): code-reviewer with worktree isolation → cannot see unstaged changes → fail → re-spawn without isolation → succeed
- Lint pipeline showed 2570/2571 issues were in isolated worktrees (expected isolation to clean HEAD)

**Workaround**:

1. For in-flight code review: spawn code-reviewer WITHOUT `isolation: worktree`
2. For committed code review: spawn code-reviewer WITH isolation (safe)
3. For mixed scenarios: commit changes before code-review spawn

**Implementation**:

- Remove `isolation: worktree` from code-reviewer.md frontmatter (set to `isolation: none`)
- Document this tradeoff in CLAUDE.md routing section
- Future: Add spawn-time override flag for conditional isolation

**Impact**:

- Resolves blocking issue: code-review fails when spawned with worktree isolation
- Enables best practice: use worktree isolation only for agents that don't need working-tree state

- Created new agent: qa-guardian (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

---

## LTM Eviction & Access Count Pattern (2026-03-03)

**Pattern**: LTM eviction changed from threshold-based to cap-based. Evicts lowest-utility entries only when `files.length > LTM_MAX_FILES`.

**Implementation**:

- Eviction is cap-based: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when threshold exceeded)
- NOT threshold-based: no longer wipes all entries when any age past 180 days
- NaN guard added for env vars: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` use `Number.isFinite()` check
- mtime fallback: entries missing timestamp fields default to current time via `mtime || Date.now()`
- Eviction preview log: `console.error` outputs deleted entries BEFORE deletion
- **Access count wired**: `incrementLTMAccessCount()` in `contextual-memory.cjs` increments `accessCount` on search hit
- Utility calculation: combines `accessCount` with time decay for eviction priority (highest utility kept, lowest evicted)

**Why This Matters**:

- Cap-based prevents mass extinction (threshold-based could wipe all LTM in single pass)
- NaN guards prevent silent calculation failures that corrupt eviction decisions
- mtime fallback prevents crash on malformed entries
- Access count enables utility-based eviction (previously all entries had equal utility)

**Multi-LLM Review** (Gemini + Codex):

- Identified mass extinction bug (threshold-based eviction)
- Identified NaN propagation risk in decay calculations
- Validated cap-based approach is correct
- Confirmed access_count wiring complete

**Files Modified**:

- `.claude/lib/memory/memory-pruner.cjs` (eviction logic)
- `.claude/lib/memory/contextual-memory.cjs` (access_count increment)
- `.claude/lib/memory/memory-manager.cjs` (NaN guards)

- Created new agent: qa-guardian (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

---

## LTM Eviction & Access Count Pattern (2026-03-03)

**Pattern**: LTM eviction changed from threshold-based to cap-based. Evicts lowest-utility entries only when `files.length > LTM_MAX_FILES`.

**Implementation**:

- Eviction is cap-based: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when threshold exceeded)
- NOT threshold-based: no longer wipes all entries when any age past 180 days
- NaN guard added for env vars: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` use `Number.isFinite()` check
- mtime fallback: entries missing timestamp fields default to current time via `mtime || Date.now()`
- Eviction preview log: `console.error` outputs deleted entries BEFORE deletion
- **Access count wired**: `incrementLTMAccessCount()` in `contextual-memory.cjs` increments `accessCount` on search hit
- Utility calculation: combines `accessCount` with time decay for eviction priority (highest utility kept, lowest evicted)

**Why This Matters**:

- Cap-based prevents mass extinction (threshold-based could wipe all LTM in single pass)
- NaN guards prevent silent calculation failures that corrupt eviction decisions
- mtime fallback prevents crash on malformed entries
- Access count enables utility-based eviction (previously all entries had equal utility)

**Multi-LLM Review** (Gemini + Codex):

- Identified mass extinction bug (threshold-based eviction)
- Identified NaN propagation risk in decay calculations
- Validated cap-based approach is correct
- Confirmed access_count wiring complete

**Files Modified**:

- `.claude/lib/memory/memory-pruner.cjs` (eviction logic)
- `.claude/lib/memory/contextual-memory.cjs` (access_count increment)
- `.claude/lib/memory/memory-manager.cjs` (NaN guards)

- Created new agent: qa-guardian (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

---

## LTM Eviction & Access Count Pattern (2026-03-03)

**Pattern**: LTM eviction changed from threshold-based to cap-based. Evicts lowest-utility entries only when `files.length > LTM_MAX_FILES`.

**Implementation**:

- Eviction is cap-based: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when threshold exceeded)
- NOT threshold-based: no longer wipes all entries when any age past 180 days
- NaN guard added for env vars: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` use `Number.isFinite()` check
- mtime fallback: entries missing timestamp fields default to current time via `mtime || Date.now()`
- Eviction preview log: `console.error` outputs deleted entries BEFORE deletion
- **Access count wired**: `incrementLTMAccessCount()` in `contextual-memory.cjs` increments `accessCount` on search hit
- Utility calculation: combines `accessCount` with time decay for eviction priority (highest utility kept, lowest evicted)

**Why This Matters**:

- Cap-based prevents mass extinction (threshold-based could wipe all LTM in single pass)
- NaN guards prevent silent calculation failures that corrupt eviction decisions
- mtime fallback prevents crash on malformed entries
- Access count enables utility-based eviction (previously all entries had equal utility)

**Multi-LLM Review** (Gemini + Codex):

- Identified mass extinction bug (threshold-based eviction)
- Identified NaN propagation risk in decay calculations
- Validated cap-based approach is correct
- Confirmed access_count wiring complete

**Files Modified**:

- `.claude/lib/memory/memory-pruner.cjs` (eviction logic)
- `.claude/lib/memory/contextual-memory.cjs` (access_count increment)
- `.claude/lib/memory/memory-manager.cjs` (NaN guards)

- Created new agent: qa-guardian (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

---

## LTM Eviction & Access Count Pattern (2026-03-03)

**Pattern**: LTM eviction changed from threshold-based to cap-based. Evicts lowest-utility entries only when `files.length > LTM_MAX_FILES`.

**Implementation**:

- Eviction is cap-based: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when threshold exceeded)
- NOT threshold-based: no longer wipes all entries when any age past 180 days
- NaN guard added for env vars: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` use `Number.isFinite()` check
- mtime fallback: entries missing timestamp fields default to current time via `mtime || Date.now()`
- Eviction preview log: `console.error` outputs deleted entries BEFORE deletion
- **Access count wired**: `incrementLTMAccessCount()` in `contextual-memory.cjs` increments `accessCount` on search hit
- Utility calculation: combines `accessCount` with time decay for eviction priority (highest utility kept, lowest evicted)

**Why This Matters**:

- Cap-based prevents mass extinction (threshold-based could wipe all LTM in single pass)
- NaN guards prevent silent calculation failures that corrupt eviction decisions
- mtime fallback prevents crash on malformed entries
- Access count enables utility-based eviction (previously all entries had equal utility)

**Multi-LLM Review** (Gemini + Codex):

- Identified mass extinction bug (threshold-based eviction)
- Identified NaN propagation risk in decay calculations
- Validated cap-based approach is correct
- Confirmed access_count wiring complete

**Files Modified**:

- `.claude/lib/memory/memory-pruner.cjs` (eviction logic)
- `.claude/lib/memory/contextual-memory.cjs` (access_count increment)
- `.claude/lib/memory/memory-manager.cjs` (NaN guards)

- Created new agent: qa-guardian (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

---

## LTM Eviction & Access Count Pattern (2026-03-03)

**Pattern**: LTM eviction changed from threshold-based to cap-based. Evicts lowest-utility entries only when `files.length > LTM_MAX_FILES`.

**Implementation**:

- Eviction is cap-based: `const needToEvict = files.length - LTM_MAX_FILES` (only evicts when threshold exceeded)
- NOT threshold-based: no longer wipes all entries when any age past 180 days
- NaN guard added for env vars: `LTM_DECAY_FACTOR`, `LTM_EVICTION_THRESHOLD`, `LTM_MAX_FILES` use `Number.isFinite()` check
- mtime fallback: entries missing timestamp fields default to current time via `mtime || Date.now()`
- Eviction preview log: `console.error` outputs deleted entries BEFORE deletion
- **Access count wired**: `incrementLTMAccessCount()` in `contextual-memory.cjs` increments `accessCount` on search hit
- Utility calculation: combines `accessCount` with time decay for eviction priority (highest utility kept, lowest evicted)

**Why This Matters**:

- Cap-based prevents mass extinction (threshold-based could wipe all LTM in single pass)
- NaN guards prevent silent calculation failures that corrupt eviction decisions
- mtime fallback prevents crash on malformed entries
- Access count enables utility-based eviction (previously all entries had equal utility)

**Multi-LLM Review** (Gemini + Codex):

- Identified mass extinction bug (threshold-based eviction)
- Identified NaN propagation risk in decay calculations
- Validated cap-based approach is correct
- Confirmed access_count wiring complete

**Files Modified**:

- `.claude/lib/memory/memory-pruner.cjs` (eviction logic)
- `.claude/lib/memory/contextual-memory.cjs` (access_count increment)
- `.claude/lib/memory/memory-manager.cjs` (NaN guards)

- Created new agent: ptest-agent (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-06)

- Created new agent: contract-check (2026-03-06)

- Created new agent: bool-action (2026-03-06)

- Created new agent: repo-onboarder (2026-03-06)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-06)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-06)

- Updated workflow: evolution-workflow (2026-03-06)

- Updated workflow: missing-workflow-xyz (2026-03-06)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-07)

- Created new agent: contract-check (2026-03-07)

- Created new agent: bool-action (2026-03-07)

- Created new agent: repo-onboarder (2026-03-07)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-07)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-07)

- Updated workflow: evolution-workflow (2026-03-07)

- Updated workflow: missing-workflow-xyz (2026-03-07)

- Created new agent: qa-guardian (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

- Created new agent: qa-guardian (2026-03-08)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-08)

- Created new agent: contract-check (2026-03-08)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-08)

- Created new agent: bool-action (2026-03-08)

- Created new agent: repo-onboarder (2026-03-08)

- Updated workflow: evolution-workflow (2026-03-08)

- Updated workflow: missing-workflow-xyz (2026-03-08)

## TDD for AI Agent Systems (2026-03-08)

- Property-based testing (fast-check) is top gap: routing/matching invariants untested across input space
- Mutation testing (Stryker incremental) recommended for hooks; security-critical hooks need >90% mutation score
- Contract testing (Pact pattern) for TaskUpdate schema: no formal agent-to-agent boundary contracts
- Probabilistic assertions needed for LLM routing tests: assert N/M correct, not exact match
- tdd SKILL.md needs: probabilistic assertions section, contract testing, mutation gate for P0 paths
- Report: .claude/context/reports/qa/tdd-research-2026-03-08.md
