---
name: github-ops
description: Workflow for repository reconnaissance and operations using GitHub CLI (gh). Optimizes token usage by using structured API queries instead of blind file fetching.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read]
best_practices:
  - List directory contents before fetching specific files
  - Use --jq to filter JSON output and reduce token noise
  - Combine multiple checks into single API calls where possible
error_handling: graceful
streaming: supported
---

# GitHub Ops Skill

Provides structured guidance for repository reconnaissance using `gh api` and `gh search`.

## Overview

Repository reconnaissance often fails when agents guess file paths or attempt to fetch large files blindly. This skill enforces a structured `Map -> Identify -> Fetch` sequence using the GitHub CLI to minimize token waste and improve reliability.

## ⚡ Essential Reconnaissance Commands

Use these commands to understand a repository structure before fetching content.

### 1. List Repository Root

```bash
gh api repos/{owner}/{repo}/contents --jq '.[].name'
```

### 2. List Specific Directory

```bash
gh api repos/{owner}/{repo}/contents/{path} --jq '.[].name'
```

### 3. Fetch File Content (Base64 Decoded)

```bash
gh api repos/{owner}/{repo}/contents/{path} --jq '.content' | base64 -d
```

### 4. Search for Pattern in Repository

```bash
gh search code "{pattern}" --repo {owner}/{repo}
```

### 5. Get Repository Metadata

```bash
gh repo view {owner}/{repo} --json description,stargazerCount,updatedAt
```

## 🔄 Token-Efficient Workflow

1.  **Map Tree**: List the root and core directories (`commands`, `src`, `docs`).
2.  **Identify Entrypoints**: Look for `README.md`, `gemini-extension.json`, `package.json`, or `SKILL.md`.
3.  **Targeted Fetch**: Download only the entrypoints first.
4.  **Deep Dive**: Use `gh search code` to find logic patterns rather than reading every file.

## 🛡️ Platform Safety (Windows)

- When using `base64 -d`, ensure the output is redirected to a file using the `Write` tool if it's large.
- Avoid Linux-style `/dev/stdin` patterns in complex pipes.
- Use native paths for any local storage.

## Assigned Agents

- **artifact-integrator**: Lead agent for repository onboarding.
- **developer**: PR management and exploration.

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
