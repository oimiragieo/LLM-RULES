## CRITICAL DIAGNOSIS: Reflection-Agent Atomic Handshake Root Cause (2026-02-22 Task #37)

**Status**: DIAGNOSED — Root cause identified, fix strategy documented

**Root Cause**: Background task spawning (`run_in_background: true`) does not properly initialize tool whitelist for reflection-agent. When Router spawns reflection-agent in background mode, the TaskUpdate tool becomes unavailable at runtime despite being listed in frontmatter.

**Evidence**:

- session-gap-log.jsonl entry (2026-02-22T01:30:00Z): "Background-spawned reflection-agent (run_in_background:true) reported TaskUpdate unavailable"
- Entry context: "Root cause: run_in_background spawns may not receive full tool whitelist"
- Mitigation note: "never spawn reflection-agent with run_in_background:true — always foreground"

**Affected Components**:

1. **tool-scope-validator.cjs** — may not handle background vs foreground context correctly
2. **pre-completion-validation.cjs** — may block metadata-only TaskUpdate calls from reflection-agent
3. **reflection-step0-guard.cjs** — cannot clean up processed requests without atomic handshake

**Fix Strategy**:

1. Audit tool-scope-validator.cjs line-by-line for background context handling
2. Test pre-completion-validation.cjs with reflection-agent metadata payload
3. Add foreground-only enforcement to CLAUDE.md Step 0 routing-guard.cjs
4. Create CI test that verifies reflection-agent atomic handshake in isolation

**Analysis Report**: `.claude/context/reports/reflections/reflection-agent-atomic-handshake-analysis-2026-02-22.md` (200+ lines, full diagnosis with hypotheses and verification steps)

---

## ISSUE: Reflection-Agent Cannot Complete Atomic Handshake (2026-02-22 BLOCKER)

**Status**: OPEN — P1 BLOCKER

**Observed**: Reflection-agent invoked to process tasks 21, 22, 14 but cannot call TaskUpdate() for atomic completion handshake.

**Error**: "No such tool available: TaskUpdate" when attempting to mark reflection complete with processedReflectionIds metadata.

**Impact**:

- Reflection-spawn-request.json entries remain marked as processed: false
- reflection-cleanup.cjs cannot remove processed reflections
- Next Router iteration sees same reflections again (duplicate processing)
- Memory state becomes inconsistent

**Expected Behavior** (per CLAUDE.md Section 2):

```javascript
TaskUpdate({
  taskId: 'reflection-task-X',
  status: 'completed',
  metadata: { processedReflectionIds: ['task_completion:...', 'task_completion:...'] },
});
```

**Actual Behavior**: TaskUpdate tool not available in reflection-agent runtime context.

**Root Cause**: Possible causes:

1. Reflection-agent spawned via Skill() (non-standard routing) instead of Task()

---

## ISSUE: Router Gap Observation False Positive (2026-02-22)

**Status**: RESOLVED — Gap observation inaccurate

**Observed Gap**: Router flagged task-27-research as "researcher produced TEST_STUB instead of actual research report for webmcp/Claude features"

**Reality**: `.claude/context/artifacts/research-reports/claude-features-webmcp-research-2026-02-22.md` is a **complete 200+ line report** with:

- Executive summary on 4 Claude features
- Research methodology (6 queries documented)
- 9 sources with credibility ratings
- Detailed findings on WebMCP (W3C proposal), Claude Memory Tool (84% token reduction), Worktrees (git isolation), Healthcare (FHIR integration)
- Integration opportunities for agent-studio

**Assessment**: FALSE POSITIVE — router's gap observation mechanism is unreliable

**Root Cause**: Router likely checked file metadata (size/modification time) rather than content verification

**Learning**: Router gap observations need content validation before recording as systemic issues. File existence and size are insufficient signals for placeholder detection.

**Mitigation**: When router flags placeholder output, require reflection-agent to read file content before classifying as blocked/incomplete.

---

## ISSUE: Router Misrouting Precedent (2026-02-22) — Systemic Pattern

**Status**: OPEN — P2 (recurring risk, not blocking)

**Observed**: Developer agent used for git commit+push instead of devops (task-26)

**Expected**: CLAUDE.md Section 1 Common Misrouting table clearly documents: "git push / commit / deploy" → **devops specialist**

**Pattern**: This is a recurring misrouting risk:

- ✗ developer for deploy/CI/git operations
- ✓ devops for git push, commit, deployment, infrastructure

**Systematic Cause**: Router's specialist-first check (routing-guard.cjs Check 7) may not be catching all git/deploy intent variants

**Precedent**: Router successfully detected and logged this; reinforces importance of specialist routing enforcement

**Fix**: Expand routing keywords for devops agent to catch more git/CI/deployment intent variations

---

## ISSUE: Reflection-Agent Background Spawn Limitation (2026-02-22)

**Status**: OPEN — P1 mitigation required

**Root Cause**: Reflection-agent spawned with `run_in_background: true` loses TaskUpdate tool in whitelist

**Evidence**:

- From session-gap-log: "Root cause: run_in_background spawns may not receive full tool whitelist"
- Mitigation documented: "never spawn reflection-agent with run_in_background: true — always foreground"

**Pattern**: Applies to any background-spawned agent that needs atomic completion handshake

**Mitigation**: CLAUDE.md Step 0 must enforce reflection-agent ALWAYS foreground (no background spawns)

**Related**: May affect other background spawn patterns; check if run_in_background affects tool whitelist globally 2. Tool whitelist configuration missing TaskUpdate for reflection-agent 3. Skill framework overrides standard tool availability

**Workaround**: None — requires Router or system configuration fix.

**Evidence**:

- Reflection report: `.claude/context/reports/reflections/reflection-tasks-21-22-14-insufficient-data-2026-02-22.md`
- Briefing requirement: "ATOMIC COMPLETION: In your final TaskUpdate({ status: "completed" }), include: metadata: { processedReflectionIds: [...] }"
- Error message: "No such tool available: TaskUpdate"

**Resolution Required**:

1. Check if reflection-agent was spawned correctly (should be Task(), not Skill())
2. Verify tool whitelist includes TaskUpdate for reflection-agent type
3. Re-invoke reflection-agent with correct spawning mechanism
4. Manually update reflection-spawn-request.json entries to mark processed: true if automated cleanup cannot run

**Priority**: P1 (blocks reflection completion handshake across entire system)

---

## (END ENTRY 2026-02-22)

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

## Skill Registration Gap: proactive-audit (2026-02-22)

- [ ] Catalog: PRESENT (skill-catalog.md line 314)
- [ ] Index: MISSING (skill-index.json has no entry)
- [ ] Agent assignment: PRESENT (qa, developer, architect)
      Source: reflection of tasks #28-31 (2026-02-22)

**Fix**: Run `node .claude/tools/cli/generate-skill-index.cjs` after any manual SKILL.md creation.

---

## ISSUE: skill-index.json not auto-regenerated after manual SKILL.md creation (2026-02-22)

**Status**: OPEN — P2 (recurring)

**Pattern**: Manually created SKILL.md files (via developer agent or direct write) do not auto-populate `.claude/config/skill-index.json`. The generate-skill-index.cjs script must be run explicitly. This is the 2nd confirmed occurrence (first: smart-debug wiring initiative 2026-02-21).

**Impact**: Skills invisible to routing/discovery systems that rely on skill-index.json for agent-skill mapping.

**Fix**: After every new SKILL.md creation, run: `node .claude/tools/cli/generate-skill-index.cjs`

**Prevention**: Add to skill-creator post-creation checklist and proactive-audit S-05 check (pnpm validate:skills).
