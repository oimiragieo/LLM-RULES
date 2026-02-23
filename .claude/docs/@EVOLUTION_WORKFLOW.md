# EVOLVE Workflow

**Source:** CLAUDE.md Section 4
**Version:** v2.2.1
**Last Updated:** 2026-02-15

---

## PURPOSE

Complete EVOLVE workflow specification (E→V→O→L→V→E) for self-evolution, artifact creation, and capability expansion.

---

## CONTENT

### When EVOLVE Triggers

- User requests missing capability
- Router detects "no matching agent"
- Pattern analyzer suggests evolution
- Explicit create agent/skill/workflow/hook/template/schema
- Reflection marks an existing artifact (agent/skill/workflow) as stale/underperforming and requires refresh

### EVOLVE Acronym (mandatory)

```
E -> V -> O -> L -> V -> E
Evaluate -> Validate -> Obtain (Research) -> Lock -> Verify -> Enable & Monitor
```

### Phase O: Research Requirement (CANNOT BE SKIPPED)

Before creating ANY artifact:

- Minimum 3 Exa/WebSearch queries executed
- Minimum 3 external sources consulted
- Research report generated + saved to `.claude/context/artifacts/research-reports/`
- Design decisions have documented rationale

**Why Phase O is mandatory:**

- Prevents reinventing the wheel
- Ensures industry best practices
- Documents design decisions
- Provides rationale for future maintainers

### Enforcement Hooks

| Hook                               | Purpose                          | Location                   |
| ---------------------------------- | -------------------------------- | -------------------------- |
| `research-enforcement.cjs`         | Blocks creation without research | `.claude/hooks/evolution/` |
| `evolution-state-guard.cjs`        | Enforces state transitions       | `.claude/hooks/evolution/` |
| `conflict-detector.cjs`            | Prevents naming conflicts        | `.claude/hooks/evolution/` |
| `artifact-scoring-ledger-hook.cjs` | Logs artifact scoring outcomes   | `.claude/hooks/quality/`   |

### State Tracking

**File:** `.claude/context/evolution-state.json`

**Tracks:**

- Current phase (E/V/O/L/V/E)
- Research entries (queries, sources, reports)
- Evolution history
- Patterns discovered
- Suggestions queue

### Spawning Evolution (concrete recipe)

When router detects "no matching agent" or user requests new capability:

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'evolution-orchestrator',
  model: 'opus', // MUST use opus for complex reasoning
  description: 'Creating new agent/skill via EVOLVE workflow',
  allowed_tools: [
    'Read',
    'Write',
    'Edit',
    'Task',
    'Skill',
    'mcp__Exa__web_search_exa', // Research Phase O
    'mcp__Exa__get_code_context_exa', // Research Phase O
    'TaskUpdate',
    'TaskList',
    'TaskCreate',
    'TaskGet',
  ],
  prompt: `You are EVOLUTION-ORCHESTRATOR. Follow the EVOLVE workflow.

Requested capability: <DESCRIBE WHAT USER NEEDS>

1. Read: .claude/agents/orchestrators/evolution-orchestrator.md
2. Follow: .claude/workflows/core/evolution-workflow.md
3. CRITICAL: Phase O (Obtain/Research) is MANDATORY - minimum 3 Exa queries before creating artifact.
4. Use Skill({ skill: "research-synthesis" }) then:
   - net-new agent/skill/workflow -> corresponding creator skill
   - existing agent refresh -> Skill({ skill: "agent-updater" })
   - existing skill refresh -> Skill({ skill: "skill-updater" })
   - existing workflow refresh -> Skill({ skill: "workflow-updater" })
   - other artifacts -> appropriate creator skill.

Task ID: <ID>
FIRST: TaskUpdate({ taskId: "<ID>", status: "in_progress" });
LAST: TaskUpdate({ taskId: "<ID>", status: "completed", metadata: {...} });`,
});
```

### EVOLVE Phase Details

**E - Evaluate:**

- Assess user request
- Determine artifact type (agent/skill/workflow/hook/template/schema)
- Check if capability already exists

**V - Validate:**

- Confirm request is legitimate
- Check for duplicate/conflicting artifacts
- Verify naming conventions

**O - Obtain (Research):**

- **MANDATORY:** Execute minimum 3 Exa/WebSearch queries
- Consult minimum 3 external sources
- Generate research report
- Document design decisions and rationale
- **Enforced by:** `research-enforcement.cjs`

**L - Lock:**

- Create artifact files
- For existing refreshes, use dedicated updaters (`agent-updater`, `skill-updater`, `workflow-updater`) instead of net-new creators
- Update CLAUDE.md routing references
- Update catalogs/registries
- Assign artifact to relevant agents

**V - Verify:**

- Validate artifact structure
- Run schema validation
- Test artifact functionality
- Verify integration

**E - Enable & Monitor:**

- Enable artifact for production use
- Monitor usage and errors
- Record learnings in memory
- Track evolution in evolution-state.json

### Research Report Template

**Location:** `.claude/context/artifacts/research-reports/<artifact-name>-research-<timestamp>.md`

```markdown
# Research Report: <Artifact Name>

**Date:** <timestamp>
**Researcher:** evolution-orchestrator
**Artifact Type:** <agent|skill|workflow|hook|template|schema>

## Research Summary

<1-2 paragraphs summarizing findings>

## Sources Consulted

1. Source 1 Title - <key takeaways>
2. Source 2 Title - <key takeaways>
3. Source 3 Title - <key takeaways>

## Key Findings

- Finding 1
- Finding 2
- Finding 3

## Design Decisions

| Decision     | Rationale | Alternatives Considered |
| ------------ | --------- | ----------------------- |
| <decision 1> | <why>     | <alternatives>          |
| <decision 2> | <why>     | <alternatives>          |

## Recommendations

<Artifact creation recommendations based on research>
```

---

## RELATED REFERENCES

- **@CREATOR_SKILLS_TABLE.md** - Creator skills invoked during Phase L
- **@ENFORCEMENT_HOOKS.md** - research-enforcement.cjs enforcement
- **@AGENT_ROUTING_TABLE.md** - evolution-orchestrator routing

---

## BACK TO MAIN

See **CLAUDE.md** Section 4 for inline summary.
