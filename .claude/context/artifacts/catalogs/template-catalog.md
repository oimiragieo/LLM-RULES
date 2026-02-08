<!-- Agent: developer | Task: #68 | Session: 2026-02-07 -->

# Template Catalog

**Last Updated:** 2026-02-07
**Total Active Templates:** 28
**Archived Templates:** 14 (see `_archive/README.md`)

This catalog documents all active templates in the agent-studio framework with their agent/skill assignments and usage contexts.

---

## 1. Spawn Templates (4 active)

### universal-agent-spawn.md

| Field              | Value                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Path**           | `.claude/templates/spawn/universal-agent-spawn.md`                                                                                         |
| **Category**       | Spawn Templates                                                                                                                            |
| **Status**         | active                                                                                                                                     |
| **Used By Agents** | router (primary spawner), developer, qa, planner, architect, code-reviewer, security-architect, technical-writer (all agents as consumers) |
| **Used By Skills** | N/A (consumed by agents, not skills)                                                                                                       |

**Purpose:** Standard agent spawning template for all non-orchestrator agents (developer, qa, planner, etc.) with TaskUpdate warning box and single-purpose task handling.

---

### orchestrator-spawn.md

| Field              | Value                                                                            |
| ------------------ | -------------------------------------------------------------------------------- |
| **Path**           | `.claude/templates/spawn/orchestrator-spawn.md`                                  |
| **Category**       | Spawn Templates                                                                  |
| **Status**         | active                                                                           |
| **Used By Agents** | router (spawner), master-orchestrator, evolution-orchestrator, swarm-coordinator |
| **Used By Skills** | N/A                                                                              |

**Purpose:** Orchestrator-specific spawn template requiring Task tool access and opus model for multi-agent coordination.

---

### subordinate-once.md

| Field              | Value                                         |
| ------------------ | --------------------------------------------- |
| **Path**           | `.claude/templates/spawn/subordinate-once.md` |
| **Category**       | Spawn Templates                               |
| **Status**         | active                                        |
| **Used By Agents** | router (spawner for one-shot tasks)           |
| **Used By Skills** | N/A                                           |

**Purpose:** One-shot subordinate agent template for responding once without delegation capability.

---

### agent-identity-integration.md

| Field              | Value                                                             |
| ------------------ | ----------------------------------------------------------------- |
| **Path**           | `.claude/templates/spawn/agent-identity-integration.md`           |
| **Category**       | Spawn Templates                                                   |
| **Status**         | active                                                            |
| **Used By Agents** | router (spawner for agents with identity/personality frontmatter) |
| **Used By Skills** | N/A                                                               |

**Purpose:** Spawn template for agents with identity fields (personality, tone, specialized behavior).

---

## 2. Creator Templates (4 active)

### agent-template.md

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Path**           | `.claude/templates/agents/agent-template.md` |
| **Category**       | Creator Templates                            |
| **Status**         | active                                       |
| **Used By Agents** | N/A (consumed by skill)                      |
| **Used By Skills** | agent-creator                                |

**Purpose:** Boilerplate template for creating new agent definition files with frontmatter schema and structure.

---

### agent-context-template.md

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Path**           | `.claude/templates/agents/agent-context-template.md` |
| **Category**       | Creator Templates                                    |
| **Status**         | active                                               |
| **Used By Agents** | N/A (consumed by skill)                              |
| **Used By Skills** | agent-creator                                        |

**Purpose:** Context section template for agent files with memory protocol, related workflows, and integration points.

---

### skill-template.md

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Path**           | `.claude/templates/skills/skill-template.md` |
| **Category**       | Creator Templates                            |
| **Status**         | active                                       |
| **Used By Agents** | N/A (consumed by skill)                      |
| **Used By Skills** | skill-creator                                |

**Purpose:** Boilerplate template for creating new skill files with frontmatter, post-creation checklist, and agent assignment requirements.

---

### workflow-template.md

| Field              | Value                                              |
| ------------------ | -------------------------------------------------- |
| **Path**           | `.claude/templates/workflows/workflow-template.md` |
| **Category**       | Creator Templates                                  |
| **Status**         | active                                             |
| **Used By Agents** | N/A (consumed by skill)                            |
| **Used By Skills** | workflow-creator                                   |

**Purpose:** Boilerplate template for creating new workflow definition files with phase structure and orchestration patterns.

---

## 3. Document Templates (9 active)

### adr-template.md

| Field              | Value                               |
| ------------------ | ----------------------------------- |
| **Path**           | `.claude/templates/adr-template.md` |
| **Category**       | Document Templates                  |
| **Status**         | active                              |
| **Used By Agents** | architect, planner                  |
| **Used By Skills** | architecture-decision-record        |

**Purpose:** Architecture Decision Record (ADR) template following ADR-000 format with context, decision, consequences, and status tracking.

---

### plan-template.md

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **Path**           | `.claude/templates/plan-template.md` |
| **Category**       | Document Templates                   |
| **Status**         | active                               |
| **Used By Agents** | planner                              |
| **Used By Skills** | task-breakdown                       |

**Purpose:** Implementation plan template with task breakdown, dependencies, and acceptance criteria.

---

### specification-template.md

| Field              | Value                                         |
| ------------------ | --------------------------------------------- |
| **Path**           | `.claude/templates/specification-template.md` |
| **Category**       | Document Templates                            |
| **Status**         | active                                        |
| **Used By Agents** | planner, architect                            |
| **Used By Skills** | spec-gathering                                |

**Purpose:** Feature/system specification template with requirements, user stories, technical design, and success criteria.

---

### spec-template.md

| Field              | Value                                |
| ------------------ | ------------------------------------ |
| **Path**           | `.claude/templates/spec-template.md` |
| **Category**       | Document Templates                   |
| **Status**         | active                               |
| **Used By Agents** | planner                              |
| **Used By Skills** | spec-gathering                       |

**Purpose:** Lightweight specification template (alternative to specification-template.md) for rapid spec drafting.

---

### tasks-template.md

| Field              | Value                                 |
| ------------------ | ------------------------------------- |
| **Path**           | `.claude/templates/tasks-template.md` |
| **Category**       | Document Templates                    |
| **Status**         | active                                |
| **Used By Agents** | planner, developer                    |
| **Used By Skills** | task-breakdown                        |

**Purpose:** Task list template with status tracking, blockers, and completion criteria.

---

### architecture.md

| Field              | Value                               |
| ------------------ | ----------------------------------- |
| **Path**           | `.claude/templates/architecture.md` |
| **Category**       | Document Templates                  |
| **Status**         | active                              |
| **Used By Agents** | architect, planner                  |
| **Used By Skills** | c4-model, system-design             |

**Purpose:** System architecture documentation template with C4 diagrams, component descriptions, and integration points.

---

### security-design-checklist.md

| Field              | Value                                            |
| ------------------ | ------------------------------------------------ |
| **Path**           | `.claude/templates/security-design-checklist.md` |
| **Category**       | Document Templates                               |
| **Status**         | active                                           |
| **Used By Agents** | security-architect                               |
| **Used By Skills** | security-architect                               |

**Purpose:** STRIDE threat model checklist for security design validation (SEC-TMPL-006 mandated retention at root level).

---

### test-plan.md

| Field              | Value                            |
| ------------------ | -------------------------------- |
| **Path**           | `.claude/templates/test-plan.md` |
| **Category**       | Document Templates               |
| **Status**         | active                           |
| **Used By Agents** | qa, developer                    |
| **Used By Skills** | tdd, qa-workflow                 |

**Purpose:** Test plan template with test cases, coverage targets, and verification strategies.

---

### error-recovery-template.md

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| **Path**           | `.claude/templates/error-recovery-template.md` |
| **Category**       | Document Templates                             |
| **Status**         | active                                         |
| **Used By Agents** | developer, hook-creator                        |
| **Used By Skills** | debugging, hook-creator                        |

**Purpose:** Error recovery pattern template for hook implementations and graceful failure handling (SEC-TMPL-006 mandated retention).

---

## 4. Report Templates (5 active)

### audit-report-template.md

| Field              | Value                                                |
| ------------------ | ---------------------------------------------------- |
| **Path**           | `.claude/templates/reports/audit-report-template.md` |
| **Category**       | Report Templates                                     |
| **Status**         | active                                               |
| **Used By Agents** | qa, security-architect                               |
| **Used By Skills** | qa-workflow, security-architect                      |

**Purpose:** Audit report template for security/quality audits with findings classification and remediation tracking.

---

### implementation-report-template.md

| Field              | Value                                                         |
| ------------------ | ------------------------------------------------------------- |
| **Path**           | `.claude/templates/reports/implementation-report-template.md` |
| **Category**       | Report Templates                                              |
| **Status**         | active                                                        |
| **Used By Agents** | developer                                                     |
| **Used By Skills** | tdd, task-management-protocol                                 |

**Purpose:** Implementation report template documenting completed work, files changed, tests added, and next steps.

---

### plan-template.md (reports)

| Field              | Value                                        |
| ------------------ | -------------------------------------------- |
| **Path**           | `.claude/templates/reports/plan-template.md` |
| **Category**       | Report Templates                             |
| **Status**         | active                                       |
| **Used By Agents** | planner                                      |
| **Used By Skills** | task-breakdown                               |

**Purpose:** Planning phase report template with task breakdown, estimates, dependencies, and risk assessment.

---

### reflection-report-template.md

| Field              | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| **Path**           | `.claude/templates/reports/reflection-report-template.md` |
| **Category**       | Report Templates                                          |
| **Status**         | active                                                    |
| **Used By Agents** | reflection-agent                                          |
| **Used By Skills** | reflection                                                |

**Purpose:** Reflection report template for analyzing work quality, process adherence, and improvement opportunities.

---

### research-report-template.md

| Field              | Value                                                   |
| ------------------ | ------------------------------------------------------- |
| **Path**           | `.claude/templates/reports/research-report-template.md` |
| **Category**       | Report Templates                                        |
| **Status**         | active                                                  |
| **Used By Agents** | researcher, evolution-orchestrator                      |
| **Used By Skills** | research-synthesis                                      |

**Purpose:** Research report template with sources, findings, recommendations, and confidence levels (required minimum 3 sources per EVOLVE workflow).

---

## 5. Code Style Templates (3 active)

### typescript.md

| Field              | Value                                         |
| ------------------ | --------------------------------------------- |
| **Path**           | `.claude/templates/code-styles/typescript.md` |
| **Category**       | Code Style Templates                          |
| **Status**         | active                                        |
| **Used By Agents** | developer, code-reviewer                      |
| **Used By Skills** | tdd, code-quality-expert                      |

**Purpose:** TypeScript coding style guide with ESLint rules, naming conventions, and best practices.

---

### javascript.md

| Field              | Value                                         |
| ------------------ | --------------------------------------------- |
| **Path**           | `.claude/templates/code-styles/javascript.md` |
| **Category**       | Code Style Templates                          |
| **Status**         | active                                        |
| **Used By Agents** | developer, code-reviewer                      |
| **Used By Skills** | tdd, code-quality-expert                      |

**Purpose:** JavaScript (ES6+) coding style guide with ESLint rules, module patterns, and async best practices.

---

### python.md

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Path**           | `.claude/templates/code-styles/python.md`       |
| **Category**       | Code Style Templates                            |
| **Status**         | active                                          |
| **Used By Agents** | developer, code-reviewer                        |
| **Used By Skills** | tdd, code-quality-expert, python-backend-expert |

**Purpose:** Python coding style guide following PEP 8, type hints, and pytest conventions.

---

## 6. Utility Templates (3 active)

### continuation.md

| Field              | Value                               |
| ------------------ | ----------------------------------- |
| **Path**           | `.claude/templates/continuation.md` |
| **Category**       | Utility Templates                   |
| **Status**         | active                              |
| **Used By Agents** | All agents                          |
| **Used By Skills** | session-handoff, context-compressor |

**Purpose:** Session continuation template for resuming work after context limits or interruptions with state preservation.

---

### agent-skill-invocation-section.md

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| **Path**           | `.claude/templates/agent-skill-invocation-section.md` |
| **Category**       | Utility Templates                                     |
| **Status**         | active                                                |
| **Used By Agents** | router (used by spawn-prompt-assembler)               |
| **Used By Skills** | N/A                                                   |

**Purpose:** Reusable skill invocation instructions section for agent spawn prompts ensuring Skill() tool usage protocol.

---

### README.md

| Field              | Value                         |
| ------------------ | ----------------------------- |
| **Path**           | `.claude/templates/README.md` |
| **Category**       | Utility Templates             |
| **Status**         | active                        |
| **Used By Agents** | N/A (documentation)           |
| **Used By Skills** | N/A                           |

**Purpose:** Template system documentation and usage guide for template consumers and creators.

---

## Archived Templates

**Total Archived:** 14 templates
**Archival Date:** 2026-02-07
**Reason:** Template system consolidation (Task #66) - removing dead/unused templates per architecture audit

**Location:** `.claude/templates/_archive/`

**Categories:**

- Spawn templates (2): bash-safe-background.md, router-task-template.md
- Planning templates (3): findings.md, progress.md, task_plan.md
- Example templates (2): example-adr-050.md, example-specification.md
- Code style templates (3): dart.md, csharp.md, go.md
- Root-level templates (4): claude-md-template.md, project-brief.md, prd.md, ui-spec.md

**Restoration:** See `.claude/templates/_archive/README.md` for restoration instructions (uses `git mv` to preserve history).

---

## Template Creation

**To create new templates:**

1. Invoke the `template-creator` skill via:

   ```
   Skill({ skill: "template-creator" })
   ```

2. The skill will:
   - Research template requirements
   - Generate template file with frontmatter
   - Update this catalog
   - Register template with relevant agents
   - Record creation in memory (learnings.md)

**Manual Creation (NOT RECOMMENDED):**

Direct writes to `.claude/templates/` bypass creator workflow and create "invisible templates" (no catalog entry, no agent assignment, no CLAUDE.md reference). Always use `template-creator` skill.

---

## Template Security Compliance (SEC-TMPL-006)

**Critical Security Requirements:**

1. **Path Safety:** All template references MUST use relative paths (`.claude/templates/...`) - never absolute paths
2. **No Secrets:** Templates MUST NOT include secrets, credentials, tokens, or API keys
3. **No Sensitive Metadata:** Templates MUST NOT expose internal system paths, user directories, or environment-specific data
4. **Retention Mandates:** Templates flagged by SEC-TMPL-006 MUST remain at designated locations (security-design-checklist.md, error-recovery-template.md)

**Enforcement:** `unified-creator-guard.cjs` hook blocks direct template writes (default: block mode, override: `CREATOR_GUARD=warn|off`).

---

## Template Categories Summary

| Category       | Count  | Primary Agents            | Primary Skills                                               |
| -------------- | ------ | ------------------------- | ------------------------------------------------------------ |
| **Spawn**      | 4      | router                    | N/A                                                          |
| **Creator**    | 4      | N/A                       | agent-creator, skill-creator, workflow-creator               |
| **Document**   | 9      | planner, architect, qa    | task-breakdown, spec-gathering, architecture-decision-record |
| **Report**     | 5      | developer, qa, researcher | tdd, qa-workflow, research-synthesis                         |
| **Code Style** | 3      | developer, code-reviewer  | tdd, code-quality-expert                                     |
| **Utility**    | 3      | All agents                | session-handoff, context-compressor                          |
| **TOTAL**      | **28** | —                         | —                                                            |

---

## Related Documentation

- **Template Creation:** `.claude/skills/template-creator/SKILL.md`
- **Spawn Protocol:** `.claude/docs/@TOOL_REFERENCE.md` (Task tool signature)
- **Agent Creation:** `.claude/skills/agent-creator/SKILL.md`
- **Skill Creation:** `.claude/skills/skill-creator/SKILL.md`
- **Workflow Creation:** `.claude/skills/workflow-creator/SKILL.md`
- **Archive Manifest:** `.claude/templates/_archive/README.md`
- **Security Policy:** `.claude/docs/SECURITY.md` (SEC-TMPL-006)

---

**End of Catalog**
