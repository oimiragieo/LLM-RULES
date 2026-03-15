<!-- Agent: context-compressor | Task: task-prune-learnings | Session: 2026-03-15 -->

# Archived Learnings (Pre-2026-03-11)

This archive contains learnings from 2026-03-10 and earlier. Current learnings moved to parent `.claude/context/memory/learnings.md`.

## Telegram Claude Bridge — Headless PATH Fix (2026-03-15) [INTEGRATION]

**Task**: Task 1 supplemental — permanent Telegram pipeline fix (commit e3ab739b)

**Root cause**: `telegram-poll.cjs` called `claude` binary via CLI dispatch but the binary was not on PATH in headless cron context. The process ran under the cron user environment where `~/.local/bin` or npm global bin was not in PATH.

**Fix pattern**:

- Created `.claude/tools/cli/telegram-claude-bridge.cjs` with auto-detection: `resolveClaude()` uses `where claude` (Windows) / `which claude` (Unix) at startup rather than assuming PATH availability
- Wired bridge at 3 dispatch sites in `telegram-poll.cjs` via `invokeClaude()`/`sendTyping()`/`handleAsk()`
- Added ESLint `max-lines` override for telegram CLI files (650 line limit) — large CLI files legitimately exceed 300-line default
- Documented in `.claude/docs/TELEGRAM_ARCHITECTURE.md`
- `.env.example` updated with `CLAUDE_CLI_PATH` documentation for manual override

**Gotcha**: When spawning CLI tools from cron/headless contexts on any platform, never assume PATH includes user-installed binaries. Use `where`/`which` auto-detection at runtime + `CLAUDE_CLI_PATH` env var override as escape hatch.

**Anti-pattern**: Hard-coding `claude` as the command string in `spawn()` calls for headless contexts. The cron daemon and service accounts often have minimal PATH (`/usr/bin:/bin` only).

---

## autoresearch Integration — Agent Count at 80 (2026-03-14) [FRAMEWORK]

**Event**: karpathy/autoresearch integrated. Commit 49015b79 + ceee6b1a.

**New artifacts**: `ml-experiment-loop` skill (stub → v2.0.0, 330 lines), `ml-experiment-standards.md` rule, `autoresearch` command + templates (prepare.py, train.py, program.md, pyproject.toml). Agent registry: **80 total** (was 79). Skill index: 299.

**Key patterns introduced**:

- Fixed-budget experiment protocol (5-min wall-clock budget, single scalar metric)
- Git-based keep/discard (branch per tag, commit per experiment, `git reset --hard HEAD~1` on discard)
- Context-window-safe log handling (redirect to file, targeted grep — NEVER cat)
- NEVER STOP autonomy (human controls by interruption, not permission gates)
- Simplicity criterion for keep/discard (prefer simpler code over marginal metric gains)

**Security**: External content (MIT) passed 6-point security audit before integration: size, binary, tool invocation, prompt injection, exfiltration, privilege scan — all PASS.

---

## MEGA EPIC Completion — Ecosystem Assimilation (2026-03-13)

**Task**: Task #1 — 17 repos assimilated, 75 agents (+1 legacy-modernizer), 282 skills, 2 commits (2046b614 + f5dec41e), 47 files touched.

**Pattern: Batch External Repo Assimilation at EPIC Scale**

- Successfully integrated content from 17 external repositories into agent-studio skill/rule/agent ecosystem
- Key artifacts created: tts-generation, transcription, deep-research, browser-automation, vercel-deploy (updated), lsp-navigator (updated), legacy-modernizer agent, 5 rules (lancedb, supabase, playwright-testing, astro, solidjs), aso-specialist (updated)
- Rule count discrepancy: rule-index not updated — `pnpm index-rules` step was skipped by at least one rule-creator invocation. Count verification after batch creation is mandatory.
- QA gate (task #16) passed as final validation before commit — 75 agents, 282 skills confirmed.
- Agent count registry check is mandatory when agents are added — registry compliance tests expect exact count.

**Pattern: Temp File Hygiene for Developer/Integration Agents (IRON LAW)**

- Developer and testing agents consistently dump temp/debug scripts to the project root: `dump-test.cjs`, `errors.json`, `eslint.json`, `test-out.txt`, `rename_agent.cjs`, etc.
- **IRON LAW**: ALL temporary scripts, logs, and CLI output dumps MUST go to `.claude/context/tmp/` OR your system's `tmp/` equivalent.
- **IRON LAW**: NEVER leave one-off scripts or JSON dumps in the project root. The project root is considered a sacred production boundary.

---

## MEGA EPIC Phase 2 — Wave-Based Parallel Execution Pattern (2026-03-14)

**Session**: MEGA EPIC Phase 2 final (reflection-mega-epic-phase2-final)
**Result**: 100% plan completion + net-new capabilities. 76 agents (+1 nlp-engineer), 285 skills (+3: code-graph-context, security-scanning, design-systems). Score: 0.89 PASS.

**Pattern 1: Wave-Based Parallel Execution (2 agents max per wave)**

- 6 waves (2A-2F), each with exactly 2 parallel agents. Zero context overflow observed.
- IRON LAW confirmed: max 2 heavy agents per wave prevents context saturation (prior evidence: 4+ = overflow).

**Pattern 2: Devops Agent Cut-Off Pattern (5 occurrences)**

- Devops agents were cut off mid-commit 5 times. Resume pattern recovered all 5.
- Root cause: long devops prompts (merge + cleanup + commit) exceed context mid-execution.
- Fix: Spawn devops with single focused command (commit only or merge only, not both).

---

## Plan-File Update Enforcement — Triple-Anchor Pattern (2026-03-14)

**Task**: 21 — fix(protocol): enforce plan-file updates by executing agents (not router)
**Commit**: 3f7b7447 | **Score**: 0.892 PASS

**Pattern: Triple-Anchor Protocol Enforcement**

When enforcing a new behavioral protocol across the framework, anchor it in three places:

1. **Rule** (`.claude/rules/`) — the canonical spec with full detail (markers, timing, tools, anti-patterns)
2. **Template** (`.claude/templates/spawn/`) — propagates awareness to all future spawns automatically
3. **Rubric** (reflection-agent.md) — creates a feedback loop that scores compliance in future reflections

Without all three anchors, behavioral changes decay.

---

## EPIC Pipeline Context Overflow Prevention — Enforcement at Plan Time (2026-03-12)

**Pattern: Context-Compressor Gate Between EPIC Phases**

- Root cause: EPIC audit pipelines (22+ tasks, 3+ phases) saturate router context by Phase 3 even with max-4 concurrency cap
- Fix: Plans for EPIC+ pipelines MUST include explicit context-compressor spawn as a gate step between phases
- Fix: Max-concurrent cap for heavy analysis agents is 2 (not 4)
- Fix: Agent spawn prompts MUST require output to report files; return only file path + 5-bullet summary (max 500 chars)

---

## TDD + LSP Skills Modernized (2026-03-11)

- TDD skill v1.2.0 updated with 4 new sections: Test Runner Selection (node --test vs Vitest 4), AI Output Evaluation Testing (score-based + tool-call sequence validation), MSW v2 HTTP Mocking (API boundary tests), expanded Property-Based Testing
- LSP navigator skill updated with LSP 3.17 features section: inlayHint, prepareTypeHierarchy/supertypes/subtypes, goToDeclaration
- Pattern: score-based agent output evaluation (relevance/safety/faithfulness 0-1 dimensions, 0.75 overall threshold)
- node --test = CJS standard; Vitest 4 = ESM/TypeScript future standard

---

## Shift Change Context Handoff Research (2026-03-10)

**Pattern: Session handover log as stateful baton for LLM context continuity**

- "Finish-Only" drain mode maps to Kubernetes terminationGracePeriod + preStop hook lifecycle
- PID assassination (old session spawns successor, self-terminates) is precedented in Erlang hot code upgrades and Nginx graceful reload
- SOC shift handover log structure (open incidents, pending actions, memory pointers) is the correct template for LLM agent handover
- Key risk: context poisoning via handover log if freeform text is included — use strict JSON schema only
- Agent-studio existing spawn-token-guard.cjs (80K/120K thresholds) + TaskStateMachine SQLite are the correct substrate
- Report: .claude/context/artifacts/research-reports/shift-change-research-2026-03-10.md
