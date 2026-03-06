---
name: git-expert
description: Advanced Git operations wrapper. Optimizes token usage by guiding complex git workflows into efficient CLI commands.
version: 1.2.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read]
best_practices:
  - Never use git push --force
  - Never commit secrets
  - Always run tests before pushing
  - Use SSH key signing instead of GPG for commit verification
  - Use sparse-checkout cone mode for monorepo workflows
  - Use Git Scalar for large repository performance optimization
  - Prefer reftable backend for new repositories (Git 2.45+)
error_handling: graceful
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
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

1. **Check State**: `git status -s` (Short format saves tokens)
2. **Diff**: `git diff --cached` (Only check what you are about to commit)
3. **Log**: `git log --oneline -5` (Context without the noise)

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

## Iron Laws

1. **NEVER** use `git push --force` on shared branches — force-pushing rewrites history for all collaborators, causes lost commits, and breaks in-progress rebases silently; use `--force-with-lease` when truly necessary.
2. **NEVER** commit secrets, credentials, or tokens to the repository — once pushed, secrets are visible in all forks and clones forever even after deletion from HEAD.
3. **ALWAYS** run the test suite and verify it passes before pushing to shared branches — broken code in shared branches blocks everyone and triggers emergency rollbacks.
4. **ALWAYS** rebase feature branches onto the base branch before merging — merging with a stale base creates avoidable conflicts and produces noisy merge commits in shared history.
5. **NEVER** rebase or rewrite history on commits that have already been pushed to a shared remote — teammates' local branches will diverge and produce duplicate commits on next pull.

## Anti-Patterns

| Anti-Pattern                            | Why It Fails                                                              | Correct Approach                                                           |
| --------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `git push --force` on shared branches   | Overwrites teammates' commits; destroys in-progress rebase branches       | Use `--force-with-lease` for personal branches only; never on main/develop |
| Committing `.env` or credentials        | Permanently visible in history even after deletion; requires key rotation | Add sensitive files to `.gitignore`; use pre-commit secret-scanning hooks  |
| Long-lived feature branches (>5 days)   | Massive merge conflicts; integration bugs discovered too late             | Use short-lived branches with daily rebases onto main (trunk-based dev)    |
| `git commit -m "fix"` or `wip` messages | Makes `git log` useless for bisect and changelog generation               | Use conventional commits: `fix: resolve null pointer in user auth`         |
| Merging without pulling latest base     | Stale merge base; CI catches conflicts only after the merge lands         | `git fetch && git rebase origin/main` before any merge or PR               |

## Git 2.45–2.50 Features (2024–2025)

### Reftable Backend (Git 2.45+)

The reftable backend completely replaces the legacy `files` reference format with a binary format that is faster, atomic, and storage-efficient:

**Benefits:**

- Atomic multi-ref updates (all-or-nothing transactions)
- Faster single-ref lookup and iteration over ref ranges
- Consistent reads — never reads a partial update state
- More efficient reflog storage

**Enable for a new repository:**

```bash
git init --ref-format=reftable my-repo
```

**Check current backend:**

```bash
git rev-parse --show-ref-format
# outputs: files  OR  reftable
```

**Migration note:** Converting an existing repo from `files` to `reftable` requires re-cloning or using `git clone --ref-format=reftable`. Clients using `files` repos are unaffected — the backend is server/local only.

### Incremental Multi-Pack Indexes (Git 2.47+)

Multi-pack indexes (MIDXs) allow Git to maintain a single index across multiple packfiles without repacking. Git 2.47 adds incremental MIDX updates — only newly added packs are indexed rather than rebuilding the full MIDX:

```bash
# Generate or update multi-pack index
git multi-pack-index write --stdin-packs

# Verify the MIDX
git multi-pack-index verify

# Enable via maintenance
git maintenance start
```

**Multi-pack reachability bitmaps** extend MIDX with precomputed reachability data, dramatically speeding up `git clone`, `git fetch`, and garbage collection on large repositories.

### Sparse Checkout for Monorepos (Git 2.25+ cone mode)

Sparse checkout lets you check out only the directories you need from a large monorepo:

```bash
# Clone without checking out any files
git clone --no-checkout --filter=blob:none https://github.com/org/monorepo.git
cd monorepo

# Initialize in cone mode (recommended — uses fast prefix matching)
git sparse-checkout init --cone

# Check out only specific directories
git sparse-checkout set frontend docs shared/utils

# See what is currently checked out
git sparse-checkout list

# Add more directories without losing current ones
git sparse-checkout add backend/api

# Disable sparse checkout (restore full working tree)
git sparse-checkout disable
```

**One-command clone (Git 2.25+):**

```bash
git clone --filter=blob:none --sparse https://github.com/org/monorepo.git
cd monorepo
git sparse-checkout set services/payments
```

**Cone mode vs. non-cone mode:**

| Mode               | Pattern Matching              | Performance                   |
| ------------------ | ----------------------------- | ----------------------------- |
| Cone (recommended) | Directory prefix only         | Fast (O(log n) path matching) |
| Non-cone           | Full gitignore-style patterns | Slow on large trees           |

### Git Scalar — Large Repository Optimization

Scalar is a repository management tool bundled with Git (since Git 2.38) that configures and maintains all recommended performance settings automatically:

```bash
# Clone a large repo with all performance features enabled
scalar clone https://github.com/org/large-monorepo.git

# Register an existing repo with Scalar
scalar register

# Run all maintenance tasks manually
scalar run all

# View configured enlistments
scalar list
```

**What Scalar configures automatically:**

- Partial clone (`--filter=blob:none`)
- Sparse checkout (cone mode)
- File system monitor (`core.fsmonitor`)
- Commit graph generation
- Background maintenance (hourly fetch, daily gc)
- Multi-pack index

### Sign Commits with SSH Keys (Git 2.34+)

SSH key signing is simpler than GPG and works with keys you already use for authentication:

```bash
# Configure SSH signing globally
git config --global gpg.format ssh
git config --global user.signingKey ~/.ssh/id_ed25519.pub

# Sign all commits automatically
git config --global commit.gpgSign true

# Or sign a single commit manually
git commit -S -m "feat: add payment service"

# Verify a commit
git verify-commit HEAD
```

**Set up an allowed-signers file for team verification:**

```bash
# ~/.config/git/allowed_signers
alice@example.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
bob@example.com   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA...
```

```bash
git config --global gpg.ssh.allowedSignersFile ~/.config/git/allowed_signers
git log --show-signature
```

**GitHub verification:** Add your SSH signing key to GitHub under `Settings > SSH and GPG keys > New SSH key > Signing Key`. Commits signed with that key will show "Verified" on GitHub.

**FIDO2 / hardware security key signing:**

```bash
# Generate a resident key on a FIDO2 security key (e.g., YubiKey)
ssh-keygen -t ed25519-sk -O resident -f ~/.ssh/id_ed25519_sk_fido2
git config --global user.signingKey ~/.ssh/id_ed25519_sk_fido2.pub
```

### Improved Merge Strategies (Git 2.38+ `ort`)

The `ort` merge strategy has been the default since Git 2.34. It is significantly faster than `recursive` for large trees and more deterministic:

```bash
# ort is the default; explicitly select if needed
git merge -s ort feature/my-feature

# Rename detection threshold (default 50%)
git merge -X rename-threshold=80 feature/rename-heavy-branch

# Conflict style: diff3 (shows common ancestor) — strongly recommended
git config --global merge.conflictStyle diff3
# Or zdiff3 (even cleaner context in conflicts, Git 2.35+)
git config --global merge.conflictStyle zdiff3
```

### Performance Commands for Large Repos

```bash
# Enable file system monitor (avoids scanning entire tree for status)
git config core.fsmonitor true
git config core.untrackedCache true

# Precompute commit graph for faster log/blame
git commit-graph write --reachable --changed-paths
git config fetch.writeCommitGraph true

# Partial clone — skip large blobs on clone, fetch on demand
git clone --filter=blob:none <url>

# Shallow clone (CI use case — last N commits only)
git clone --depth=1 <url>

# Check repository health and performance
GIT_TRACE_PERFORMANCE=1 git status
```

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
