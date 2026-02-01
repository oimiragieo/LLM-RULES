---
name: git-expert
description: Advanced Git operations wrapper. Optimizes token usage by guiding complex git workflows into efficient CLI commands.
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read]
best_practices:
  - Never use git push --force
  - Never commit secrets
  - Always run tests before pushing
error_handling: graceful
streaming: supported
---

# Git Expert Skill

## Installation

The skill invokes the `git` CLI. Install Git if not present:

- **Windows**: Download from [git-scm.com](https://git-scm.com/download/win) or `winget install --id Git.Git -e --source winget`
- **macOS**: `brew install git` or Xcode CLI tools: `xcode-select --install`
- **Linux**: `apt-get install git` (Debian/Ubuntu), `dnf install git` (Fedora), `pacman -S git` (Arch)

Verify: `git --version`

## Cheat Sheet & Best Practices

**Essential commands (token-efficient):**
- `git status -s` — short status; `git add -p` — stage hunks; `git diff --cached` — review staged
- `git switch -c <branch>` or `git checkout -b <branch>` — new branch; `git branch` — list
- `git log --oneline -5` — compact history; `git log --follow <file>` — track renames
- `git restore <file>` — discard unstaged; `git reset --soft HEAD~1` — undo last commit (keep changes)
- `git fetch` then `git merge` or `git pull` — prefer fetch+merge over blind pull

**Hacks:** Set `git config --global color.ui auto` and `user.name`/`user.email`. Use `.gitignore` aggressively. Prefer `git merge --squash` for clean history on feature merge. Use `git cherry-pick <commit>` to bring single commits. Never rebase pushed commits without team agreement.

## Certifications & Training

**Free / official:** [Atlassian Git Tutorials](https://www.atlassian.com/git/tutorials) (beginner–advanced). [Microsoft Learn – GitHub Training](https://learn.microsoft.com/en-us/training/github/) (GitHub Foundations path). [GitHub Learn](https://skills.github.com/) (Git + GitHub). No single “Git cert”; GitHub Foundations aligns with fundamentals.

**Skill data:** Focus on branching, undo (reset/restore/revert), merge vs rebase, remote workflow, and safety (no force-push, no secrets).

## Hooks & Workflows

**Suggested hooks:** Pre-commit: run `commit-validator` (conventional commits). Pre-push: run tests (reference `tdd` / `verification-before-completion`). Post-merge: optional memory/learnings update.

**Workflows:** Use with **developer** (primary), **devops** (always). Flow: branch → edit → add → validate commit message → commit → push; use **github-ops** or **github-mcp** for PR/create. See `.claude/workflows` for feature-development and code-review workflows that use git-expert.

## ⚡ Token-Efficient Workflow

Do not use `git status` repeatedly. Use this workflow:

1.  **Check State**: `git status -s` (Short format saves tokens)
2.  **Diff**: `git diff --cached` (Only check what you are about to commit)
3.  **Log**: `git log --oneline -5` (Context without the noise)

## 🔄 Common Patterns

### Safe Commit

```bash
git add <file>
git diff --cached # REVIEW THIS!
git commit -m "feat: description"
```

### Undo Last Commit (Soft)

```bash
git reset --soft HEAD~1
```

### Fix Merge Conflict

1. `git status` to see conflict files.
2. Edit file to resolve markers (`<<<<`, `====`, `>>>>`).
3. `git add <file>`
4. `git commit --no-edit`

## 🛡️ Safety Rules

- NEVER use `git push --force`.
- NEVER commit secrets.
- ALWAYS run tests before pushing.

## Related Skills

- [`gitflow`](../gitflow/SKILL.md) - Branch workflow patterns (feature, release, hotfix branches)

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
