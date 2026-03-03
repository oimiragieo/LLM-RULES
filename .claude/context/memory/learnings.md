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

- Created new agent: qa-guardian (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

- Created new agent: qa-guardian (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

- Created new agent: qa-guardian (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)

- Created new agent: qa-guardian (2026-03-03)

- Created new agent: contract-check (2026-03-03)

- Created new agent: bool-action (2026-03-03)

- Created new agent: repo-onboarder (2026-03-03)

- Refreshed agent: .claude/agents/core/reflection-agent.md (2026-03-03)

- Refreshed agent: .claude/agents/orchestrators/artifact-integrator.md (2026-03-03)

- Updated workflow: evolution-workflow (2026-03-03)

- Updated workflow: missing-workflow-xyz (2026-03-03)
