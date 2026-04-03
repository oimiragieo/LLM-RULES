# Rules

Auto-loaded markdown files that govern agent behavior. Rules are loaded into every agent's context window automatically — they are always active and cannot be bypassed. Each rule file defines one behavioral constraint or protocol.

## Files

| File | Purpose | Enforcement |
|------|---------|-------------|
| `agents.md` | Agent routing quick-reference — specialist-first law, common misrouting examples, self-check gates | Routing guard hook |
| `cleanup-always.md` | End-of-task cleanup protocol — root scan, temp cleanup, worktree prune, AI slop detection | Post-task validation |
| `code-standards.md` | Code quality standards — style, patterns, error handling, search tool priority, lint/format requirements | ESLint + Prettier |
| `deviation-rules.md` | Deviation protocol — DR-1 (auto-fix bugs), DR-2 (add prerequisites), DR-3 (escalate architecture), DR-4 (logging) | Session gap log |
| `documentation-always.md` | Documentation iron law — CHANGELOG, README, .env.example must be updated with every feature/fix | Pre-completion hook |
| `git-workflow.md` | Git conventions — Conventional Commits, branch naming, pre-commit requirements, AI attribution | Commit validator |
| `hooks.md` | Hook system rules — registration, exit codes, error handling conventions | Settings.json |
| `memory-protocol.md` | Memory tier protocol — STM/MTM/LTM usage, MemoryRecord tool, never write JSON directly | Memory hooks |
| `plan-file-update.md` | Plan file protocol — `[ ]` → `[~]` → `[x]` markers, Edit tool only, execution snapshots | Agent self-enforcement |
| `safety-rules.md` | Safety rules — sharp edges catalog (SE-01 through SE-07), shell safety, file deletion iron law | Safety hooks |
| `security.md` | Security rules — shell:false, safeParseJSON, OWASP agentic AI, prompt injection defense, memory poisoning | ESLint + hooks |
| `task-tracking.md` | Task protocol — TaskUpdate lifecycle, agent coordination metadata, conductor pattern | Task hooks |
| `workspace-conventions.md` | File placement rules — canonical locations, naming conventions, provenance headers, forbidden locations | Cleanup hooks |

## Subdirectory

| Directory | Purpose |
|-----------|---------|
| `frameworks/` | Framework-specific rules (e.g., React, Vue, Django conventions) loaded conditionally based on project context |
