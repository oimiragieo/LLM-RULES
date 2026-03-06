## ISSUE: TaskUpdate Metadata Compliance — Stale Reflections Tasks 16 and 1 (2026-03-05, session 2)

**Status**: OPEN — P1 (ESCALATED FURTHER — two more null-yield reflections in this session batch)

**Instances this batch**:

- Task 16 (2026-03-05T04:46:28.321Z) — fallback summary, score withheld
- Task 1 (2026-03-05T05:30:30.891Z) — fallback summary, score withheld
- Task 2 (2026-03-05T05:33:56.031Z) — real summary provided, score 0.81 (PASS, dataQuality: partial)

**Note**: Task 2 had a real summary ("Updated orchestrator agent prompts for search-first compliance") demonstrating agents CAN provide summaries. Tasks 16 and 1 are strict enforcement failures.

**Cumulative pattern**: 14+ violations now documented. The `pre-completion-validation.cjs` advisory mode is demonstrably insufficient.

**Immediate action required**: Convert hook from advisory (warn) to blocking (block) for the fallback string pattern `/Task \d+ completed without summary metadata/`.

**Priority**: P1 — now requires developer agent to implement the block mode.

---

## ISSUE: TaskUpdate Metadata Compliance Persistent Failure — Task 16 Missing Summary (2026-03-05)

**Status**: OPEN — P1 (ESCALATED — recurrence count now 12+, threshold for systemic action exceeded)

**Instance**: Task 16 (2026-03-05T04:46:28.321Z) — completed with fallback text "Task 16 completed without summary metadata"

**Pattern**: Identical fallback string observed across Tasks 7, 8, 1, 4, 10, 9, and now 16. Recurrence counter in failure-recurrence.json was at 11 for Task 9. Task 16 extends this streak.

**Data Quality**: Reflection analysis yielded `dataQuality: "insufficient"` — score withheld per Iron Law. No filesModified, no outputArtifacts, no summary provided.

**Cumulative Impact**: The learning system is accumulating null-yield reflection events. Each missing-metadata completion wastes a reflection cycle (hook fires, agent spawns, but no learnings can be extracted). The audit trail for Task 16 is a complete blank.

**Required Escalation**: The `pre-completion-validation.cjs` hook MUST be updated to BLOCK (not warn) when summary is the fallback string. Current advisory-only mode is failing to enforce the contract after 12+ violations.

**Actionable Fix**:

1. Update `pre-completion-validation.cjs`: change summary validation from warn to block when summary matches `/Task \d+ completed without summary metadata/`
2. Update all agent spawn templates to include the exact summary contract: "summary MUST be 50+ characters describing what was accomplished (not the fallback string)"
3. Escalate to evolution-orchestrator if next 3 reflections still yield insufficient data

**Priority**: P1 (upgraded from P2)

---

## ISSUE: TaskUpdate Metadata Compliance — 71% of Tasks Missing Summary (2026-03-04)

**Status**: OPEN — P2 (data quality issue affecting reflection)

**Findings**: Batch reflection of 7 tasks revealed:

- Task 2: Summary provided (multi-LLM review details)
- Tasks 3, 4, 5, 6, 7, 9: Summary missing (fallback text only)

**Compliance Breach**: TaskUpdate protocol requires summary metadata at completion. 5 of 7 tasks (71%) violated this.

**Impact**:

- Reflection analysis has insufficient data (only gap log available)
- Future reflections degrade in quality as metadata compliance worsens
- Task history becomes less useful for learning/debugging

**Root Cause**: Agents are completing tasks without calling TaskUpdate with summary metadata. Pre-completion-validation.cjs hook should be catching this but is not enforcing strictly enough.

**Fix**:

1. Make summary metadata REQUIRED in pre-completion-validation.cjs (currently may be only warning)
2. Add to all spawn templates: "summary must contain at least 50 characters describing what was accomplished"
3. Audit compliance across recent tasks; flag agents with <50% metadata compliance

**Evidence**:

- Batch reflection report: `.claude/context/reports/reflections/batch-reflection-session-2026-03-04.md`

**Priority**: P2 — improves future reflection quality but not blocking

---

## ISSUE: Devops Agent Commit-Without-Verification Pattern (2026-03-03) — P0 SYSTEMIC

**Status**: OPEN — P0 (ESCALATED from P1: Strike 2 confirmed same session, pattern now systemic)

**Pattern**: Devops agent stages files but fails to create a commit. Changes remain staged (A/M in git status) but HEAD hash is unchanged. Router detects via git log comparison (same HEAD hash before/after). Retry required with focused commit-only prompt.

**Evidence (this session)**:

- Gap log entry `2026-03-03T15:30:00Z` (Strike 1): devops completed, HEAD still at 4a3ee052, zero staged changes. Retry succeeded: commit a7ad75f4 created, 15 files pushed.
- Gap log entry `2026-03-03T17:30:00Z` (Strike 2): devops agent staged files but failed to create commit. HEAD unchanged at 180009b2. Staged files confirmed (A/M). Task 7 and Task 8 both completed without TaskUpdate metadata.
- MEMORY.md cross-reference: "devops agent fails to commit ~50% of the time. Pre-commit hooks (ESLint SEC-023, max-lines) block silently."

**Root Causes (confirmed)**:

1. Spawn prompt lacks explicit verification gate requiring `git log --oneline -1` after push
2. Pre-commit hooks (ESLint SEC-023, max-lines 500) silently block commit without error propagation to agent
3. Agent exits with success after `git add` but before verifying `git commit` output
4. Tasks 7 and 8 completed without TaskUpdate metadata — reflection agent cannot score or learn from these tasks

**Fix Path (URGENT — P0)**:

1. **Immediate**: Add mandatory commit verification to ALL devops spawn prompts for commit tasks:
   ```
   After every git commit attempt: run `git log --oneline -1` and confirm the new commit hash appears.
   If HEAD is unchanged, the commit FAILED. Do not call TaskUpdate(completed) — diagnose and retry.
   Include the commit hash in TaskUpdate summary metadata.
   ```
2. **Pre-commit hook transparency**: Capture `git commit` exit code and stderr explicitly. If non-zero, log the pre-commit hook failure reason before retrying.
3. **Router verification gate**: After any devops commit task, compare HEAD before/after before proceeding.
4. **Meta-issue**: Tasks 7 and 8 missing metadata — pre-completion-validation.cjs must enforce summary as BLOCKING (not warn).

**Recurrence count**: 3 confirmed failures in a single session (Strike 1, Strike 2 = Tasks 7+8)

**Priority**: P0 — blocking work committed without verification; reflection system cannot learn from lost metadata

---

## ISSUE: Router misrouting — developer used for git push instead of devops (2026-02-22)

**Status**: OPEN — P2 (routing/process issue)

**Observed**: Task-26 used developer agent for git commit + push to main instead of devops specialist agent.

**Impact**:

- Suboptimal agent selection; developer has limited deployment expertise
- Devops agent has proper deployment/CI/CD skills (vercel-deploy, gitops-workflow, etc.)
- Router's specialist-first routing law not enforced for git operations

**CLAUDE.md Requirement** (Section 1 — Specialist-First Routing Law):

```
| User Request Contains        | WRONG     | CORRECT   |
| "set up Docker/CI/deploy"    | developer | devops    |
```

**Root Cause**: Router did not check for git push/commit keywords before defaulting to developer.

**Expected Behavior**: Route all git commit/push/deploy operations → devops agent, NOT developer.

**Fix Required**:

1. Check routing-guard.cjs for git operation detection
2. OR add to CLAUDE.md routing table with explicit git-push example
3. OR update router self-check gates (Section 1.2) to detect git operations

**Evidence**:

- Task ID: task-26
- Actual agent: developer
- Expected agent: devops (from `@AGENT_ROUTING_TABLE.md`)

**Prevention**: All future spawns must check for git/deploy keywords → route to devops, not developer.

**Priority**: P2 (affects code quality and agent selection, but not blocking)

---

## Skill Registration Gap: webmcp-browser-tools (2026-02-22)

- [ ] Catalog: PRESENT (skill-catalog.md line 161)
- [ ] Index: MISSING (skill-index.json has no entry)
- [ ] Agent assignment: PRESENT (frontend-pro, developer, researcher)
      Source: reflection of tasks #28-31 (2026-02-22)

**Fix**: Run `node .claude/tools/cli/generate-skill-index.cjs` after any manual SKILL.md creation.

---

## ISSUE: skill-index.json not auto-regenerated after manual SKILL.md creation (2026-02-22)

**Status**: OPEN — P2 (recurring)

**Pattern**: Manually created SKILL.md files (via developer agent or direct write) do not auto-populate `.claude/config/skill-index.json`. The generate-skill-index.cjs script must be run explicitly. This is the 2nd confirmed occurrence (first: smart-debug wiring initiative 2026-02-21).

**Impact**: Skills invisible to routing/discovery systems that rely on skill-index.json for agent-skill mapping.

**Fix**: After every new SKILL.md creation, run: `node .claude/tools/cli/generate-skill-index.cjs`

**Prevention**: Add to skill-creator post-creation checklist and proactive-audit S-05 check (pnpm validate:skills).

---

## ISSUE: Missing TaskUpdate Summary Metadata — Recurring Pattern (2026-03-03) — P1

**Status**: OPEN — P1 (RECURRING — count 11+ instances confirmed in failure-recurrence.json)

**Observed**: Reflection IDs for tasks 2 and 3 (2026-03-03T17:48:52Z and 2026-03-03T17:51:49Z) completed with "Task X completed without summary metadata". This is the 11th+ instance of this failure class recorded in failure-recurrence.json.

**Root Cause**: Agents call `TaskUpdate({ status: 'completed' })` without including `metadata.summary`. The `pre-completion-validation.cjs` hook either is not enforcing the summary field or is set to warn mode rather than block mode.

**Impact**:

- Reflection agent cannot score or extract learnings from the task (dataQuality: "insufficient")
- Audit trail has gaps — completed work is invisible to post-session analysis
- Learning system degrades as pattern recurrence increases

**Recurrence**: Confirmed in reflection-log.jsonl entries for tasks 33, 34, 35 (2026-03-03 session), tasks 2, 3 (2026-03-03 session 2), AND tasks 7, 8 (2026-03-03 session 3 — Strike 2 devops commit failure). Total: 13+ confirmed instances across multiple sessions.

**Fix Path (P1)**:

1. Set `pre-completion-validation.cjs` to block mode (not warn) for missing summary
2. Add summary field to all spawn prompt templates as MANDATORY contract
3. Add summary validation to `universal-agent-spawn.md` TaskUpdate warning box
4. Consider adding `SUMMARY_REQUIRED_ENFORCEMENT=block` env var

**Evidence**:

- `.claude/context/runtime/failure-recurrence.json`: failureClass "missing_task_summary", count 11+
- Reflection IDs: `task_completion:2026-03-03T17:51:49.164Z:3`, `task_completion:2026-03-03T17:48:52.471Z:2`
- reflection-log.jsonl entries: tasks 33, 34, 35 (2026-03-03)

---

## NOTE: Routing Warning Pattern (2026-02-24)

~200+ routing warnings logged from routing-guard.cjs test runs spanning 2026-02-24 through 2026-03-02. These are from automated specialist-routing enforcement tests, not real misrouting incidents. Pattern: "Developer task routing warned. Keyword X suggests specialist Y." All from the same recurring test batches — not actionable individually.

The warnings confirmed routing-guard.cjs correctly detects specialist keywords (technical-writer, code-simplifier, code-reviewer, qa, devops, database-architect, researcher, devops-troubleshooter, incident-responder, security-architect, etc.) but enforcement was set to warn rather than block during the test period. See CLAUDE.md Section 1.3 for current enforcement modes.
