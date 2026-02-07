---
name: github-ops
description: GitHub operations wrapper. Helps manage PRs, Issues, and Reviews efficiently via CLI.
version: 1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read]
best_practices:
  - Use gh CLI for all operations
  - Restrict JSON output to relevant fields
  - Verify authentication before operations
error_handling: graceful
streaming: supported
---

# GitHub Ops Skill

## Installation

The skill invokes the **GitHub CLI** (`gh`). Install and authenticate:

- **Windows**: `winget install --id GitHub.cli --source winget` or `choco install gh`
- **macOS**: `brew install gh`
- **Linux**: `sudo apt install gh` (Debian/Ubuntu), `sudo dnf install gh` (Fedora), `sudo pacman -S github-cli` (Arch)

Authenticate: `gh auth login`. Verify: `gh --version`

## Cheat Sheet & Best Practices

**PRs:** `gh pr create --fill` (title/body from commits); `gh pr create --reviewer handle`; `gh pr list --state open --limit 10`; `gh pr checkout <number>`; `gh pr view --web`. Link issues in body: "Fixes #123".

**Issues:** `gh issue create`; `gh issue list`; `gh search issues "is:open label:bug"`.

**Hacks:** Use `--web` for create/view when you want the UI. Use `--template .github/PULL_REQUEST_TEMPLATE.md` if you have one. Filter with `--assignee`, `--author`, `--label`. Use `gh auth status` to confirm identity.

## Certifications & Training

**GitHub:** [GitHub Learn](https://learn.github.com/certifications), [Microsoft Learn GitHub Training](https://learn.microsoft.com/en-us/training/github/) (GitHub Foundations). **Skill data:** PR create/list/checkout/view; issue create/search; `gh auth login`; link issues with "Fixes #123".

## Hooks & Workflows

**Suggested hooks:** Post-commit (optional): remind to push and open PR. Use with **developer** (with **github-mcp** in always) for CLI-based PR/issue ops; **devops** has github-mcp in always — add github-ops for scriptable gh CLI.

**Workflows:** Use with **developer** or **devops**. Flow: after git push → `gh pr create --fill` or `gh pr list`; use **git-expert** for git, **github-ops** for gh. See `.claude/workflows/code-review-workflow.md`.

## 🛠️ CLI Tools

We use `gh` (GitHub CLI) for all operations.

## 📋 Pull Requests

### Create PR

```bash
git push -u origin feature-branch
gh pr create --title "feat: description" --body "Summary of changes..."
```

### Checkout PR

```bash
gh pr checkout <number>
```

### Review PR

```bash
gh pr diff
gh pr review --approve
```

## 🐛 Issues

### List Issues

```bash
gh issue list --limit 5
```

### Create Issue

```bash
gh issue create --title "Bug: ..." --body "Reproduction steps..."
```

## 🤖 Context Optimization

Instead of dumping the entire JSON of an issue, use:

```bash
gh issue view <number> --json title,body,comments
```

This restricts the output to relevant fields only.

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
