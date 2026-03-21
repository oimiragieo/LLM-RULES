<!-- Agent: researcher | Task: #33 | Session: 2026-03-03 -->

# Research Report: Git Worktree Best Practices

**Date**: 2026-03-03
**Researcher**: researcher agent
**Task**: #33
**Sources Consulted**: 5

---

## Executive Summary

Git worktrees enable true parallel development by allowing multiple working directories from a single repository. For multi-agent systems the key risks are disk bloat (each worktree duplicates node_modules; a 2GB repo can balloon to 9.82 GB with 5 worktrees), Windows path/lock-file issues, and stale metadata accumulating when worktrees are deleted manually rather than via `git worktree remove`. Cleanup must be automated at the task-completion boundary — not left to humans or scheduled jobs.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | git worktree best practices cleanup automation lifecycle | WebSearch | 10 |
| 2 | git worktree prune vs manual removal cleanup patterns | WebSearch | 10 |
| 3 | git worktree CI CD multi-agent automation cleanup post-merge | WebSearch | 10 |
| 4 | git worktree Windows pitfalls disk bloat lock files path issues | WebSearch | 10 |
| 5 | Git Worktree Best Practices and Tools (gist deep-fetch) | WebFetch | Full content |

### Sources Consulted

| # | Title | Type | URL |
|---|-------|------|-----|
| 1 | Git Official Worktree Docs | Reference | https://git-scm.com/docs/git-worktree |
| 2 | Christopher Allen – Git Worktree Best Practices Gist | Community Guide | https://gist.github.com/ChristopherA/4643b2f5e024578606b9cd5d2e6815cc |
| 3 | DevToolbox – Git Worktrees Complete Guide 2026 | Blog | https://devtoolbox.dedyn.io/blog/git-worktrees-complete-guide |
| 4 | Nx Blog – How Git Worktrees Changed My AI Agent Workflow | Industry | https://nx.dev/blog/git-worktrees-ai-agents |
| 5 | Cursor Community – Windows Disk Space Issue | Community | https://forum.cursor.com/t/windows-request-to-disable-automatic-worktree-creation-critical-disk-space-issue/146189 |

---

## Detailed Findings

### Topic 1: Worktree Lifecycle — Create, Use, Destroy

**Key Insights:**

- The complete lifecycle is: `git worktree add .worktrees/<branch>` → work on task → `git worktree remove .worktrees/<branch>` → `git branch -d <branch>`
- Never nest worktrees inside each other — leads to Git metadata corruption
- Name worktrees after their branch: `.worktrees/feature-auth` not `tmp1`
- The worktree directory only needs to exist while the task is active; destroy it the moment the task completes or the branch is merged

**Evidence:** Official Git docs confirm worktrees can be removed cleanly via `git worktree remove <path>` which deletes the directory and internal references atomically.

**Relevance to Our Framework:** Our developer/qa/code-reviewer agents use `isolation: worktree` in frontmatter. Each spawned agent must call `git worktree remove` on task completion — not just exit. The cleanup must be in the agent's finally/cleanup block, not the router's post-processing.

---

### Topic 2: `git worktree prune` vs `git worktree remove`

**Key Insights:**

- `git worktree remove <path>` — preferred: removes directory AND cleans `.git/worktrees/<name>` metadata atomically
- `git worktree prune` — recovery only: scans for missing directories and removes orphaned metadata. Use after accidental `rm -rf`
- `git worktree prune --dry-run` — safe pre-flight before pruning
- `git worktree list` — show all registered worktrees with status
- Lock files: `git worktree lock <path>` prevents prune from removing a worktree (useful for CI jobs mid-flight); `git worktree unlock <path>` releases it

**Evidence:** musteresel's blog documents the "hidden file" detail: Git tracks worktrees via `.git/worktrees/<name>/gitdir` pointing to the worktree's `.git` file. Deleting only the directory leaves this metadata intact until pruned.

**Relevance to Our Framework:** Scheduled `git worktree prune` should run after every agent pipeline completes as a safety net for cases where `remove` was skipped (e.g., agent crash). This is the backstop, not the primary cleanup path.

---

### Topic 3: Multi-Agent and CI/CD Patterns

**Key Insights:**

- Store worktrees in a `.worktrees/` subdirectory (gitignored) rather than as siblings of the repo root — cleaner and avoids accidental adds
- Each agent gets its own named worktree: `.worktrees/agent-<task_id>-<branch>`
- Cleanup trigger hierarchy (best to worst): (1) on-task-completion by agent itself, (2) post-pipeline hook, (3) scheduled prune job, (4) manual operator
- ccswarm (multi-agent framework) uses Git worktree isolation per agent with automatic cleanup on task archive
- workmux / Worktrunk tools show the proven pattern: merge → remove worktree → delete branch → close session, all in one command

**Evidence:** Nx Blog (2025) documents that parallel AI agents each working in their own worktree eliminates merge conflicts and allows true concurrent work. The ccswarm project on GitHub demonstrates production-grade per-agent worktree lifecycle.

**Relevance to Our Framework:** Our agents (developer, qa, code-reviewer) already use worktree isolation. Missing piece: the TaskUpdate(completed) hook should trigger `git worktree remove` before marking done. The `evolution-state-sync.cjs` or a new `worktree-cleanup.cjs` hook is the right integration point.

---

### Topic 4: Windows-Specific Considerations

**Key Insights:**

- Disk bloat is severe: each worktree duplicates `node_modules` — a 2 GB repo × 5 worktrees = 9.82 GB in minutes (confirmed in our own MEMORY.md from 2026-02-22)
- Lock files: Windows file locks (EBUSY) can block `git worktree remove` if a process still holds a handle. Agent must close file handles before calling remove
- Path length: Windows MAX_PATH (260 chars) is a real constraint; keep worktree path short: `.worktrees/t33-auth` not `.worktrees/task-33-implement-auth-feature-2026`
- Backslash paths: `path.relative()` returns backslashes on Windows — normalize before using in scripts (see SE-01 in sharp-edges.md)
- NTFS alternate data streams and junction points can confuse `git worktree prune` — prefer standard subdirectories
- Network shares: lock worktrees on network shares to prevent automatic prune (`git worktree lock`)

**Evidence:** Cursor Community forum documents a user with 20+ worktrees accumulating ~140 GB over one week. Windows MAX_PATH violations are a known hard failure mode.

**Relevance to Our Framework:** Since we run on Windows 11 (per env), worktree path construction must normalize separators and stay under 200 chars total. The existing SE-01 rule covers this. Add a path-length guard to worktree creation.

---

## Academic References

*(No arXiv papers applicable to this operational topic.)*

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

- Add `git worktree remove .worktrees/<name>` to every agent's task-completion flow (in the cleanup block executed whether the agent succeeds or fails)
- Run `git worktree prune` as a post-pipeline safety net in the router's completion handler
- Cap concurrent worktrees at **3 maximum** on this machine given the disk bloat risk (2 GB repo × 3 = ~6 GB, acceptable)
- Enforce worktree path length guard: fail-fast if `path.join(cwd, '.worktrees', name).length > 200`

### P1 (Soon — Next Sprint)

- Implement `worktree-cleanup.cjs` hook that fires on TaskUpdate(completed) for agents with `isolation: worktree`
- Add `git worktree list --porcelain` output to the router's session-gap-log when a pipeline ends, so stale worktrees are visible
- Exclude `node_modules` from worktrees via `.npmrc` or symlink strategy to reduce disk footprint from 2 GB to ~200 MB per worktree

### P2 (Future — Backlog)

- Evaluate bare-repo pattern (no working tree in main repo, all work in worktrees) for cleaner architecture
- Add `git worktree lock` for CI jobs that must not be pruned mid-flight
- Scheduled cleanup script: `git worktree prune --expire 1.hour.ago` to auto-remove worktrees abandoned for >1 hour

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Disk explosion (node_modules per worktree) | HIGH — fills disk, kills CI | HIGH on Windows | Cap at 3 concurrent; symlink node_modules; monitor disk |
| Agent crash leaves stale worktree | MEDIUM — orphaned metadata, confusing git state | MEDIUM | Post-pipeline `git worktree prune`; include in session-gap-log |
| Windows path length violation (>260 chars) | HIGH — hard failure, silent on some tools | LOW-MEDIUM | Enforce path length guard at worktree creation time |
| Windows EBUSY on `git worktree remove` | MEDIUM — cleanup fails silently | MEDIUM | Close file handles before remove; retry with `--force` |
| Nested worktrees (agent spawns inside another's worktree) | HIGH — Git metadata corruption | LOW | Validate cwd is not inside `.git/worktrees` before add |
| Lock file prevents prune after crash | LOW — metadata accumulates | LOW | `git worktree prune --expire 1.hour.ago` on schedule |

---

## Implementation Roadmap

**Phase 1 (now):** Audit current worktree state with `git worktree list`. Remove any stale worktrees manually. Establish the naming convention `.worktrees/t<task_id>-<short-branch>`.

**Phase 2 (task #36):** Implement `worktree-cleanup.cjs` PostToolUse hook. Hook fires when a TaskUpdate(completed) is detected for an agent with `isolation: worktree`. Hook runs `git worktree remove <path> --force` then `git worktree prune`.

**Phase 3 (backlog):** Add disk-usage monitoring (`du -sh .worktrees/`) to the post-pipeline summary. Alert if total exceeds 8 GB.

---

## Top 5 Worktree Lifecycle Best Practices (Summary)

1. **One worktree per task, destroyed on completion** — create at task start, `git worktree remove` in the task's cleanup/finally block
2. **Use `git worktree remove`, not `rm -rf`** — atomic cleanup of directory + metadata; reserve `git worktree prune` as a recovery backstop
3. **Name by task ID + branch** — `.worktrees/t33-worktree-cleanup` is unambiguous; never use temp1/test/scratch
4. **Cap concurrent worktrees at 3 on Windows** — disk bloat is severe with node_modules; each worktree on this machine costs ~2 GB
5. **Normalize paths before using in scripts** — `path.sep` is `\` on Windows; always `.replace(/\\/g, '/')` per SE-01

---

## Recommended Cleanup Triggers (Priority Order)

| Trigger | Mechanism | Coverage |
|---------|-----------|----------|
| Task completion by agent | `git worktree remove` in agent cleanup block | Primary — catches normal flow |
| PostToolUse hook (TaskUpdate completed) | `worktree-cleanup.cjs` | Secondary — catches agent-reported completion |
| Post-pipeline router step | `git worktree prune` | Tertiary — catches crashes and missed removes |
| Scheduled prune | `git worktree prune --expire 1.hour.ago` | Backstop — catches long-abandoned worktrees |
