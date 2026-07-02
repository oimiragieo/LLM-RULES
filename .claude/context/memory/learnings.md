- Created new agent: bool-action (2026-03-28)
- Created new agent: repo-onboarder (2026-03-28)
- Created new agent: release-guardian (2026-03-28)
- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-28)
- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-28)
- Updated workflow: evolution-workflow (2026-03-28)
- Updated workflow: missing-workflow-xyz (2026-03-28)
- Created new agent: qa-guardian (2026-03-28)
- Created new agent: contract-check (2026-03-28)
- Created new agent: bool-action (2026-03-28)
- Created new agent: repo-onboarder (2026-03-28)
- Created new agent: release-guardian (2026-03-28)
- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-28)
- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-28)
- Updated workflow: evolution-workflow (2026-03-28)
- Updated workflow: missing-workflow-xyz (2026-03-28)
- Created new agent: qa-guardian (2026-03-29)
- Created new agent: contract-check (2026-03-29)
- Created new agent: bool-action (2026-03-29)
- Created new agent: repo-onboarder (2026-03-29)
- Created new agent: release-guardian (2026-03-29)
- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-29)
- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-29)
- Updated workflow: evolution-workflow (2026-03-29)
- Updated workflow: missing-workflow-xyz (2026-03-29)
- Created new agent: qa-guardian (2026-03-29)
- Created new agent: contract-check (2026-03-29)
- Created new agent: bool-action (2026-03-29)
- Created new agent: repo-onboarder (2026-03-29)
- Created new agent: release-guardian (2026-03-29)
- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-29)
- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-29)
- Updated workflow: evolution-workflow (2026-03-29)
- Updated workflow: missing-workflow-xyz (2026-03-29)
- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-29)
- Created new agent: qa-guardian (2026-03-29)
- Updated workflow: evolution-workflow (2026-03-29)
- Updated workflow: missing-workflow-xyz (2026-03-29)
- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-29)
- Created new agent: contract-check (2026-03-29)
- Created new agent: bool-action (2026-03-29)
- Created new agent: repo-onboarder (2026-03-29)
- Created new agent: release-guardian (2026-03-29)
- Created new agent: qa-guardian (2026-04-04)
- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-04)
- Created new agent: contract-check (2026-04-04)
- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-04)
- Created new agent: bool-action (2026-04-04)
- Created new agent: repo-onboarder (2026-04-04)
- Created new agent: release-guardian (2026-04-04)
- [2026-04-08] Agents frequently complete tasks without summary metadata in TaskUpdate(completed). Router should emphasize in spawn prompts that the summary field is required. Pattern observed in 5 consecutive task-completion reflections (tasks 20-25), all flagged by post-completion hook as "completed without summary metadata".
- [2026-04-09] Reflection queue batch-dedup pattern: when all queued reflections carry the same gap-observations payload with only task_id differing (same root-cause triggering N reflections), process them as a single consolidated entry rather than spawning N reflection-agents. Saves ~N\*15k tokens. Trigger: identical source.trigger + identical gap digest across entries.
- [2026-04-11] [CODE] ghidramcp-eval differential oracle pattern: PYTHONPATH dependency resolved via sys.path.insert(0, src/) in run_vrl.py — avoids requiring callers to set env vars. Prefer embedded path setup over external PYTHONPATH for portable test scripts.
- [2026-04-11] [CODE] Oracle exception resilience pattern: oracle.verify() exceptions (TimeoutError, RuntimeError) must be caught explicitly in the evaluation harness — they propagate uncaught by default and abort test runs. Add try/except around verify() calls with fault-injection test coverage (8 fault tests documented in ghidramcp-eval tasks 7+10).
- [2026-04-11] [WORKFLOW] task-lifecycle-42 zombie closed in this session (Task #3 completed) — gap-log noise from stale-task-detector.cjs should diminish. Confirmed: 873 gap entries total at peak, ~860 from this single zombie. Auto-closing zombies immediately on detection is essential for gap-log signal quality.
- [2026-04-11] [WORKFLOW] Reflection batch-processing pattern (evening): 321 untracked files accumulating in repo (task 11 finding). Cause: artifacts, scripts from reveng sessions not gitignored. Gitignore pass recommended for .reveng/, tests/fixtures/, and output dirs before next commit wave.
- [2026-04-11] [WORKFLOW] Queue dedup observation: when reflection-log.jsonl already contains entries for queued reflection IDs (added by hook system pre-spawn), do not re-add entries. Idempotent check: grep taskId in reflection-log.jsonl before appending.
- [2026-04-12] [SECURITY] safeParseJSON returns the parsed object DIRECTLY — NOT a {success, data, error} envelope. The correct call is `const obj = safeParseJSON(content, ...)` and then `obj.field`, NOT `obj.data.field`. 17 call sites had `.data` suffix bugs (C-01 finding). This is a critical API contract to remember — all future hook and lib code must use the direct-return pattern.
- [2026-04-12] [SECURITY] shell:true in channels daemon is an INTENTIONAL Windows compatibility pattern, not a security gap. The channels daemon uses `shell:true` specifically to resolve `.cmd` wrapper scripts (npm, node, etc.) on Windows where PATH resolution requires shell context. Do NOT convert to shell:false without providing explicit `.cmd` path resolution. Document with justification comments instead (M-01 pattern).
- [2026-04-12] [SECURITY] False positive audit findings (H-06, H-08): H-06 Windows path normalization sites were already defended with `.replace(/\\/g, '/')` — audit tool reported them as gaps without reading the code. H-08 merkle-tree glob escaping was also already correct. Always verify "gaps" by reading the actual implementation before spending remediation effort. Added regression guard tests for H-08.
- [2026-04-12] [REFACTOR] Mission lib facade pattern: when splitting large files (>module-size baseline), create a thin ~25-line facade (re-exporter) plus N focused implementation modules. All public exports must be preserved in the facade. Consumer files need zero changes. Pattern used in H-09: validation-state-gatekeeper, mission-grader, mission-orchestrator each split into facade + 3-5 modules.
- [2026-04-12] [SECURITY] yaml.load hardening: replace bare `yaml.load(content)` with `yaml.load(content, { schema: yaml.JSON_SCHEMA })` or `yaml.safeLoad()` to prevent !!js/function deserialization gadgets. The JSON_SCHEMA option blocks all YAML-specific type constructors including !!js/undefined, !!js/regexp, !!js/function (H-05).
- [2026-04-12] [SECURITY] Marketplace git clone injection hardening: use `['clone', '--', url, dest]` array form (not string interpolation) and validate URL against allowlist regex before passing to child_process. Option injection prevented by `--` separator (H-04).
- [2026-04-12] [RESEARCH] SkillClaw paper (arXiv) identified 3 framework gaps: (1) cross-session trajectory aggregation — outcome-reflection currently emits per-task signals but does not aggregate across sessions; (2) runtime-triggered autonomous evolution — evolution currently requires human/router trigger; (3) zero-effort evolution triggers — no automatic low-score-to-evolution pipeline. P0 adoptions: extend outcome-reflection to emit trajectory signals, add frequency tracking to instinct-learning skill.

- [2026-04-15] [WORKFLOW] task-lifecycle-42 phantom stale detection: stale-task-detector.cjs repeatedly detects task-lifecycle-42 as stale across 946+ router gap-log entries (durations 21-1957 min) even though TaskList() shows no such task exists. Root cause: task deleted/completed without proper TaskUpdate cleanup, leaving a ghost reference in stale-task tracking state. Fix: stale-task-detector.cjs needs TTL-based auto-expiry for task IDs that do not appear in TaskList() after N consecutive detections (recommend N=3, TTL=30 min).
- [2026-04-15] [DELIVERY] Session 2026-04-15 batch (tasks 3-7): (1) 48->3 test failures fixed (hierarchical routing, frontmatter, A2A, fixed-section); (2) 28 Wave 5 Telegram integration tests added (B2-B5, A1); (3) 5-phase enterprise audit: 2 HIGH security findings, CLAUDE.md drift, 17 orphaned root files, 10 untested files, 5 test smells; (4) tasks 6 and 7 completed without summary metadata - metadata contract still not enforced at hook level.
- [2026-04-16] [WORKFLOW] task-lifecycle-42 phantom stale detection: still firing across 995 gap-log entries as of 2026-04-16 session. Gap entries with durations 1621-2522 min plus a 55-min entry confirm the ghost reference persists through router resets. TTL-based auto-expiry fix for stale-task-detector.cjs (N=3 consecutive detections, TTL=30 min) remains unimplemented — this is the single highest-noise source in gap-log across all sessions.
- [2026-04-16] [WORKFLOW] SE-03 violation in pre-completion-validation.cjs observed once (blocked TaskUpdate with no stderr). SE-03 fail-open fix was added in commits a586ea825+bdb731d02 (fail-open .catch on main()). Single occurrence post-fix likely indicates a race condition or one-off; not systemic. Monitor if it recurs.
- [2026-04-16] [DELIVERY] refl-routing-guard-detection-2026-04-16 reflection processed cleanly: Phase 1 fix (CLAUDE_AGENT_ID propagation, commits 145d812c8+71c73db7a) confirmed correct, spawn queue cleared. Good pattern: named reflection IDs tied to specific fix commits enable efficient resolution verification.

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-17)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-17)

- Updated workflow: evolution-workflow (2026-04-17)

- Updated workflow: missing-workflow-xyz (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-17)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-17)

- Updated workflow: evolution-workflow (2026-04-17)

- Updated workflow: missing-workflow-xyz (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-17)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-17)

- Updated workflow: evolution-workflow (2026-04-17)

- Updated workflow: missing-workflow-xyz (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-17)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-17)

- Updated workflow: evolution-workflow (2026-04-17)

- Updated workflow: missing-workflow-xyz (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-17)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-17)

- Updated workflow: evolution-workflow (2026-04-17)

- Updated workflow: missing-workflow-xyz (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-17)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-17)

- Updated workflow: evolution-workflow (2026-04-17)

- Updated workflow: missing-workflow-xyz (2026-04-17)

- Created new agent: qa-guardian (2026-04-17)

- Created new agent: contract-check (2026-04-17)

- Created new agent: bool-action (2026-04-17)

- Created new agent: repo-onboarder (2026-04-17)

- Created new agent: release-guardian (2026-04-17)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-17)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-17)

- Updated workflow: evolution-workflow (2026-04-17)

- Updated workflow: missing-workflow-xyz (2026-04-17)

- Created new agent: qa-guardian (2026-04-18)

- Created new agent: contract-check (2026-04-18)

- Created new agent: bool-action (2026-04-18)

- Created new agent: repo-onboarder (2026-04-18)

- Created new agent: release-guardian (2026-04-18)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-18)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-18)

- Updated workflow: evolution-workflow (2026-04-18)

- Updated workflow: missing-workflow-xyz (2026-04-18)

- Created new agent: qa-guardian (2026-04-18)

- Created new agent: contract-check (2026-04-18)

- Created new agent: bool-action (2026-04-18)

- Created new agent: repo-onboarder (2026-04-18)

- Created new agent: release-guardian (2026-04-18)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-04-18)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-04-18)

- Updated workflow: evolution-workflow (2026-04-18)

- Updated workflow: missing-workflow-xyz (2026-04-18)
