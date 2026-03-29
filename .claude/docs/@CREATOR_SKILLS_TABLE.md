# Creator Skills Table

**Source:** CLAUDE.md Section 3 (subsection)
**Version:** v3.1.0
**Last Updated:** 2026-02-15

---

## PURPOSE

Complete mapping of creator skills invoked via `Skill()` tool for creating new artifacts (agents, skills, workflows, hooks, templates, schemas).

---

## CONTENT

### Creator Skills (invoked via `Skill()`, not standalone agents)

| Request Type                  | Creator Skill\*        | Skill File                                                                           |
| ----------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| **Before ANY creation**       | `research-synthesis`\* | `.claude/skills/research-synthesis/SKILL.md`                                         |
| **No matching agent**         | `agent-creator`\*      | `.claude/skills/agent-creator/SKILL.md`                                              |
| **Refresh existing agent**    | `agent-updater`\*      | `.claude/skills/agent-updater/SKILL.md`                                              |
| **New tool/capability**       | `skill-creator`\*      | `.claude/skills/skill-creator/SKILL.md`                                              |
| **Refresh existing skill**    | `skill-updater`\*      | `.claude/skills/skill-updater/SKILL.md`                                              |
| **New workflow**              | `workflow-creator`\*   | `.claude/skills/workflow-creator/SKILL.md`                                           |
| **Refresh existing workflow** | `workflow-updater`\*   | `.claude/skills/workflow-updater/SKILL.md`                                           |
| **New hook**                  | `hook-creator`\*       | `.claude/skills/hook-creator/SKILL.md`                                               |
| **New template**              | `template-creator`\*   | `.claude/skills/template-creator/SKILL.md`                                           |
| **New schema**                | `schema-creator`\*     | `.claude/skills/schema-creator/SKILL.md`                                             |
| **New command**               | `command-creator`\*    | `.claude/skills/command-creator/SKILL.md`                                            |
| **New rule**                  | `rule-creator`\*       | `.claude/skills/rule-creator/SKILL.md`                                               |
| **New tool**                  | `tool-creator`\*       | `.claude/skills/tool-creator/SKILL.md`                                               |
| **After ANY creation**        | `artifact-integrator`  | Post-creation hook → integration-queue.jsonl → artifact-integrator → follow-up tasks |

\*Spawn a general-purpose agent that invokes the skill via `Skill({ skill: "..." })`.

### Critical Rule

**ALWAYS invoke `research-synthesis` BEFORE any other creator skill.**

This ensures:

- Minimum 3 Exa/WebSearch queries executed
- Minimum 3 external sources consulted
- Research report generated + saved
- Design decisions have documented rationale

### Step 0.5: Companion Check

**ALL creator skills now include Step 0.5 (companion check) before creation begins.**

This step uses `companion-check.cjs` library to:

- Load companion matrix from `ecosystem-impact-graph.json`
- Check which companions already exist for this artifact type
- Display must-have / should-have / nice-to-have companion checklist
- Provide awareness of integration requirements BEFORE creation

**Purpose:** Prevent 70% orphan rate by making creators aware of ecosystem dependencies.

**Location:** Between Step 0 (existence check) and Step 1 (research) in all 9 creator skills.

### Invocation Pattern

```javascript
// CORRECT: Research-first pattern
Skill({ skill: 'research-synthesis' });
// ... research completes ...
Skill({ skill: 'skill-creator' });

// WRONG: Direct creator invocation
Skill({ skill: 'skill-creator' }); // Missing research phase
```

### Enforcement

**Hook:** `research-enforcement.cjs` blocks creation without research

**Override:** `RESEARCH_ENFORCEMENT=warn|off` (default: `block`)

### Post-Creation Integration (ADR-100)

**Post-Creation Integration (ADR-100):** All creator skills now trigger automatic integration analysis via the `post-creation-integration.cjs` hook. The `artifact-integrator` skill processes the queue and proposes follow-up tasks for missing catalog entries, agent assignments, and routing updates.

---

## RELATED REFERENCES

- **@EVOLUTION_WORKFLOW.md** - EVOLVE process (E→V→O→L→V→E)
- **@AGENT_ROUTING_TABLE.md** - Agent routing matrix
- **@ENFORCEMENT_HOOKS.md** - research-enforcement.cjs details

---

## BACK TO MAIN

See **CLAUDE.md** Section 3 (subsection) for inline summary.
