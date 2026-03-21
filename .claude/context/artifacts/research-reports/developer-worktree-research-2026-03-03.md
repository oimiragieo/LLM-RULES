<!-- Agent: researcher | Task: #8 | Session: 2026-03-03 -->

# Developer Agent Worktree Research — 2026-03-03

**Date**: 2026-03-03
**Researcher**: researcher agent
**Task**: #8
**Batch/Phase**: Single-phase (5 web queries + 3 WebFetch + codebase analysis)
**Sources Consulted**: 12

---

## Executive Summary

Git worktrees are now widely recognized as the primary isolation strategy for concurrent AI developer agents. The community has converged on a worktree-per-task model with automatic lifecycle management. However, five concrete failure conditions require automatic fallback to in-place editing (disk pressure, nested-worktree detection, shallow clone environments, bare-clone repos, and Windows path-length limits). Spawn prompts must explicitly communicate the absolute worktree path to prevent agents writing to the wrong directory — this is the single biggest source of agent misbehavior in multi-worktree setups. Agent Studio already has `isolation: worktree`, `worktree-auto-cleanup.cjs`, and `worktree-utils.cjs` in place; the gap is a documented fallback policy and sharper spawn prompt path instructions.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | git worktree AI agent isolated development best practices 2025 concurrent agents | WebSearch | 10 |
| 2 | git worktree limitations disk space Windows NTFS nested repos monorepo node_modules | WebSearch | 10 |
| 3 | AI coding agent fallback when git worktree unavailable shallow clone detached HEAD CI | WebSearch | 10 |
| 4 | detect git worktree support programmatic check bash script "already in worktree" | WebSearch | 10 |
| 5 | spawn prompt clarity AI developer agent working directory worktree path | WebSearch | 10 |

### Sources Consulted

| # | Title | Type | URL | Date |
|---|-------|------|-----|------|
| 1 | How Git Worktrees Changed My AI Agent Workflow — Nx Blog | Article | https://nx.dev/blog/git-worktrees-ai-agents | 2025 |
| 2 | Git Worktrees for Parallel AI Coding Agents — Upsun Dev Center | Article | https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-coding-agents/ | 2025 |
| 3 | Using Git Worktrees for Multi-Feature Dev with AI Agents — nrmitchi | Article | https://www.nrmitchi.com/2025/10/using-git-worktrees-for-multi-feature-development-with-ai-agents/ | 2025-10 |
| 4 | Git Worktrees: The Secret Weapon for Parallel AI Agents — Medium | Article | https://medium.com/@mabd.dev/git-worktrees-the-secret-weapon-for-running-multiple-ai-coding-agents-in-parallel-e9046451eb96 | 2025 |
| 5 | Parallel AI Coding with Git Worktrees — Agent Interviews | Article | https://docs.agentinterviews.com/blog/parallel-ai-coding-with-gitworktrees/ | 2025 |
| 6 | ccswarm: Multi-agent orchestration with worktree isolation — GitHub | Codebase | https://github.com/nwiizo/ccswarm | 2025 |
| 7 | worktree flag fails on jj detached HEAD — Claude Code Issue #27466 | Issue | https://github.com/anthropics/claude-code/issues/27466 | 2025 |
| 8 | Allow specifying working directory for agent teams — Claude Code Issue #27578 | Issue | https://github.com/anthropics/claude-code/issues/27578 | 2025 |
| 9 | Windows critical disk space from worktree creation — Cursor Forum | Forum | https://forum.cursor.com/t/windows-request-to-disable-automatic-worktree-creation-critical-disk-space-issue/146189 | 2025 |
| 10 | git-worktree Documentation — git-scm.com | Official Docs | https://git-scm.com/docs/git-worktree | Canonical |
| 11 | agent-studio worktree-auto-cleanup.cjs | Codebase | .claude/hooks/cleanup/worktree-auto-cleanup.cjs | 2026-02-22 |
| 12 | agent-studio worktree-utils.cjs | Codebase | .claude/lib/worktree/worktree-utils.cjs | 2026-02-22 |

---

## Detailed Findings

### Topic A: When to Use Worktrees (vs. When NOT to)

**Key Insights:**

- Worktrees are ideal when: multiple agents work on separate branches simultaneously, an agent needs a long-running isolated workspace without polluting other agents' contexts, or the work involves risky refactors where isolation prevents cascading failure.
- Boris Cherny (Claude Code creator, Anthropic) identified worktrees as his #1 productivity tip for 3–5 concurrent agents doing batch/migration work.
- **Five hard NO conditions** where worktrees should NOT be created:

| Condition | Detection Command | Action |
|-----------|-------------------|--------|
| Already inside a linked worktree | `git rev-parse --git-common-dir` returns path != `.git` | Fall back to in-place |
| Shallow clone | `git rev-parse --is-shallow-repository` returns `true` | Fall back to in-place |
| Detached HEAD (no branch) | `git symbolic-ref HEAD` fails with exit non-zero | Add `-b <generated-name>` OR fall back |
| Disk free < threshold | `df -h .` — check available bytes | Fall back if < 2× repo size |
| Windows path length risk | `${WORKTREE_PATH}.length > 200` chars | Shorten path or fall back |

**Evidence:**
- Claude Code issue #27466 confirmed: `--worktree` flag silently fails when HEAD is detached (Jujutsu colocated repos, CI detached checkouts). Fix: pass `-b <generated-branch>` to `git worktree add` when `git symbolic-ref HEAD` fails.
- Cursor community confirmed 9.82 GB explosion from two worktrees on a 2 GB codebase. Windows users reported disk exhaustion from automatic worktree creation.
- Each worktree requires full `node_modules` reinstall (400–600 MB per worktree for a JS project).

**Relevance to Agent Studio:**
Agent Studio memory (2026-02-22) already documents: "9.82GB disk explosion with 5 worktrees on 2GB codebase." The worktree-auto-cleanup.cjs hook handles post-task cleanup but there is no pre-creation guard that checks disk space or detects nested worktree state.

---

### Topic B: Best Practices for Worktree Lifecycle

**Key Insights:**

**Branch naming:**
- Pattern: `worktree-<agentType>-<taskId>-<shortTimestamp>` (e.g. `worktree-developer-task-12-20260303`)
- Agent Studio already uses `worktree-<name>` per frontmatter config; adding taskId suffix aids disambiguation.
- Keep branch names under 50 chars to avoid Windows path issues.

**Lifecycle (create → work → verify → merge → cleanup):**

```
1. CREATE:
   git worktree add -b worktree-<name> .claude/worktrees/<name> <defaultBranch>

2. WORK:
   Agent operates with cwd = absolute path of worktree
   Spawn prompt MUST include: "Your working directory is: <abs-path>"

3. VERIFY (before merge):
   - git -C <worktree-path> status (must be clean or staged)
   - git -C <worktree-path> log <defaultBranch>..HEAD --oneline (confirm commits exist)
   - Run project tests from worktree cwd

4. MERGE:
   From main: git merge --no-ff worktree-<name>
   Or: raise PR pointing from worktree branch

5. CLEANUP:
   git worktree remove <path> --force (or git worktree prune for stale entries)
   Triggered automatically by worktree-auto-cleanup.cjs on TaskUpdate(completed)
```

**Stale worktree detection:**
- `git worktree list --porcelain` — parse `worktree`, `HEAD`, `branch`, `prunable` fields.
- A worktree is stale if: its directory no longer exists OR `prunable` field is set.
- The existing `worktree-prune.cjs` tool implements this correctly.

**Shared vs. isolated resources:**
| Resource | Share or Isolate? | Strategy |
|----------|-------------------|----------|
| .git history | Shared (automatic) | No action needed |
| node_modules | Shared via symlink | Symlink `<worktree>/node_modules → <main>/node_modules` if package.json unchanged |
| .env files | Isolated (copy) | Copy `.env` at worktree creation time |
| Dev server port | Isolated | Assign `PORT=<base + taskId offset>` in worktree .env |
| SQLite / local DB | Isolated (copy) | Copy DB file or use separate DB name per worktree |

**Port conflict prevention:**
- Each worktree dev server must use a distinct port. Pattern: `BASE_PORT + (taskId % 100)`.
- Document the port assignment in the spawn prompt so the agent doesn't hardcode 3000.

---

### Topic C: Fallback Patterns Catalog

#### C1. Git Stash Approach (In-Place Editing with Stash Save-Point)

**When to use:** Disk pressure, shallow clone, nested worktree detected.

**Steps:**
1. Before agent starts: `git stash push -m "pre-agent-task-<taskId>"` (creates rollback point).
2. Agent works in-place on current branch (no worktree).
3. After success: `git stash drop stash@{0}`.
4. After failure: `git stash pop` (restores clean state).

**Risks:**
- No branch isolation — parallel agents will conflict.
- Stash only safe for sequential (one-agent-at-a-time) fallback.
- Do NOT use when multiple agents are running concurrently.

#### C2. Feature Branch Without Worktree (Sequential Checkout)

**When to use:** Single agent, worktree unavailable, no disk pressure on a secondary machine.

**Steps:**
1. `git checkout -b agent-task-<taskId>` from main repo.
2. Agent works on new branch in main repo directory.
3. After task: `git checkout main && git merge agent-task-<taskId> && git branch -d agent-task-<taskId>`.

**Risks:**
- Only safe when ONE agent is active — concurrent agents will corrupt each other's working tree.
- `.env` and config files remain shared; risk of cross-task contamination.

#### C3. Auto-Detection Logic (Recommended for Agent Studio)

**Decision tree for pre-creation check in worktree-utils.cjs:**

```javascript
async function shouldUseWorktree(projectRoot) {
  // Check 1: git available?
  const gitVersion = gitRun(['--version'], projectRoot);
  if (!gitVersion) return { use: false, reason: 'git_not_available' };

  // Check 2: Inside an existing worktree?
  const commonDir = gitRun(['rev-parse', '--git-common-dir'], projectRoot);
  const gitDir = gitRun(['rev-parse', '--git-dir'], projectRoot);
  if (commonDir && gitDir && commonDir !== gitDir && !gitDir.endsWith('.git')) {
    return { use: false, reason: 'already_in_worktree' };
  }

  // Check 3: Shallow clone?
  const isShallow = gitRun(['rev-parse', '--is-shallow-repository'], projectRoot);
  if (isShallow === 'true') return { use: false, reason: 'shallow_clone' };

  // Check 4: Disk space (require 2× repo size free)
  // Implementation: platform-specific df check — omit if unavailable

  // Check 5: Detached HEAD?
  const headRef = gitRun(['symbolic-ref', 'HEAD'], projectRoot);
  const detached = (headRef === null);
  // If detached, still can use worktree but MUST pass -b flag

  return { use: true, detached };
}
```

**Fallback precedence:**
1. Worktree (preferred) — full isolation, concurrent-safe.
2. Feature branch checkout — single-agent only, moderate isolation.
3. In-place with stash — last resort, sequential only.
4. In-place without stash — emergency only (no rollback).

#### C4. Shallow Clone / CI Environments

- Shallow clones (`--depth=1`) lack the full history needed for `git merge-base` comparisons.
- `git worktree add` works in shallow clones but `prune` and `log --oneline main..HEAD` may fail.
- In CI: prefer a full clone or explicitly un-shallow: `git fetch --unshallow`.
- If un-shallowing is not possible, fall back to C2 (feature branch, no worktree).

---

### Topic D: Spawn Prompt Clarity Patterns

**The #1 source of agent confusion:** not knowing which directory to write to.

**Required elements in every developer agent spawn prompt when `isolation: worktree` is active:**

```
## Working Directory (MANDATORY — READ FIRST)

Your exclusive working directory is:
  <ABSOLUTE_WORKTREE_PATH>

ALL file reads and writes MUST use this path as the root.
The main repository root is: <MAIN_REPO_ROOT>
DO NOT write to <MAIN_REPO_ROOT> directly — only to your worktree.

Your branch: <WORKTREE_BRANCH_NAME>
Allowed git operations: commit, push, status, log, diff
FORBIDDEN git operations: worktree add/remove, force-push, merge to main
```

**Path communication rules:**
1. Always use ABSOLUTE paths in spawn prompts (not relative).
2. State BOTH the worktree path AND the main repo root so the agent can distinguish them.
3. Include the branch name so the agent can verify `git status` shows the correct branch.
4. Explicitly list allowed vs. forbidden git operations (prevents agent from accidentally running `git worktree remove` on its own worktree).

**Inline result summary requirement (P1 issue):**
- Developer agents must return ONLY: report file path + 5-bullet summary (max 500 chars).
- Full analysis goes to file in `.claude/context/reports/backend/`.
- This prevents the P0 context overflow documented in MEMORY.md (2026-02-09).

**Spawn prompt template fragment:**
```markdown
## Output Requirements
Return ONLY:
1. Report path: .claude/context/reports/backend/<topic>-report-<YYYY-MM-DD>.md
2. Exactly 5 bullet summary (max 500 chars total)

Full analysis → write to the report file.
Do NOT return inline content exceeding 500 chars.
```

---

### Topic E: Key Findings Applicable to Agent Studio

**What is already implemented correctly:**
- `isolation: worktree` in developer, qa, code-reviewer, frontend-pro, nextjs-pro frontmatter.
- `worktree-auto-cleanup.cjs`: PostToolUse hook that prunes merged worktrees on TaskUpdate(completed).
- `worktree-utils.cjs`: `detectDefaultBranch()` with 4-strategy fallback, `gitRun()` with shell:false (SE-02 compliant).
- `worktree-prune.cjs` CLI tool with `--dry-run` mode and tested via `worktree-prune.test.cjs`.
- SE-01 compliance: all paths normalized with `.replace(/\\/g, '/')`.

**Gaps identified:**

| Gap | Impact | Priority |
|-----|--------|----------|
| No pre-creation feasibility check (disk space, shallow clone, nested worktree) | Silent failure or disk explosion | P0 |
| Detached HEAD not handled in worktree add (issue #27466 pattern) | Worktree creation silently fails | P0 |
| Spawn prompt does not include explicit "Your working directory is:" line | Agent writes to main repo instead of worktree | P1 |
| No port assignment strategy documented or enforced | Dev server port conflicts between concurrent worktrees | P1 |
| node_modules symlink strategy not implemented (disk saving) | 400–600 MB duplicated per worktree | P2 |
| No maximum concurrent worktree count enforced | Resource exhaustion (CPU, RAM, disk) | P2 |

---

## Academic References

No academic papers were directly applicable to this research topic. The domain is practical engineering practice rather than academic research.

---

## Practical Recommendations

### P0 (Immediate — This Sprint)

- Add `shouldUseWorktree()` pre-creation check to `worktree-utils.cjs` that detects: already-in-worktree, shallow clone, and disk pressure. Return `{ use: boolean, reason: string, detached: boolean }`.
- Handle detached HEAD in worktree creation: when `git symbolic-ref HEAD` fails, auto-generate a branch name (`worktree-<agentType>-<taskId>`) and pass `-b <generated-name>` to `git worktree add`.
- Update spawn-prompt-assembler to inject explicit "Your working directory is: <abs-path>" block when `isolation: worktree` is active.

### P1 (Soon — Next Sprint)

- Document and enforce port assignment strategy: `BASE_PORT + (taskId % 100)` injected into worktree `.env` at creation time.
- Add inline summary size enforcement to developer spawn prompt (max 500 chars inline, full report to file).
- Add fallback mode documentation to developer agent frontmatter so agents know what to do when worktree creation is skipped.

### P2 (Future — Backlog)

- Implement `node_modules` symlink strategy: before `npm install` in new worktree, check if main repo has `node_modules` and create symlink if package.json is identical (hash check).
- Add concurrent worktree count limit (recommended max: 3 on 32 GB RAM, 2 on 16 GB RAM).
- Consider cloud preview environments (Upsun recommendation) for large monorepos where disk duplication cost exceeds worktree benefit.

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Detached HEAD causes silent worktree failure | High — agent proceeds with no isolation | Medium (common in CI) | Auto-generate branch with `-b` flag when detached |
| Disk explosion on Windows (9.82 GB from 2 worktrees) | High — disk full crash | High on large repos | Pre-creation disk check; enforce worktree count limit |
| Agent writes to main repo instead of worktree | High — corrupts other agents' work | Medium | Explicit absolute path in spawn prompt |
| Nested worktree creation attempt (worktree inside worktree) | High — git corruption | Low but catastrophic | Pre-creation nested check via `--git-common-dir` |
| Port conflict between concurrent dev servers | Medium — test failures, silent | Medium | Port assignment formula in worktree .env |
| node_modules duplication (600 MB × N worktrees) | Medium — disk pressure | High on JS projects | Symlink strategy or explicit install gate |
| Stale worktrees from agent crash/timeout | Low — manual cleanup needed | Medium | `worktree-prune.cjs` already handles this |

---

## Implementation Roadmap

**Week 1 (P0):**
1. Add `shouldUseWorktree()` to `worktree-utils.cjs` (detect shallow, nested, disk).
2. Update worktree creation logic to handle detached HEAD with auto-branch.
3. Update `spawn-prompt-assembler.cjs` to inject working directory block.

**Week 2 (P1):**
4. Add port assignment injection to worktree creation.
5. Add inline summary enforcement to developer spawn prompt template.
6. Write regression tests for all three P0 changes.

**Future (P2):**
7. Implement node_modules symlink optimization.
8. Add concurrent worktree count cap with queuing.

---

## Sources

- [Using Git Worktrees for Multi-Feature Dev with AI Agents — Nick Mitchinson](https://www.nrmitchi.com/2025/10/using-git-worktrees-for-multi-feature-development-with-ai-agents/)
- [Git Worktrees: The Secret Weapon for Parallel AI Agents — Medium](https://medium.com/@mabd.dev/git-worktrees-the-secret-weapon-for-running-multiple-ai-coding-agents-in-parallel-e9046451eb96)
- [How Git Worktrees Changed My AI Agent Workflow — Nx Blog](https://nx.dev/blog/git-worktrees-ai-agents)
- [Supercharging Development: Git Worktree & AI Agents — Mike Welsh, Medium](https://medium.com/@mike-welsh/supercharging-development-using-git-worktree-ai-agents-4486916435cb)
- [Parallel AI Coding with Git Worktrees — Agent Interviews Docs](https://docs.agentinterviews.com/blog/parallel-ai-coding-with-gitworktrees/)
- [Git Worktrees for Parallel AI Coding Agents — Upsun Dev Center](https://devcenter.upsun.com/posts/git-worktrees-for-parallel-ai-coding-agents/)
- [ccswarm: Multi-agent Orchestration with Worktree Isolation — GitHub](https://github.com/nwiizo/ccswarm)
- [worktree flag silently fails on detached HEAD — Claude Code Issue #27466](https://github.com/anthropics/claude-code/issues/27466)
- [Allow specifying working directory for agent teams — Claude Code Issue #27578](https://github.com/anthropics/claude-code/issues/27578)
- [Windows: Disable automatic worktree creation — Cursor Forum](https://forum.cursor.com/t/windows-request-to-disable-automatic-worktree-creation-critical-disk-space-issue/146189)
- [git worktree Documentation — git-scm.com](https://git-scm.com/docs/git-worktree)
- [git-worktree-runner: Bash-based Git Worktree Manager — CodeRabbit/GitHub](https://github.com/coderabbitai/git-worktree-runner)
