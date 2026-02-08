# Creator Skills Table

**Source:** CLAUDE.md Section 3 (subsection)
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Complete mapping of creator skills invoked via `Skill()` tool for creating new artifacts (agents, skills, workflows, hooks, templates, schemas).

---

## CONTENT

### Creator Skills (invoked via `Skill()`, not standalone agents)

| Request Type            | Creator Skill\*        | Skill File                                                                           |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| **Before ANY creation** | `research-synthesis`\* | `.claude/skills/research-synthesis/SKILL.md`                                         |
| **No matching agent**   | `agent-creator`\*      | `.claude/skills/agent-creator/SKILL.md`                                              |
| **New tool/capability** | `skill-creator`\*      | `.claude/skills/skill-creator/SKILL.md`                                              |
| **New workflow**        | `workflow-creator`\*   | `.claude/skills/workflow-creator/SKILL.md`                                           |
| **New hook**            | `hook-creator`\*       | `.claude/skills/hook-creator/SKILL.md`                                               |
| **New template**        | `template-creator`\*   | `.claude/skills/template-creator/SKILL.md`                                           |
| **New schema**          | `schema-creator`\*     | `.claude/skills/schema-creator/SKILL.md`                                             |
| **After ANY creation**  | `artifact-integrator`  | Post-creation hook → integration-queue.jsonl → artifact-integrator → follow-up tasks |

\*Spawn a general-purpose agent that invokes the skill via `Skill({ skill: "..." })`.

### Critical Rule

**ALWAYS invoke `research-synthesis` BEFORE any other creator skill.**

This ensures:

- Minimum 3 Exa/WebSearch queries executed
- Minimum 3 external sources consulted
- Research report generated + saved
- Design decisions have documented rationale

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
