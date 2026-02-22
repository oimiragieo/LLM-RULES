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
2. Tool whitelist configuration missing TaskUpdate for reflection-agent
3. Skill framework overrides standard tool availability

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
