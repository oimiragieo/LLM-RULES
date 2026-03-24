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
