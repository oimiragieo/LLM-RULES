# learnings Archive (2026-05-01)

## Session ccusage — 2026-04-20

| Date       | Models                          | Input  | Output  | Cache Read | Cache Write | Total Tokens | Cost    |
| ---------- | ------------------------------- | ------ | ------- | ---------- | ----------- | ------------ | ------- |
| 2026-04-20 | haiku-4-5, opus-4-7, sonnet-4-6 | 47,170 | 301,853 | 8,888,1xx  | 184,516xx   | 193,753xx    | $143.93 |

- Created new agent: qa-guardian (2026-04-21)

- Created new agent: contract-check (2026-04-21)

- Created new agent: bool-action (2026-04-21)

- Created new agent: repo-onboarder (2026-04-21)

- Created new agent: release-guardian (2026-04-21)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-21)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-21)

- Updated workflow: evolution-workflow (2026-04-21)

- Updated workflow: missing-workflow-xyz (2026-04-21)

- Created new agent: qa-guardian (2026-04-22)

- Created new agent: contract-check (2026-04-22)

- Created new agent: bool-action (2026-04-22)

- Created new agent: repo-onboarder (2026-04-22)

- Created new agent: release-guardian (2026-04-22)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-22)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-22)

- Updated workflow: evolution-workflow (2026-04-22)

- Updated workflow: missing-workflow-xyz (2026-04-22)

> ⚠️ Slice through 2026-04-22 was previously split into `archive/learnings-2026-04-22.md`; that intermediate file is merged into this document (intermediate archive removed in 2026-05 hygiene).

- Refreshed agent: .claude/agents/orchestrators/heartbeat-orchestrator.md (2026-04-23)

- [2026-04-20] [BUG FIX] heartbeat-orchestrator was clearing reflection-spawn-request.json on QUEUED_ACTIONS:N output (iron law violation). Fixed via agent-updater: step 4 of Tick Callback Handling now explicitly prohibits clearing/writing queue files. Added "Queue Preservation (IRON LAW)" section with absolute prohibition on Write/Edit to reflection-spawn-request.json. Queue is now treated as read-only for heartbeat-orchestrator; Router Gate 0 drains it on next UserPromptSubmit.

- Created new agent: qa-guardian (2026-04-23)

- Created new agent: contract-check (2026-04-23)

- Created new agent: bool-action (2026-04-23)

- Created new agent: repo-onboarder (2026-04-23)

- Created new agent: release-guardian (2026-04-23)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-23)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-23)

- Updated workflow: evolution-workflow (2026-04-23)

- Updated workflow: missing-workflow-xyz (2026-04-23)

- Created new agent: qa-guardian (2026-04-24)

- Created new agent: contract-check (2026-04-24)

- Created new agent: bool-action (2026-04-24)

- Created new agent: repo-onboarder (2026-04-24)

- Created new agent: release-guardian (2026-04-24)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-24)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-24)

- Updated workflow: evolution-workflow (2026-04-24)

- Updated workflow: missing-workflow-xyz (2026-04-24)

- [2026-04-24] [TESTING] Broken `require()` statements can mask massive test failure cascades. Detection heuristic: if a single commit unmasks >500 test failures, audit all adapter modules for similar missing dependencies. Root case example: `reflection-queue-adapter.cjs:53` referenced missing `./task-manager.cjs` (deleted during D2 unification in commit f3003e620), causing ~550 suites to fail at module-load time with generic test-failed errors — 687/6239 total failures (~11%). Fix was a single-file require restoration (commit 7d46d28cc). Pre-check: before any refactor that renames/moves modules, run `node -e require(module)` on all known importers to catch silent breakage before commit.

- [2026-04-24] [WORKFLOW] Gap-log noise classification: entries with type:missing_metadata for task-lifecycle-42 are KNOWN NOISE (phantom from test-fixture leak, confirmed 2026-04-17). Root cause: grand-lifecycle.test.cjs missing TASKUPDATE_FIRST_STATE_FILE env-var override. Do NOT re-investigate; treat as background noise until F-LIFECYCLE fix ships.

- [2026-04-24] [BUG] pre-completion-validation.cjs SE-03 violation: hook writes advisory output to stderr even when returning allow (exit 0). Claude Code pipeline surfaces any stderr as a blocking tool error. Pattern: ALL hook advisory messages must go to stdout JSON message field or be suppressed entirely on allow paths. Never write to stderr on non-error paths.

- [2026-04-24] [SCHEMA] Gap-log orchestration_start and reflection event types are missing required description field. Consumers that key on description will silently skip these entries. Pattern: when writing new gap-log event types, always include description field mirroring the primary event summary.

- [2026-04-24] [WORKFLOW] Multiple reflection spawns per session re-analyze same gap patterns: when N tasks complete in one session, reflection-spawn-request.json accumulates N entries all showing the same last-20 gap log observations. Each reflection agent independently re-analyzes identical patterns. Pattern: before writing to issues.md/learnings.md, check reflection-log.jsonl for entries from the same session date covering the same gap. If already documented, log confirmed-already-documented and skip re-writing to prevent duplicate entries accumulating across N reflection runs.

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-25)

- Created new agent: qa-guardian (2026-04-25)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-25)

- Created new agent: contract-check (2026-04-25)

- Created new agent: bool-action (2026-04-25)

- Created new agent: repo-onboarder (2026-04-25)

- Created new agent: release-guardian (2026-04-25)

- Updated workflow: evolution-workflow (2026-04-25)

- Updated workflow: missing-workflow-xyz (2026-04-25)

- Created new agent: qa-guardian (2026-04-25)

- Created new agent: contract-check (2026-04-25)

- Created new agent: bool-action (2026-04-25)

- Created new agent: repo-onboarder (2026-04-25)

- Created new agent: release-guardian (2026-04-25)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-25)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-25)

- Updated workflow: evolution-workflow (2026-04-25)

- Updated workflow: missing-workflow-xyz (2026-04-25)

- Created new agent: qa-guardian (2026-04-25)

- Created new agent: contract-check (2026-04-25)

- Created new agent: bool-action (2026-04-25)

- Created new agent: repo-onboarder (2026-04-25)

- Created new agent: release-guardian (2026-04-25)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-25)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-25)

- Updated workflow: evolution-workflow (2026-04-25)

- Updated workflow: missing-workflow-xyz (2026-04-25)

- Created new agent: qa-guardian (2026-04-25)

- Created new agent: contract-check (2026-04-25)

- Created new agent: bool-action (2026-04-25)

- Created new agent: repo-onboarder (2026-04-25)

- Created new agent: release-guardian (2026-04-25)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-25)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-25)

- Updated workflow: evolution-workflow (2026-04-25)

- Updated workflow: missing-workflow-xyz (2026-04-25)

- Created new agent: qa-guardian (2026-04-25)

- Created new agent: contract-check (2026-04-25)

- Created new agent: bool-action (2026-04-25)

- Created new agent: repo-onboarder (2026-04-25)

- Created new agent: release-guardian (2026-04-25)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-25)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-25)

- Updated workflow: evolution-workflow (2026-04-25)

- Updated workflow: missing-workflow-xyz (2026-04-25)

- [2026-04-25] [WORKFLOW] stale-task-detector cooldown fix shipped (commit 013377da6). Gap-log burst clusters from task-lifecycle-42 should reduce significantly in future sessions. The phantom root cause (F-LIFECYCLE test-fixture leak) is still unresolved — cooldown only suppresses symptom noise, not the phantom itself. Continue treating task-lifecycle-42 missing_metadata entries as known noise until F-LIFECYCLE patches land.

- [2026-04-25] [PATTERN] TS hook shipping research (task 1): Option A selected — build to dist/\*.cjs using tsx (already in devDeps). Applies to shipping TypeScript hooks in claude-code ecosystem alongside husky, biome/oxc/shadcn toolchains. tsx compile-to-CJS avoids ESM/CJS interop complexity for hook distribution.

> ⚠️ Content archived to archive/learnings-2026-05-01.md on 2026-05-01

- Created new agent: qa-guardian (2026-05-01)

- Created new agent: contract-check (2026-05-01)

- Created new agent: bool-action (2026-05-01)

- Created new agent: repo-onboarder (2026-05-01)

- Created new agent: release-guardian (2026-05-01)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-05-01)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-05-01)

- Updated workflow: evolution-workflow (2026-05-01)

- Updated workflow: missing-workflow-xyz (2026-05-01)

## Pruned archive carryover (spot-check 2026-05-02)

Verified against largest **deleted** paths still in `HEAD` (not restored on disk): `issues-routing-warns-2026-04.md` (~573 KiB, repetitive `[ROUTING WARN]` lines — safe to drop), `learnings-pre-cap-2026-04.md` (~55 KiB), `issues-2026-04-17.md` (~194 KiB). Unique substance below is **not** fully represented in the April–May timeline above.

### From `learnings-pre-cap-2026-04.md` (patterns + research)

- **Adversarial debate**: score each round before synthesis; 4 dimensions (specificity, evidence, rebuttal, relevance); moderator cites debate evidence; ~3 rounds typical.
- **Outcome-reflection**: keep estimation / prediction / decision quality separate; store predicted outcome at task creation; high-miss threshold triggers reflection follow-up.
- **Instinct-learning**: confidence clamp **0.3–0.9**; project-scoped storage; instincts inform routing, never override explicit rules.
- **Team orchestration**: six phases with strict phase-gate artifacts (Discover → Plan → Assign → Execute → Review → Integrate).
- **De-sloppify**: separate identifier vs deletion agent; only `git ls-files` paths auto-deletable without explicit confirmation.
- **TDD research (2026-03-24)**: gaps called out — PBT as extra step (~Step 5.5), Stryker ≥85% for security hooks, surface CJS/LSP empty-diagnostics limitation in TDD guidance; `ralph-loop` resumability via `tdd-state.json` praised.
- **Multi-model council (2026-03-24)**: ADR-115 — `safeParseJSON` preferred over Zod/Joi/Ajv for narrow CommonJS hook inputs (threat-focused, low overhead).
- **2026-03-23 audit snapshot (verify remediation before relying)**: reported HIGH concerns — `pre-task-unified-helpers.cjs` task text mutating `allowed_files` / commit policy; `mcp-allowlist-checker.cjs` fail-open gaps; `session-end-memory-promotion.cjs` durable cross-session memory poisoning risk. Treat as **historical findings** unless re-validated on current `main`.

### From `issues-2026-04-17.md` (systemic narrative)

- **Missing TaskUpdate metadata**: many reflections carried only fallback “Task N completed without summary metadata” — insufficient_data scoring; root cause traced to TaskUpdate(completed) without `metadata.summary` and/or hook enforcement gaps; recommended **BLOCK** (not warn) when summary missing; improve post-completion chain so reflection prompts carry real task metadata.
- **Bulk ROUTING WARN**: same keyword→specialist warn pattern documented hundreds of times — operational takeaway is “router warns on keyword hints,” not each line.
