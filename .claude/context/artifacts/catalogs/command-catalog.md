<!-- Agent: developer | Task: #85 | Session: 2026-02-07 -->

# Command Catalog

**Last Updated:** 2026-02-09
**Total Commands:** 12
**Pattern:** Thin delegators to skills (10 delegators, 1 enriched, 1 standalone)

This catalog documents all slash commands in the agent-studio framework with their skill delegations and usage contexts.

---

## Quick Reference

| Command            | Description                                  | Delegates To                     | Category    |
| ------------------ | -------------------------------------------- | -------------------------------- | ----------- |
| `/write-plan`      | Create implementation plan with tasks        | `plan-generator`                 | Planning    |
| `/tdd`             | Test-driven development with Iron Laws       | `tdd`                            | Development |
| `/debug`           | Systematic debugging with root cause         | `debugging`                      | Development |
| `/build-fix`       | Diagnose and fix build failures              | `debugging`                      | Development |
| `/verify`          | Comprehensive verification before completion | `verification-before-completion` | Quality     |
| `/test-coverage`   | Analyze coverage and identify gaps           | `tdd`                            | Quality     |
| `/refactor-clean`  | Safe refactoring and cleanup                 | `code-quality-expert`            | Quality     |
| `/security-review` | OWASP/STRIDE security analysis               | `security-architect`             | Security    |
| `/compress`        | Compress context to reduce tokens            | `context-compressor`             | Context     |
| `/learn`           | Extract session patterns to memory           | `context-compressor` + memory    | Context     |
| `/analyze`         | Project structure and health analysis        | `code-analyzer`                  | Analysis    |
| `/setup-pm`        | Configure package manager                    | standalone script                | Setup       |

---

## Categories

### Planning (1 command)

Commands for planning and task breakdown.

#### `/write-plan`

**Pattern:** Delegator
**Delegates To:** `plan-generator` skill
**Usage:** Create implementation plans with task breakdown, dependencies, and acceptance criteria.

```bash
# Example
/write-plan
```

Invokes the `plan-generator` skill to generate structured implementation plans following the task breakdown methodology.

---

### Development (3 commands)

Commands for core development workflows: TDD, debugging, and build fixing.

#### `/tdd`

**Pattern:** Delegator
**Delegates To:** `tdd` skill
**Usage:** Test-driven development with the Red-Green-Refactor cycle.

```bash
# Example
/tdd
```

Invokes the `tdd` skill with Iron Laws: write failing test first, watch it fail, write minimal code to pass, refactor while green.

#### `/debug`

**Pattern:** Delegator
**Delegates To:** `debugging` skill
**Usage:** Systematic 4-phase debugging with root cause investigation.

```bash
# Example
/debug
```

Invokes the `debugging` skill with the mandatory process: root cause investigation → pattern analysis → hypothesis testing → implementation.

#### `/build-fix`

**Pattern:** Delegator
**Delegates To:** `debugging` skill (with build context)
**Usage:** Diagnose and fix build failures using systematic debugging.

```bash
# Example
/build-fix
```

Invokes the `debugging` skill with specific focus on build failures. Start by running the build command to reproduce the error, then follow the 4-phase debugging process.

---

### Quality (3 commands)

Commands for quality assurance, testing, refactoring, and verification.

#### `/verify`

**Pattern:** Delegator
**Delegates To:** `verification-before-completion` skill
**Usage:** Run comprehensive verification before claiming completion.

```bash
# Example
/verify
```

Invokes the `verification-before-completion` skill with the Iron Law: NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE. Requires running verification commands and reading output.

#### `/test-coverage`

**Pattern:** Delegator
**Delegates To:** `tdd` skill (with coverage focus)
**Usage:** Analyze test coverage and identify gaps.

```bash
# Example
/test-coverage
```

Invokes the `tdd` skill with specific focus on analyzing test coverage, identifying low-coverage areas, and suggesting tests to add.

#### `/refactor-clean`

**Pattern:** Delegator
**Delegates To:** `code-quality-expert` skill
**Usage:** Safe refactoring and dead code cleanup.

```bash
# Example
/refactor-clean
```

Invokes the `code-quality-expert` skill for safe refactoring, removing dead code, and cleaning up unused imports while keeping tests green.

---

### Security (1 command)

Commands for security analysis and threat modeling.

#### `/security-review`

**Pattern:** Delegator
**Delegates To:** `security-architect` skill
**Usage:** Security review with OWASP Top 10 and STRIDE analysis.

```bash
# Example
/security-review
```

Invokes the `security-architect` skill for comprehensive security reviews including STRIDE threat modeling and OWASP Top 10 vulnerability analysis.

---

### Context (2 commands)

Commands for context management and session pattern extraction.

#### `/compress`

**Pattern:** Delegator
**Delegates To:** `context-compressor` skill
**Usage:** Compress context to reduce token usage.

```bash
# Example
/compress
```

Invokes the `context-compressor` skill for reducing token usage while preserving decision-critical information. Useful when approaching context limits.

#### `/learn`

**Pattern:** Enriched (integrates multiple concerns)
**Delegates To:** `context-compressor` skill + memory protocol
**Usage:** Extract reusable patterns from current session into memory.

```bash
# Example
/learn
```

Invokes the `context-compressor` skill to extract patterns from the current session, then records findings to memory files (`.claude/context/memory/learnings.md`, `decisions.md`, `issues.md`).

**Note:** This command departs from the pure delegator pattern because it integrates two concerns (extraction + memory recording) that no single skill covers.

---

### Analysis (1 command)

Commands for project analysis and health checks.

#### `/analyze`

**Pattern:** Delegator
**Delegates To:** `code-analyzer` skill
**Usage:** Analyze project structure, tech stack, and health.

```bash
# Example
/analyze
```

Invokes the `code-analyzer` skill for project-wide analysis including structure discovery, dependency health, and technical debt assessment.

---

### Setup (1 command)

Commands for project setup and configuration.

#### `/setup-pm`

**Pattern:** Standalone (references script)
**Delegates To:** `.claude/scripts/setup-package-manager.cjs`
**Usage:** Configure package manager detection and setup.

```bash
# Example
/setup-pm
```

Standalone utility that references the existing setup script. No skill delegation - directly executes the script for package manager configuration.

---

## Design Principles

These principles govern command creation and maintenance (from architecture Section 10):

1. **Commands are shims, not implementations.** The skill is the source of truth. The command is a 3-line delegator.

2. **One command, one skill.** Each command delegates to exactly one skill (with optional context hint). No multi-skill orchestration in commands.

3. **`disable-model-invocation: true` is mandatory** for all delegator commands. This prevents Claude from treating the command as a conversation prompt.

4. **Standalone commands are exceptions.** Only for utility scripts (like `/setup-pm`) that have no corresponding skill. These should be rare.

5. **Enriched commands are rare exceptions.** Only when no single skill covers the workflow (like `/learn` which combines extraction + memory recording). These should integrate existing skills, not implement new behavior.

6. **Commands must have a corresponding catalog entry.** Creating a command without updating `command-catalog.md` creates an invisible command.

7. **Commands are NOT creator-guarded.** They are passive markdown with the same trust level as user input. This is by design (confirmed in security review 2026-02-07).

---

## Deleted Commands

The following commands were removed during framework evolution:

### 2026-02-07 Overhaul (ADR-087)

#### `/checkpoint` (DELETED)

**Reason:** References `.claude/checkpoints.log` which does not exist. No backing infrastructure.

**Future consideration:** If checkpoint functionality is needed, create a `checkpoint` skill first, then a `/checkpoint` command that delegates to it.

#### `/orchestrate` (DELETED)

**Reason:** Duplicates Router enterprise orchestration. The Router already implements:

- Feature workflow: `planner -> developer -> code-reviewer -> security-architect`
- Bugfix workflow: via enterprise orchestration phases
- Refactor workflow: `architect -> developer -> code-reviewer`
- Security workflow: via security-architect agent
- Custom workflows: via master-orchestrator agent

Users should describe their task to the Router, which handles orchestration automatically. A `/orchestrate` command that bypasses the Router creates conflicting behavior.

#### `/add-todo` (DELETED)

**Reason:** References `.claude/todos/pending/`, `.claude/todos/done/`, and `.claude/state/current-task.json` -- none of which exist. The framework uses `TaskCreate()` / `TaskList()` / `TaskUpdate()` for task management, which is a fundamentally different mechanism.

**Future consideration:** If a user-facing todo system is desired, it should integrate with the existing `Task*` tools rather than creating a parallel filesystem-based system.

#### `/check-todos` (DELETED)

**Reason:** Same dead infrastructure references as `/add-todo`. Uses non-existent directories and files.

### 2026-02-09 Cleanup (Task #13)

#### `/brainstorm` (DELETED)

**Reason:** Delegates to `brainstorming` skill which doesn't exist. No backing skill implementation.

**Future consideration:** If brainstorming functionality is needed, create the skill first via `research-synthesis` → `skill-creator`, then add the command.

#### `/execute-plan` (DELETED)

**Reason:** Delegates to `executing-plans` skill which doesn't exist. No backing skill implementation.

**Future consideration:** Plan execution is handled by the Router's enterprise orchestration workflow. If a dedicated execution skill is needed, create it first.

#### `/code-review` (DELETED)

**Reason:** Delegates to `requesting-code-review` skill which doesn't exist. No backing skill implementation.

**Future consideration:** Code review is handled by spawning the `code-reviewer` agent via the Router. If a skill wrapper is desired, create it first.

#### `/e2e` (DELETED)

**Reason:** Delegates to `qa-workflow` skill which doesn't exist. No backing skill implementation.

**Future consideration:** E2E testing should be handled by the `qa` agent. If a dedicated skill is needed, create it first.

#### `/eval` (DELETED)

**Reason:** Delegates to `qa-workflow` skill which doesn't exist (same as `/e2e`). No backing skill implementation.

**Future consideration:** Eval/regression testing should be handled by the `qa` agent. If a dedicated skill is needed, create it first.

---

## Relationship to Skills and Agents

Commands are the **user-facing entry point** into the skill/agent ecosystem:

```
User types /commandname
    ↓
Claude Code injects command file as user message
    ↓
Command invokes Skill({ skill: "name" })
    ↓
Skill provides structured instructions to Agent
    ↓
Agent (spawned by Router) executes the work
```

**Commands vs Skills vs Agents:**

| Layer        | Purpose             | Invocation                                      |
| ------------ | ------------------- | ----------------------------------------------- |
| **Commands** | User entry point    | User types `/name`                              |
| **Skills**   | Structured behavior | Agent invokes `Skill({ skill: "name" })`        |
| **Agents**   | Execution context   | Router spawns `Task({ subagent_type: "type" })` |

Commands are thin shims that delegate to skills. Skills are the source of truth for behavior. Agents are the execution context that invokes skills.

---

## Command Creation

**To create new commands:**

Commands are NOT creator-guarded (by design). However, follow these guidelines:

1. **Identify the target skill.** Every command should delegate to an existing skill. If no skill exists, create the skill first.

2. **Use the canonical pattern:**

   ```yaml
   ---
   description: One-line description
   disable-model-invocation: true
   ---
   Invoke the {skill-name} skill and follow it exactly as presented to you
   ```

3. **Add context hints for focused delegation.** If the command should focus on a specific aspect of a skill, add a context hint:

   ```yaml
   Invoke the {skill-name} skill and follow it exactly as presented to you. Focus specifically on {aspect}.
   ```

4. **Update this catalog.** Add the new command to the quick reference table and the appropriate category section.

5. **Verify the skill exists.** Check `.claude/skills/{skill-name}/SKILL.md` exists before creating the command.

**Manual Creation (NOT RECOMMENDED for skills/agents/workflows, but ALLOWED for commands):**

Direct writes to `.claude/commands/` are allowed (commands are NOT creator-guarded). However, always update this catalog when adding a command.

---

## Related Documentation

- **Command Architecture:** `.claude/context/plans/commands-overhaul-architecture-2026-02-07.md`
- **Skill Catalog:** `.claude/context/artifacts/catalogs/skill-catalog.md`
- **Agent Routing:** `.claude/docs/@AGENT_ROUTING_TABLE.md`
- **Router Decision:** `.claude/workflows/core/router-decision.md`
- **CLAUDE.md Section 7.1:** Commands (Slash Commands)

---

**End of Catalog**
