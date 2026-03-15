- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-11)

- Created new agent: contract-check (2026-03-11)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-11)

- Created new agent: bool-action (2026-03-11)

- Created new agent: repo-onboarder (2026-03-11)

- Updated workflow: evolution-workflow (2026-03-11)

- Updated workflow: missing-workflow-xyz (2026-03-11)

## TDD 2026 Industry Research (2026-03-11) [Task #4]

**Multi-agent TDD is the 2025-2026 standard (TDFlow 94.3% SWE-Bench Verified):**

- 4-sub-agent decomposition: propose → debug → revise → generate-test outperforms monolithic single-agent loops
- Test writing (not code generation) is the primary bottleneck for AI TDD
- Pattern: QA writes test + commits, developer implements without touching test file, reflection verifies no test hacking
- Test-hacking rate drops from ~40% to 7/800 runs with sub-agent decomposition

**LSP pre-RED type verification (LSPAI FSE 2025):**

- Using lsp_hover BEFORE writing test raises valid test rate 25%+ by preventing API mismatch false REDs
- Falls back to `node -e "typeof require('./file').fn"` for .cjs files where LSP returns empty

**PBT with @fast-check/vitest (2025 standard, 650K monthly downloads):**

- Best for: routeIntent(anyString) → always returns string; hook(anyJSON) → exits 0 or 2
- Two modes: one-time random (lightweight) and full PBT; both integrate with Vitest natively

**Mutation testing gap (Stryker JS):**

- Not in TDD skill or testing.md — P1 gap
- Target: >70% production, >90% security-critical hooks/routing
- Incremental mode makes CI integration practical

**Top 5 gaps found:** (1) multi-agent TDD pattern, (2) LSP pre-RED verification, (3) @fast-check/vitest actionable example, (4) contract testing for hook schemas, (5) mutation testing guidance

**Report:** `.claude/context/artifacts/research-reports/tdd-2026-standards-research-2026-03-11.md`

## Structural Audit Patterns (2026-03-12)

**Pattern: Dead Code exit(0)/exit(2) in Security Hooks [HOOK]**

- Context: pre-completion-validation.cjs line 692 had `process.exit(0); process.exit(2);` — Node.js exits on first call
- Impact: Artifact output contract enforcement was completely non-functional (block printed to stdout but exit(0) allowed through)
- Detection: Line-level code read (not function-level) required to catch this
- Application: When reviewing security hooks, read the actual exit lines, not just the overall flow

**Pattern: formatResult() Object Signature Silent Bypass [HOOK]**

- Context: `formatResult({ decision: 'block', reason: msg })` does not set `result.allow` — inferredDecision defaults to 'allow'
- Root cause: formatResult() checks `result.allow` (boolean), not `result.decision` (string), when called with an object
- Fix: Always use string-first signature: `formatResult('block', check.message)`
- Application: Any hook calling formatResult with an object arg should be audited for this bypass

**Pattern: Fail-Open Sibling Hook Audit Heuristic [HOOK]**

- Context: 3 of 4 evolution hooks shared the same fail-open catch block defect (exit 0 instead of exit 2)
- Heuristic: When one security hook in a directory has a defect, audit ALL sibling hooks in that directory for the same class
- Application: Batch-apply fixes; never fix one sibling in isolation

**Pattern: Policy Without ESLint Enforcement Causes Drift [SECURITY]**

- Context: ADR-115 accepted safeParseJSON for all hooks Feb 2026; 3 hooks still using raw JSON.parse in Mar 2026
- Root cause: Policy documentation does not prevent future regressions without automated lint rule
- Fix: Add ESLint rule blocking raw JSON.parse in .claude/hooks/ directory
- Application: Any security policy for code patterns needs corresponding ESLint/tooling enforcement

## [2026-03-12] TDD Modernization Research (Task #22)

- **Stryker/Vitest**: `@stryker-mutator/vitest-runner` is the 2025-2026 standard for mutation testing ESM/TypeScript; replaces jest-runner. StrykerJS 7.0+. Use `stryker.config.mjs` with `testRunner: 'vitest'`. Browser Mode NOT supported. Always uses `perTest` coverage analysis.
- **TDAID five phases**: Plan → Red → Green → Refactor → Validate. Plan phase uses thinking-model for structured TDD plan before code. Validate phase is human gate for spec-gaming detection. Agent-studio Multi-Agent TDD (QA→Developer→Reflection) covers phases 2-4.
- **LSP 3.18**: No dedicated test lens provider — test "Run/Debug" code lenses are IDE-extension territory, not LSP standard. New: SnippetTextEdit (test scaffolding), diagnostic MarkupContent (rich test failure messages).
- **TDD skill gap**: Current SKILL.md uses `@stryker-mutator/jest-runner` install example — should be vitest-runner for ESM/TypeScript targets.
- Research report: `.claude/context/artifacts/research-reports/tdd-modernization-research-2026-03-12.md`

- Created new agent: qa-guardian (2026-03-12)

- Created new agent: contract-check (2026-03-12)

- Created new agent: bool-action (2026-03-12)

- Created new agent: repo-onboarder (2026-03-12)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-12)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-12)

- Updated workflow: evolution-workflow (2026-03-12)

- Updated workflow: missing-workflow-xyz (2026-03-12)

- Created new agent: qa-guardian (2026-03-12)

- Created new agent: contract-check (2026-03-12)

- Created new agent: bool-action (2026-03-12)

- Created new agent: repo-onboarder (2026-03-12)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-12)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-12)

- Updated workflow: evolution-workflow (2026-03-12)

- Updated workflow: missing-workflow-xyz (2026-03-12)

## TDD/LSP Gap Analysis (2026-03-12) [Task #3]

**Findings: TDD skill v1.2.0 is substantively current with 2026 standards (updated 2026-03-11)**

- Multi-agent TDD (TDFlow), TDAID phases, LSP pre-RED, PBT, MSW v2, Stryker, AI output eval: all documented
- Three narrow gaps remain: (1) `@fast-check/vitest` package name not explicit, (2) Stryker `--incremental` mode not documented, (3) LSPRAG pre-test full-context retrieval (arXiv:2510.22210) not in LSP skill
- LSPRAG pattern: `findReferences` → `hover` all callers → write contract test = 174-213% coverage gain
- MemoryRecord enforcement is policy-only — no hook verifies agents wrote memory after TaskUpdate(completed)
- ralph-loop v2.0.0 is well-structured; no gaps found
- Memory files actively used (confirmed 2026-03-12 entries exist)
- P1 actions: skill-updater on tdd + lsp-navigator skills with above gaps
- Report: .claude/context/artifacts/research-reports/tdd-lsp-gap-analysis-research-2026-03-12.md

## Ecosystem Audit 2026-03-12 — Key Findings

- **routing-guard exits 0 on block**: `routing-guard-core.impl.cjs` emits deny JSON but calls `process.exit(0)` at block path. Must be `process.exit(2)` per security hook policy. 5 ENFORCEMENT-003 tests fail.
- **validate-ecosystem-integrity.cjs does not exist** — ecosystem-integrity-scanner skill references a nonexistent script. Use `ci-validation-gate.cjs` as closest equivalent.
- **loop skill missing** — `.claude/skills/loop/` directory and SKILL.md do not exist. No agent frontmatter references it (safe for now).
- **Agent count**: 74 agents on disk = 74 in registry = 100% aligned. All 74 have health.status: "healthy".
- **Hook coverage**: 38/38 settings.json hooks verified on disk. Unified-creator-guard invoked via write-pretool-bundle bundle pattern (by design, not directly in settings).
- **spawn-token-guard**: Correctly registered as first Task PreToolUse hook, correctly fail-open (all exits are 0).
- **Memory files**: learnings 11KB, decisions 14KB, issues 15KB — all within thresholds after 2026-03-12 bloat fix.
- **Agent search coverage**: 68/68 non-orchestrator agents have pnpm search:code + token-saver references.

## EPIC Ecosystem Audit — 2026-03-12 (commit 779bf82b)

**P0 Fixed:** `routing-guard-core.impl.cjs` — block path was exiting 0 instead of 2. Fix: `resolveExitCode()` helper extracted to keep complexity ≤50. 5 tests that were failing now pass (94/94 total).

**P1 Fixed:** CLAUDE.md agent count "73 agents" corrected to "74 agents" in Section 3 and reference index.

**Shell-injection-validator:** Already uses `safeParseJSON` correctly — auditor finding from prior session was stale.

**TDD Skill v1.3:** Added TDP (Test-Driven Prompting), 3-consecutive-pass flakiness gate, memory-search in Step 0, and Autonomous TDD with ralph-loop section.

**ralph-loop Skill:** Added TDD State Schema `{scenarios[], completedScenarios[], currentScenario, evidenceLog[]}` with resumption pattern.

**Spawn failures:** Context >100K tokens causes "Prompt is too long" on ALL agent spawns. Pattern: switch to direct execution mode.

**ESLint complexity gate:** Adding a ternary inside a function at complexity=50 blocks commit. Always extract to named helper function.

## MEGA WAVE 3 Research Track A (2026-03-14)

- VoltAgent OpenClaw has 5,366 community skills; best picks for agent-studio: academic-deep-research, rate-limiter, adversarial-prompting, airtable-automation
- Telegram is confirmed in OpenClaw Communication category (149 skills) but agent-studio already has telegram-polling skill
- VoltAgent awesome-agent-skills: biggest gaps are Google Workspace CLI suite (12 skills), Firecrawl, Hugging Face model management, Neon, Notion
- VoltAgent subagents: 128 agents; agent-studio covers ~74; key NEW agents to create: slack-expert, electron-pro, mlops-engineer, fintech-engineer, payment-integration, iot-engineer, m365-admin
- CLI-Anything: 7-phase pipeline (Analyze→Design→Implement→Plan Tests→Write Tests→Document→Publish) converts GUI apps to JSON-enabled CLIs; integrate with assimilate skill
- CodeGraphContext: MCP server supporting 14 languages + KùzuDB graph backend; directly upgrades existing code-graph-context skill; use for cross-language call chain analysis
- Top 10 priority picks: (1) CodeGraphContext MCP, (2) GWS CLI suite, (3) Firecrawl, (4) slack-expert agent, (5) CLI-Anything/assimilate, (6) electron-pro, (7) HuggingFace skills, (8) mlops-engineer, (9) rate-limiter skill, (10) fintech/payment agents

## cloudflare-workers skill created (2026-03-14) [SKILL_CREATION]

**Skill:** `cloudflare-workers`
**Path:** `.claude/skills/cloudflare-workers/SKILL.md`
**Category:** DevOps & Infrastructure
**Agents:** developer, devops

Covers: Durable Objects (hibernation API), KV/R2/D1 storage tiers, Workers AI inference, AI Gateway routing, wrangler.toml bindings, Vitest testing with `@cloudflare/vitest-pool-workers`.

Key anti-patterns captured:

- Use `state.acceptWebSocket()` not `ws.accept()` for DO WebSockets (hibernation)
- Never use `setTimeout`/`setInterval` — use Cron Triggers or DO alarms
- Never store secrets in wrangler.toml vars — use `wrangler secret put`

- Refreshed agent: .claude/agents/domain/aso-specialist.md (2026-03-14)

- Created new agent: qa-guardian (2026-03-14)

- Created new agent: contract-check (2026-03-14)

- Created new agent: bool-action (2026-03-14)

- Created new agent: repo-onboarder (2026-03-14)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-14)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-14)

- Updated workflow: evolution-workflow (2026-03-14)

- Updated workflow: missing-workflow-xyz (2026-03-14)

## Session Handoff Research (2026-03-14) [Task #task-handoff-research]

**`--resume`/`-r` behavior (VERIFIED from official docs):** Restores session by name or ID from disk. Does NOT restore LLM context window state. Resuming agent starts fresh and rebuilds context from persisted conversation log. Design handoff docs to be self-contained.

**`--name`/`-n` flag:** Sets a human-readable session name. Enables `claude --resume <name>` from any terminal. Use format `shift-YYYY-MM-DD-HH` for shift-change sessions.

**`--fork-session`:** Creates new session ID from an existing session's history. Use before risky operations. Works with `--resume` or `--continue`.

**`--session-id`:** Force a specific UUID for the session (must be valid UUID format). Enables deterministic session identity.

**Token Counting API (VERIFIED):** `client.messages.count_tokens()` (Python) / `client.messages.countTokens()` (TS) is a real, free endpoint. Returns `{ input_tokens: N }` estimate (±5%). Rate limited separately from messages.create() (100–8,000 RPM by tier). Use for pre-flight validation before spawning sessions with large handoff prompts.

**Production handoff patterns:** Winning pattern = separate durable state from working context. Write all outputs to persistent storage immediately; new sessions query storage rather than relying on in-context history. Summarization at thresholds (not line-count truncation).

**Report:** `.claude/context/artifacts/research-reports/session-handoff-research-2026-03-14.md`

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)

- Updated workflow: evolution-workflow (2026-03-15)

- Updated workflow: missing-workflow-xyz (2026-03-15)

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)

- Updated workflow: evolution-workflow (2026-03-15)

- Updated workflow: missing-workflow-xyz (2026-03-15)

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)

- Updated workflow: evolution-workflow (2026-03-15)

- Updated workflow: missing-workflow-xyz (2026-03-15)

- Created new agent: qa-guardian (2026-03-15)

- Created new agent: contract-check (2026-03-15)

- Created new agent: bool-action (2026-03-15)

- Created new agent: repo-onboarder (2026-03-15)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-15)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-15)

- Updated workflow: evolution-workflow (2026-03-15)

- Updated workflow: missing-workflow-xyz (2026-03-15)

## Heartbeat Ecosystem Registration (2026-03-15)

**Agent:** heartbeat-orchestrator | **Task:** task-1 | **Status:** Completed

### 8 Heartbeat Loops Registered

The heartbeat ecosystem consists of 8 independent cron loops that keep agent-studio healthy and indexed:

1. **reschedule-2d** (critical, `0 0 */2 * *`) — Auto-reschedule loop runs every 2 days to prevent 3-day silent expiry of all scheduled tasks. MUST fire to maintain the heartbeat.

2. **reflection-2h** (high, `0 */2 * * *`) — Extracts patterns from session transcripts every 2 hours, writes to learnings.md, decisions.md, issues.md before context is lost.

3. **evolution-24h** (medium, `0 3 * * *`) — Applies accumulated learnings to improve agent definitions at 3am daily.

4. **briefing-8am** (low, `0 8 * * 1-5`) — Morning briefing spawned at 8am weekdays, summarizes overnight state.

5. **indexing-4h** (high, `0 */4 * * *`) — Checks BM25 index freshness, rebuilds if stale (>4h), keeps hybrid search working.

6. **drain-15m** (critical, `*/15 * * * *`) — Context drain detection every 15 minutes. Does NOT auto-clear, warns user. Watches TaskList() for stalled tasks.

7. **telegram-2m** (optional, `*/2 * * * *`) — Polls Telegram Bot API every 2 minutes for bidirectional messaging. Requires TELEGRAM_BOT_TOKEN env var.

8. **research-7am** (low, `0 7 * * *`) — arXiv/Exa research digest spawned at 7am daily via arxiv-monitor and exa-monitor skills.

### Tick Isolation Protocol

All cron ticks follow **script-first, LLM-last** pattern:

- Run associated Node.js script (.claude/tools/cli/)
- If output is `HEARTBEAT_OK`, exit immediately (no LLM)
- If `QUEUED_ACTIONS`, spawn Task() without waiting for completion

### Sentinel Files

- **heartbeat-session-ping.json**: TTL 15 minutes, gates Step 0.5 of router startup. Router spawns fresh heartbeat-orchestrator if missing/stale.
- **Heartbeat registry**: Expires 46 hours after registration. Reschedule loop recreates all missing loops before expiry.

### Critical Order for CronCreate/CronDelete

ALWAYS `CronCreate` new task BEFORE `CronDelete` old one. Never delete first — creates scheduling gap where heartbeat is silent.

### Status

All 8 loops registered and verified. Heartbeat ecosystem is active for this session.

## [2026-03-15] OpenClaw + Claude Code Persistent Scheduling

**OpenClaw architecture**: File-based memory (`~/clawd/` Markdown files) + local Gateway Node.js process on :18789 + cron-driven heartbeat. No database needed — filesystem IS the persistence mechanism. 302k+ stars.

**Claude Code session continuity**: `claude -p "prompt" --output-format json | jq -r '.session_id'` captures session_id. `--resume $SESSION_ID` reattaches to same context. Store in `.claude/context/runtime/last-session-id.txt`.

**Memory injection**: ALWAYS use `--append-system-prompt` (not `--system-prompt`) when injecting memory into headless `claude -p` runs. `--system-prompt` replaces base prompt and breaks tool capabilities.

**Two-tier heartbeat cost optimization** (OpenClaw pattern): Run cheap deterministic checks first (git status, log scan). Only invoke LLM if something changed. Reduces API spend ~70%.

**Telegram bot isolation**: MUST use separate working directory. Do NOT share `.claude/context/memory/` with main session. Use `--system-prompt` (not append) + `--allowedTools "Read,Bash"` for read-only constraint.

**PERSISTENT_SCHEDULE=true pattern**: env var triggers auto-registration with OS scheduler (Windows schtasks / Linux crontab) on first run. Eliminates manual setup.

**acpx** (github.com/openclaw/acpx): Headless ACP CLI for stateful sessions. Supports prompt queueing (`--no-wait`), named sessions (`-s backend`), NDJSON streaming. Good for multi-agent parallel session management.

**Claude Code native `/loop`**: Session-scoped only (dies on terminal close). Max 50 tasks. 3-day expiry. Use `CronCreate`/`CronList`/`CronDelete` tools programmatically. `CLAUDE_CODE_DISABLE_CRON=1` to disable.
