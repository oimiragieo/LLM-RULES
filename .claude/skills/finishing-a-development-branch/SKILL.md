---
name: finishing-a-development-branch
version: 1.1.0
category: 'Git & Version Control'
agents: [developer, devops]
tags: [git, branch, merge, pull-request, completion, lint, tests]
description: Complete development with structured merge/PR options. Use when ready to merge or submit work.
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read]
best_practices:
  - Verify tests pass before any merge option
  - Present all 4 options (merge, PR, keep, discard)
  - Clean up worktrees after completion
error_handling: strict
streaming: supported
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests -> Present options -> Execute choice -> Clean up.

**Announce at start:** "I'm using the finishing-a-development-branch skill to complete this work."

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**

```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 2.

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 3: Present Options

Present exactly these 4 options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Don't add explanation** - keep options concise.

### Step 4: Execute Choice

#### Option 1: Merge Locally

```bash
# Switch to base branch
git checkout <base-branch>

# Pull latest
git pull

# Merge feature branch
git merge <feature-branch>

# Verify tests on merged result
<test command>

# If tests pass
git branch -d <feature-branch>
```

Then: Cleanup worktree (Step 5)

#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Then: Cleanup worktree (Step 5)

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**

```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:

```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

Then: Cleanup worktree (Step 5)

### Step 4.5: Cleanup Scan (MANDATORY)

**Run this before ANY commit, regardless of which option was chosen.**

**4.5.1 — Project root scan:**

```bash
ls -1 | grep -vE '^(\.|node_modules|src|tests|scripts|dist|build|docs|package\.json|package-lock\.json|pnpm-lock\.yaml|tsconfig|eslint|prettier|jest|vitest|README|LICENSE|CHANGELOG|CLAUDE\.md|\.env)'
```

If this outputs anything, those files are AI slop. Delete or move them before proceeding.

**4.5.2 — Prune stale worktrees:**

```bash
git worktree prune
```

**4.5.3 — Clean temp directory:**

```bash
ls .claude/context/tmp/ 2>/dev/null && echo "Temp files exist — delete if from this session"
```

**4.5.4 — Log to session gap log if slop was found:**

```bash
echo '{"timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","type":"cleanup","agent":"developer","description":"Deleted AI slop from project root: <filenames>","context":"finishing-a-development-branch cleanup scan"}' >> .claude/context/runtime/session-gap-log.jsonl
```

**4.5.5 — Queue reflection if slop was found** (append to `reflection-spawn-request.json`):

```json
{
  "id": "<uuid>",
  "trigger": "ai-slop-found",
  "priority": "low",
  "context": "Cleanup scan found unexpected files in project root. Investigate which task created them."
}
```

See `.claude/rules/cleanup-always.md` for the full slop pattern list and correct file destinations.

### Step 5: Cleanup Worktree

**For Options 1, 2, 4:**

Check if in worktree:

```bash
git worktree list | grep $(git branch --show-current)
```

If yes:

```bash
git worktree remove <worktree-path>
```

**For Option 3:** Keep worktree.

## Quick Reference

| Option           | Merge | Push | Keep Worktree | Cleanup Branch |
| ---------------- | ----- | ---- | ------------- | -------------- |
| 1. Merge locally | Yes   | -    | -             | Yes            |
| 2. Create PR     | -     | Yes  | Yes           | -              |
| 3. Keep as-is    | -     | -    | Yes           | -              |
| 4. Discard       | -     | -    | -             | Yes (force)    |

## Common Mistakes

**Skipping test verification**

- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**

- **Problem:** "What should I do next?" -> ambiguous
- **Fix:** Present exactly 4 structured options

**Automatic worktree cleanup**

- **Problem:** Remove worktree when might need it (Option 2, 3)
- **Fix:** Only cleanup for Options 1 and 4

**No confirmation for discard**

- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

## Red Flags

**Never:**

- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request

**Always:**

- Verify tests before offering options
- Present exactly 4 options
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only

## Integration

**Called by:**

- **subagent-driven-development** (Step 7) - After all tasks complete
- **executing-plans** (Step 5) - After all batches complete

**Pairs with:**

- **using-git-worktrees** - Cleans up worktree created by that skill

## Documentation Gate (BLOCKING — must pass before commit)

Before ANY commit on a feature/skill/agent branch:

- [ ] **CHANGELOG.md** — entry added under `[Unreleased]` with today's date
- [ ] **README.md** — updated if agent/skill counts changed or new user-facing capability added
- [ ] **.env.example** — commented entry added for EVERY new API key, token, or env var introduced
- [ ] **Skill/agent description** — frontmatter `description:` accurately reflects new capabilities

If any item is unchecked → DO NOT COMMIT. Update docs first.

## Iron Laws

1. **ALWAYS** run the full test suite and verify it passes before offering any merge/PR option — presenting merge options with failing tests leads to broken main branches and failed CI pipelines.
2. **NEVER** force-push to main/master or squash commits without explicit user request — these operations rewrite history and can permanently destroy teammates' work.
3. **ALWAYS** present exactly the 4 structured options (merge, PR, keep, discard) — open-ended "what next?" questions cause confusion and missed cleanup steps.
4. **NEVER** delete a branch or discard work without typed confirmation from the user — accidental deletion of uncommitted work is irreversible.
5. **ALWAYS** clean up the worktree for Options 1 and 4 but preserve it for Options 2 and 3 — orphaned worktrees accumulate and confuse future git operations.

## Anti-Patterns

| Anti-Pattern                                 | Why It Fails                                                    | Correct Approach                                           |
| -------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Skipping test verification before merge      | Broken code lands on main; CI fails after the fact              | Always run test suite first; gate options on passing tests |
| Presenting open-ended completion questions   | Developer doesn't know available paths; worktrees left orphaned | Present exactly 4 numbered options with clear labels       |
| Deleting branch without confirmation         | Developer loses in-progress work permanently                    | Require typed "discard" confirmation for Option 4          |
| Cleaning up worktree for Option 2 (PR)       | Kills local context before PR review is complete                | Only remove worktree for Options 1 and 4                   |
| Merging directly without pulling latest base | Merge conflicts or stale base; CI detects drift                 | `git pull` on base branch before `git merge`               |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
