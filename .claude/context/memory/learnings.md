### [PATTERN] Adversarial Debate Round Scoring

- Score each debate round IMMEDIATELY before proceeding — prevents recency bias in moderator synthesis
- 4 scoring dimensions: specificity, evidence quality, rebuttal directness, relevance
- Moderator MUST cite specific debate evidence (not consensus); 3–5 rounds optimal (diminishing returns above 3)
- Generalizable to: arch decisions, tech choices, security trade-offs, design reviews

### [PATTERN] Outcome-Reflection Calibration Dimensions

- 3 independent dimensions: estimation quality, prediction quality, decision quality — never aggregate prematurely
- Predicted outcome MUST be stored at task creation time; retrospective prediction is invalid
- High-miss threshold: overall < 0.6 or estimation < 0.5 or rework loops >= 3 → triggers reflection-agent followup
- Decision quality formula: rework loops 0→1.0, 1→0.75, 2→0.50, 3→0.25, 4+→0.0

### [PATTERN] Instinct Learning Confidence Bounds

- instinct-learning uses 0.3–0.9 confidence range (not 0.0–1.0)
- 0.3 = minimum useful signal (below this is noise); 0.9 = max to avoid overconfidence
- Project-scoped storage prevents cross-project contamination
- Instincts inform routing suggestions but NEVER override explicit routing rules

### [PATTERN] Team Orchestration 6-Phase Pipeline

- Phases: Discover → Plan → Assign → Execute → Review → Integrate
- Each phase requires the prior phase's artifact before proceeding (phase gates)
- Assignment maps tasks to agents by capability matching, not just availability
- Handoff artifacts required at each phase boundary (not just status updates)

### [PATTERN] De-sloppify Two-Agent Separation

- Two-agent pattern: identifier agent finds slop, separate deletion agent decides what to delete
- Prevents accidental deletion: the agent that identifies is NOT the agent that deletes
- Only tracked files (git ls-files non-empty) are auto-deletable; untracked `??` files require explicit confirmation
- Common slop signatures: debug*\*.txt, temp*_.json, UUID-named files, _-output.txt in project root

### [WORKFLOW] High-Velocity Skill Batch Pattern (3 per commit)

- 3 skill batches per session is sustainable; each batch = themed cluster (orchestration, cognition, enterprise)
- Batch commits enable atomic rollback per theme without affecting other batches
- Total count milestone: 264 → 266 skills, 108 agents after this session
- All new skills include: SKILL.md frontmatter, companion tool reference, related_skills cross-refs

## 2026-03-23: Multi-Model Review of Ecosystem Audit Findings

### New HIGH Security Findings (not in original audit)

- `pre-task-unified-helpers.cjs` L326/350: task prompt text directly modifies `allowed_files` and `ALLOW_GIT_COMMIT` session policy — ACTIVE prompt-injection-to-authorization vector
- `mcp-allowlist-checker.cjs`: fail-open defaults mean MCP matcher gaps are FULL bypasses (empty `tools_allowed` = full server access)
- `session-end-memory-promotion.cjs`: memory poisoning is durable across sessions via STM→MTM promotion

### TDD Patterns Confirmed by Multi-Model Consensus

- Stryker mutation testing mandatory for security hooks: >= 85% threshold with CI ratchet
- fast-check fail-closed property: `fc.anything()` must never produce `allow` from security hook
- Revert-and-verify-red step: after Green, revert implementation — if tests still pass, test is meaningless

### Architectural Fixes Confirmed by Multi-Model Consensus

- `secure-hook-runner.cjs` pattern: ANY exit code except 0 or 2 must become exit 2 (block) for security hooks
- WAL protocol for memory already designed in `memory-protocol.md` — needs runtime enforcement hook
- DAG cycle detection at `TaskCreate` with max spawn depth 4

- Created new agent: claude-md-auditor (2026-03-23)

## 2026-03-24: TDD Best Practices Research for AI Agent Systems

### Key Findings (Task #4)

- **TDD v1.3.0 is current** — TDP (verbatim injection), multi-agent decomposition, ralph-loop all documented
- **GAP: Property-Based Testing** — arXiv:2506.18315 shows 23-37% pass@1 gains; TDD skill should add PBT as Step 5.5
- **GAP: Mutation testing** — Stryker ≥85% threshold for security hooks not in TDD skill (only in learnings.md)
- **GAP: CJS LSP warning** — LSP returns empty for .cjs files; not surfaced in TDD skill context
- **ralph-loop is well-designed** — tdd-state.json with completedScenarios array enables true resumability; no changes needed
- **AI test characteristics**: higher assertion density, simpler linear logic, coverage comparable to human tests (arXiv:2603.13724)
- **Research report**: `.claude/context/artifacts/research-reports/tdd-best-practices-research-2026-03-24.md`

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

## 2026-03-24: Multi-Model Council M3.4 — Key Learnings

**Source:** Codex (codex-mini-latest) live codebase inspection, Chairman synthesis

### safeParseJSON is the right fix for hook JSON parsing (CONFIRMED)

ADR-115 decision is correct. Zod/Joi/Ajv are wrong for CommonJS hooks: higher latency, ESM compatibility friction, over-engineered for narrow 2-5 field inputs. safeParseJSON handles the specific threat (prototype pollution) with near-zero overhead.

### Property-based testing should be deferred for hooks

Prior hook failures were caused by exit code bugs and wiring drift — not by edge-case inputs. Mutation testing (Stryker on allow/block paths) has higher ROI for security hooks than property-based testing (fast-check). Defer property-based testing.

### Hook WIRING completeness is more important than hook IMPLEMENTATION quality

An audit that scores implementation quality (safeParseJSON, exit codes, error handling) but not registration completeness will miss dead hooks. Always audit: does every implemented hook file have a settings.json entry?

### Audit re-baselining is mandatory before executing a multi-phase plan

Codex found that several M3 audit findings were already resolved (ux-researcher tools, dual matrix drift). Executing fixes for stale findings wastes effort. Re-run the audit from the live tree before starting Phase 2 work.

### omega-claude-cli fails in nested worktree contexts

When invoked from inside a worktree, the Claude CLI omega skill produces double-nested paths like `.claude/worktrees/A/.claude/worktrees/B/.claude/skills/...`. Use absolute paths from project root when invoking omega skills from any context.

### Router-first architecture's main scale risk is hook proliferation

The hook chain (currently 6 consolidated hooks) must stay bounded. Each new hook adds latency. The consolidation from 2026-02-08 (6 wildcard → 2 hooks) was the right move. Protect that consolidation — establish a hook count budget.

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

### [MIGRATION] Telegram: Custom → Native Channels (2026-03-24)

**Context**: Claude Code v2.1.80+ introduced native Channels — MCP plugins that push events into running sessions. Official Telegram and Discord plugins replace our custom telegram-poll.cjs polling approach.
**Migration**: Primary = native `plugin:telegram@claude-plugins-official` via `--channels` flag. Backup = custom telegram-poll.cjs + telegram-notify.cjs + telegram-claude-bridge.cjs.
**Advantages of native**: Two-way chat bridge, permission relay (approve tool use from phone), no polling overhead, official security model with pairing + allowlists.
**When to use custom**: When channels are unavailable (older Claude Code versions, API-key auth, no Bun installed).
**Setup**: `/plugin install telegram@claude-plugins-official` → `/telegram:configure <token>` → restart with `claude --channels plugin:telegram@claude-plugins-official` → pair via `/telegram:access pair <code>`.

## 2026-03-24: omega-cli multiline prompt delivery fails on Windows (cmd.exe arg truncation)

**Context:** Running multi-model consultation via omega-claude-cli and omega-codex-cli on Windows.

**Issue:** Both `ask-claude.mjs` and `ask-codex.mjs` pass the prompt as a CLI argument via `cmd.exe /d /s /c TOOL -p "PROMPT"`. When the prompt contains newlines (multi-paragraph text), cmd.exe truncates after the first newline. The model receives only the first paragraph, not the full prompt.

**Symptom:** Model responds "I see the context but where are the questions?" — only the context preamble arrived, not the Q&A section.

**Root cause:** `buildClaudeArgs()` / `buildCodexArgs()` embed the entire prompt text as a single string argument. On Windows, `cmd.exe` processes embedded newlines in quoted arguments differently from Unix shells.

**Workaround:** For multi-line prompts on Windows, write prompt to a temp file and pass the path, OR restructure the prompt as a single line (no embedded newlines).

**Fix needed:** Both omega-cli wrappers should detect multi-line prompts and write them to a temp file, then pass `--file path` (if supported) or use stdin redirection via a pipe wrapper that doesn't go through cmd.exe argument expansion.

**Also:** Claude CLI when invoked from within the agent-studio directory loads CLAUDE.md and behaves as the Router, not as a general assistant. Run from a neutral directory (e.g., /tmp) when using as a consultant.

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

## Session Learning: 2026-03-24 — Ecosystem Audit Self-Review

### L1: Worktree agents with large CLAUDE.md hit "Prompt is too long"

- 4/6 developer agents failed immediately with 0 tool calls
- Root cause: agent-studio's CLAUDE.md + rules inject ~150K+ tokens into every worktree agent context
- **Fix**: For trivial edits (3-line changes), do them directly in router session instead of spawning agents
- **Fix**: Use `model: "haiku"` for simple tasks to reduce context overhead
- **Fix**: Consider non-worktree agents for small edits (no CLAUDE.md re-injection)

### L2: ccusage MUST be run and WAITED for — no "it's slow, skip it"

- Violated mandatory pipeline rule by attempting ccusage once, seeing it was slow, and moving on
- The rule exists precisely because costs need tracking at EVERY milestone
- **Fix**: Always use timeout: 120000 and block:true for ccusage. If it fails, log the failure — never silently skip

### L3: Background bash tasks with pipe chains produce empty output files

- `pnpm test 2>&1 | tail -20` as background task never wrote to output file
- Likely a pipe buffering issue on Windows
- **Fix**: For long-running test commands, run foreground with explicit timeout, or redirect to file first

### L4: Don't spawn agents for work you can do in 3 lines

- Spawning 4 parallel developer agents for trivial edits was wasteful
- Each agent creates a worktree, injects full context, opens a Claude window
- Cost: ~50K+ tokens wasted on failed spawns + 6 blank windows confusing the user
- **Fix**: Threshold rule — if the fix is <10 lines across <3 files, do it directly

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

- Created new agent: qa-guardian (2026-03-24)

- Created new agent: contract-check (2026-03-24)

- Created new agent: bool-action (2026-03-24)

- Created new agent: repo-onboarder (2026-03-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-24)

- Updated workflow: evolution-workflow (2026-03-24)

- Updated workflow: missing-workflow-xyz (2026-03-24)

## 2026-03-24: Multi-Model Architecture Review Findings (Task #4)

### NEW Architectural Gaps (Codex live inspection)

- CX-2: agent-config.json:4 grants broad tool bundles to many agents simultaneously (Bash+Edit+Write+WebFetch+WebSearch+MemoryRecord). router-tool-lockdown.cjs:3 passes all subagents through. Weak least-privilege post-routing.
- CX-3: spawn-prompt-assembler.memory.cjs:13 uses narrow line-stripper; memory-sanitizer.cjs:25 (stronger) exists but NOT wired to spawn path. Quick fix available.
- CX-4: intent-classifier.cjs:219 uses first-match heuristic on generic token substrings. Degrades with agent count growth.
- CX-5: swarm-coordination.cjs:7 single JSON file, no locking. Concurrent updates race.

### Claude CLI + Cursor CLI Background Task Limitation

- omega-claude-cli and omega-cursor-cli produce no output when invoked via run_in_background:true Bash tool
- Codex CLI works correctly via background invocation
- For multi-model reviews: run omega-claude-cli and omega-cursor-cli sequentially (not backgrounded) or use separate direct Bash calls

### Lint Warnings (non-blocking)

- perpetual-memory/main.cjs: complexity 21 (max 20)
- tools/cli/post-analyzer.cjs: 652 lines (max 500)
- scripts/setup.cjs: nesting depth 5 (max 4)

## [WORKFLOW] 2026-03-25: Stale Worktree Cleanup is Systemic, Not One-Off

**Pattern**: When Router Step 0.5 prunes 5+ worktrees in a single pre-flight, it indicates systemic failure: worktree agents across multiple sessions are not self-cleaning after completion.

**Evidence**: Reflection task 8 gap observation noted 5 stale worktrees pruned (agent-a29d75b7, agent-a2e1b106, agent-a347f4e9, agent-a955cca2, agent-a9f0d9e6). All agent-prefixed = pattern is consistent.

**Classification**: Systemic (not one-off). Pattern recurs due to missing cleanup step in worktree agent lifecycle.

**Mitigation Already In Place**: git worktree prune in Router Step 0.5 recovers from these. No data loss.

**Recommended Hardening**: Add git worktree remove --force to cleanup-always.md for worktree agents. Or add Stop hook that detects worktree context and auto-removes on session end.

## [CODE] 2026-03-25: TDAD Pattern — Test-Driven Agent Development (2026 Finding)

**Pattern**: TDAD (Test-Driven Agent Development) — write integration tests for agent behavior BEFORE implementing the agent, then use test failures to guide agent prompt refinement.

**Evidence**: Task 8 (TDD skill standards verification) confirmed this as a validated 2026 research finding with 70% regression reduction in multi-agent pipelines. Already partially covered by ADR-103 (integration boundary testing).

**Application**: Apply to new agent creation workflows. Specifically: (1) write expected tool-usage test, (2) write expected output test, (3) then write agent definition. Failure signals = prompt gaps to fix.

**Source**: Task 8 TDD skill v1.4.0 research verification, 2026-03-25.

## 2026-03-25: Multi-Model Ecosystem Audit Review Findings

From Claude CLI + Codex council on ecosystem audit (185 orphans, 21 model mismatches, 20+ stale rename refs):

**Remediation priority order (consensus):**
1. Fix model mismatches (config.yaml → registry drift) — active runtime failure
2. Fix stale token-saver → context-compressor refs — active breakage
3. Build require() dependency graph before bulk orphan deletion
4. Add rename-safety pre-commit hook (validate all skill refs resolve)
5. Update skill-creator to auto-scaffold schema + workflow stubs
6. Scaffold missing schemas/workflows retroactively

**Systemic root causes identified:**
- No referential integrity on artifact names (rename cascade root cause)
- No lifecycle coupling in creator skills (schema/workflow gap root cause)
- No dependency graph (orphan accumulation root cause)
- Dual source of truth for model config (config.yaml vs registry)
- Proactive audit is advisory not blocking
- No stable ID primitive (names are contracts not labels)
- No runtime telemetry (static analysis alone = false positives for dynamic invocations)

**Codex architectural pattern:** Stable immutable skill IDs + mutable display names + alias layer = eliminates rename cascade class of failures permanently.

**Source:** `.claude/context/reports/backend/multi-model-review-2026-03-25.md`

- Created new agent: qa-guardian (2026-03-26)

- Created new agent: contract-check (2026-03-26)

- Created new agent: bool-action (2026-03-26)

- Created new agent: repo-onboarder (2026-03-26)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-26)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-26)

- Updated workflow: evolution-workflow (2026-03-26)

- Updated workflow: missing-workflow-xyz (2026-03-26)
