## Mission Mode Governance Repair (2026-03-16) [Task #23]

**Agent:** developer | **Status:** Completed

### Mission Orchestrator Implementation

The Mission Orchestrator components have been scaffolded and the baseline test runner verification system is active.

Key governance actions taken:

- Added `start-mission` workflow to `CLAUDE.md`, `WORKFLOW_CATALOG.md`, `workflow-registry.json`, and `@WORKFLOW_AGENT_MAP.md`.
- Added `system-health-check` skill to `@SKILL_CATALOG_TABLE.md` and registered it to the `master-orchestrator.md`.
- Added `mission/` templates to `templates/README.md` and `template-catalog.md` (`CONTINUATION_PLAN.md`, `INVARIANTS.md`, `ANTI_GOALS.md`).
- Established mapping between `start-mission` workflow and `master-orchestrator`.

---

## Model Selection Context Window Guidance (2026-03-16) [Task #21]**Pattern: Large-context routing threshold for opus model selection**

- Opus (1M context) is appropriate when executing agent may need >150K tokens in working context
- Concrete use cases: analysis of very large codebases (>150K source tokens), long document processing, ingestion-before-synthesis tasks
- Planner agents should explicitly recommend `model: 'opus'` in plan output when decomposing such tasks
- Router should set `model: 'opus'` explicitly in Task() call — do not rely on defaults for large-context loads
- Cross-reference: CLAUDE.md Section 8 memory budget thresholds (80K/120K/150K tokens) align with this guidance

**Issue to watch**: @MODEL_SELECTION.md now has two sets of model IDs — 4-6 IDs in Context Window table vs 4-5 IDs in Agent Config Examples. Verify `normalizeModel()` in agent-config-reader.cjs handles both.

---

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

---

## Ecosystem Audit 2026-03-12 — Key Findings

- **routing-guard exits 0 on block**: `routing-guard-core.impl.cjs` emits deny JSON but calls `process.exit(0)` at block path. Must be `process.exit(2)` per security hook policy. 5 ENFORCEMENT-003 tests fail.
- **validate-ecosystem-integrity.cjs does not exist** — ecosystem-integrity-scanner skill references a nonexistent script. Use `ci-validation-gate.cjs` as closest equivalent.
- **loop skill missing** — `.claude/skills/loop/` directory and SKILL.md do not exist. No agent frontmatter references it (safe for now).
- **Agent count**: 74 agents on disk = 74 in registry = 100% aligned. All 74 have health.status: "healthy".
- **Hook coverage**: 38/38 settings.json hooks verified on disk. Unified-creator-guard invoked via write-pretool-bundle bundle pattern (by design, not directly in settings).
- **spawn-token-guard**: Correctly registered as first Task PreToolUse hook, correctly fail-open (all exits are 0).
- **Memory files**: learnings 11KB, decisions 14KB, issues 15KB — all within thresholds after 2026-03-12 bloat fix.
- **Agent search coverage**: 68/68 non-orchestrator agents have pnpm search:code + token-saver references.

---

## EPIC Ecosystem Audit — 2026-03-12 (commit 779bf82b)

**P0 Fixed:** `routing-guard-core.impl.cjs` — block path was exiting 0 instead of 2. Fix: `resolveExitCode()` helper extracted to keep complexity ≤50. 5 tests that were failing now pass (94/94 total).

**P1 Fixed:** CLAUDE.md agent count "73 agents" corrected to "74 agents" in Section 3 and reference index.

**Shell-injection-validator:** Already uses `safeParseJSON` correctly — auditor finding from prior session was stale.

**TDD Skill v1.3:** Added TDP (Test-Driven Prompting), 3-consecutive-pass flakiness gate, memory-search in Step 0, and Autonomous TDD with ralph-loop section.

**ralph-loop Skill:** Added TDD State Schema `{scenarios[], completedScenarios[], currentScenario, evidenceLog[]}` with resumption pattern.

**Spawn failures:** Context >100K tokens causes "Prompt is too long" on ALL agent spawns. Pattern: switch to direct execution mode.

**ESLint complexity gate:** Adding a ternary inside a function at complexity=50 blocks commit. Always extract to named helper function.

---

## MEGA WAVE 3 Research Track A (2026-03-14)

- VoltAgent OpenClaw has 5,366 community skills; best picks for agent-studio: academic-deep-research, rate-limiter, adversarial-prompting, airtable-automation
- Telegram is confirmed in OpenClaw Communication category (149 skills) but agent-studio already has telegram-polling skill
- VoltAgent awesome-agent-skills: biggest gaps are Google Workspace CLI suite (12 skills), Firecrawl, Hugging Face model management, Neon, Notion
- VoltAgent subagents: 128 agents; agent-studio covers ~74; key NEW agents to create: slack-expert, electron-pro, mlops-engineer, fintech-engineer, payment-integration, iot-engineer, m365-admin
- CLI-Anything: 7-phase pipeline (Analyze→Design→Implement→Plan Tests→Write Tests→Document→Publish) converts GUI apps to JSON-enabled CLIs; integrate with assimilate skill
- CodeGraphContext: MCP server supporting 14 languages + KùzuDB graph backend; directly upgrades existing code-graph-context skill; use for cross-language call chain analysis
- Top 10 priority picks: (1) CodeGraphContext MCP, (2) GWS CLI suite, (3) Firecrawl, (4) slack-expert agent, (5) CLI-Anything/assimilate, (6) electron-pro, (7) HuggingFace skills, (8) mlops-engineer, (9) rate-limiter skill, (10) fintech/payment agents

---

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

---

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

---

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

---

## [2026-03-15] OpenClaw + Claude Code Persistent Scheduling

**OpenClaw architecture**: File-based memory (`~/clawd/` Markdown files) + local Gateway Node.js process on :18789 + cron-driven heartbeat. No database needed — filesystem IS the persistence mechanism. 302k+ stars.

**Claude Code session continuity**: `claude -p "prompt" --output-format json | jq -r '.session_id'` captures session_id. `--resume $SESSION_ID` reattaches to same context. Store in `.claude/context/runtime/last-session-id.txt`.

**Memory injection**: ALWAYS use `--append-system-prompt` (not `--system-prompt`) when injecting memory into headless `claude -p` runs. `--system-prompt` replaces base prompt and breaks tool capabilities.

**Two-tier heartbeat cost optimization** (OpenClaw pattern): Run cheap deterministic checks first (git status, log scan). Only invoke LLM if something changed. Reduces API spend ~70%.

**Telegram bot isolation**: MUST use separate working directory. Do NOT share `.claude/context/memory/` with main session. Use `--system-prompt` (not append) + `--allowedTools "Read,Bash"` for read-only constraint.

**PERSISTENT_SCHEDULE=true pattern**: env var triggers auto-registration with OS scheduler (Windows schtasks / Linux crontab) on first run. Eliminates manual setup.

**acpx** (github.com/openclaw/acpx): Headless ACP CLI for stateful sessions. Supports prompt queueing (`--no-wait`), named sessions (`-s backend`), NDJSON streaming. Good for multi-agent parallel session management.

**Claude Code native `/loop`**: Session-scoped only (dies on terminal close). Max 50 tasks. 3-day expiry. Use `CronCreate`/`CronList`/`CronDelete` tools programmatically. `CLAUDE_CODE_DISABLE_CRON=1` to disable.

---

## Multi-LLM Council: Architecture + Hook Security (2026-03-15)

- SEC-002 is a SILENT SECURITY NULL: hooks outputting {allow:false} but exiting 0 do NOT block anything. Claude Code uses exit code only. Any such hook is decorative, not enforcing.
- omega-claude-cli hits Windows cmd.exe 8191-char limit for long prompts. Workaround: pipe prompt via PowerShell `Write-Output $prompt | claude --dangerously-skip-permissions`
- Persistent worker consensus: Node.js daemon + NSSM (Windows) / systemd (Linux) + SQLite WAL queue. Never session-scoped. Worker must NOT require() from .claude/lib/ (framework paths change).
- Telegram claude -p per message: wrong for production. Pattern: lightweight intake → SQLite queue → tiered dispatch (SDK direct / minimal 500-token prompt / full Claude Code). Saves 100x tokens.
- Council report: .claude/context/reports/backend/multillm-review-2026-03-15.md

---

## Telegram Pipeline PATH Fix (2026-03-15) [Task #11, commit e3ab739b]

**Root cause**: `claude` binary not found in non-interactive cron/subprocess PATH. Cron environments strip PATH to `/usr/bin:/bin`; the `claude` binary (installed via npm global) is in `/usr/local/bin` or `~/.npm-global/bin`.

**Fix pattern (`resolveClaude()` in telegram-claude-bridge.cjs)**:

- Try `which claude` (or `where.exe claude` on Windows) to locate binary at runtime
- Fallback: `path.join(os.homedir(), '.npm-global', 'bin', 'claude')` and similar platform paths
- Always unset `CLAUDECODE` env var before spawning Claude from a cron/script context — Claude Code sets this env var and child processes detect it, refusing with "Nested sessions share runtime resources"

**Application**: Any background service (Telegram bot, cron job, webhook handler) that spawns `claude` must resolve the binary path dynamically and unset `CLAUDECODE`.

**Commit**: e3ab739b | **File**: telegram-claude-bridge.cjs

- Created new agent: task-manager (2026-03-16)
