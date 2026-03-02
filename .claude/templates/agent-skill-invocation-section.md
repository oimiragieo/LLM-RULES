# Agent Skill Invocation Section Template

> **Purpose**: Standardized skill invocation guidance for agent definitions.
> **Usage**: Copy the relevant sections below into your agent markdown file.

---

## Skill Invocation Protocol (MANDATORY)

**Use the Skill tool to invoke skills, not just read them:**

```javascript
// Invoke skills to apply their workflows
Skill({ skill: '{{PRIMARY_SKILL_1}}' }); // {{DESCRIPTION_1}}
Skill({ skill: '{{PRIMARY_SKILL_2}}' }); // {{DESCRIPTION_2}}
```

The Skill tool loads the skill instructions into your context and applies them to your current task.

### Automatic Skills (Always Invoke)

Before starting any task, invoke these skills:

| Skill                 | Purpose           | When                 |
| --------------------- | ----------------- | -------------------- |
| `{{PRIMARY_SKILL_1}}` | {{DESCRIPTION_1}} | Always at task start |
| `{{PRIMARY_SKILL_2}}` | {{DESCRIPTION_2}} | Always at task start |

### Contextual Skills (When Applicable)

Invoke based on task context:

| Condition       | Skill                    | Purpose       |
| --------------- | ------------------------ | ------------- |
| {{CONDITION_1}} | `{{CONTEXTUAL_SKILL_1}}` | {{PURPOSE_1}} |
| {{CONDITION_2}} | `{{CONTEXTUAL_SKILL_2}}` | {{PURPOSE_2}} |
| {{CONDITION_3}} | `{{CONTEXTUAL_SKILL_3}}` | {{PURPOSE_3}} |

### Skill Discovery

1. Consult skill catalog: `.claude/docs/skill-catalog.md`
2. Search by category or keyword
3. Invoke with: `Skill({ skill: "<skill-name>" })`

### Usage Examples

```javascript
// At task start - always invoke primary skills
Skill({ skill: '{{PRIMARY_SKILL_1}}' });
Skill({ skill: '{{PRIMARY_SKILL_2}}' });

// When {{CONDITION_1}}
Skill({ skill: '{{CONTEXTUAL_SKILL_1}}' });

// When {{CONDITION_2}}
Skill({ skill: '{{CONTEXTUAL_SKILL_2}}' });
```

**Important**: Always use `Skill()` tool - reading skill files alone does NOT apply them.

---

## Placeholder Reference

Replace these placeholders when using this template:

### Primary Skills (Always Invoked)

| Placeholder           | Description             | Example                               |
| --------------------- | ----------------------- | ------------------------------------- |
| `{{PRIMARY_SKILL_1}}` | Agent's primary skill   | `tdd`                                 |
| `{{DESCRIPTION_1}}`   | Brief skill purpose     | `Test-Driven Development methodology` |
| `{{PRIMARY_SKILL_2}}` | Agent's secondary skill | `debugging`                           |
| `{{DESCRIPTION_2}}`   | Brief skill purpose     | `Systematic debugging process`        |

### Contextual Skills (Condition-Based)

| Placeholder              | Description    | Example                              |
| ------------------------ | -------------- | ------------------------------------ |
| `{{CONDITION_1}}`        | When to invoke | `Debugging issues`                   |
| `{{CONTEXTUAL_SKILL_1}}` | Skill name     | `debugging`                          |
| `{{PURPOSE_1}}`          | Why to invoke  | `Systematic 4-phase debugging`       |
| `{{CONDITION_2}}`        | When to invoke | `Security-sensitive code`            |
| `{{CONTEXTUAL_SKILL_2}}` | Skill name     | `security-architect`                 |
| `{{PURPOSE_2}}`          | Why to invoke  | `Threat modeling and OWASP analysis` |
| `{{CONDITION_3}}`        | When to invoke | `Before claiming completion`         |
| `{{CONTEXTUAL_SKILL_3}}` | Skill name     | `verification-before-completion`     |
| `{{PURPOSE_3}}`          | Why to invoke  | `Evidence-based completion gates`    |

---

## Example: Developer Agent

```markdown
## Skill Invocation Protocol (MANDATORY)

**Use the Skill tool to invoke skills, not just read them:**

\`\`\`javascript
// Invoke skills to apply their workflows
Skill({ skill: 'tdd' }); // Test-Driven Development methodology
Skill({ skill: 'debugging' }); // Systematic debugging process
\`\`\`

The Skill tool loads the skill instructions into your context and applies them to your current task.

### Automatic Skills (Always Invoke)

Before starting any task, invoke these skills:

| Skill        | Purpose                       | When                 |
| ------------ | ----------------------------- | -------------------- |
| `tdd`        | Red-Green-Refactor cycle      | Always at task start |
| `git-expert` | Git operations best practices | Always at task start |

### Contextual Skills (When Applicable)

Invoke based on task context:

| Condition                  | Skill                            | Purpose                            |
| -------------------------- | -------------------------------- | ---------------------------------- |
| Debugging issues           | `debugging`                      | Systematic 4-phase debugging       |
| Security-sensitive code    | `security-architect`             | Threat modeling and OWASP analysis |
| Before claiming completion | `verification-before-completion` | Evidence-based completion gates    |
| GitHub operations          | `github-mcp`                     | GitHub API operations              |
| Code quality review        | `code-analyzer`                  | Static analysis and metrics        |

### Skill Discovery

1. Consult skill catalog: `.claude/docs/skill-catalog.md`
2. Search by category or keyword
3. Invoke with: `Skill({ skill: "<skill-name>" })`

### Usage Examples

\`\`\`javascript
// At task start - always invoke primary skills
Skill({ skill: 'tdd' });
Skill({ skill: 'git-expert' });

// When debugging issues
Skill({ skill: 'debugging' });

// When working with security-sensitive code
Skill({ skill: 'security-architect' });

// Before claiming task complete
Skill({ skill: 'verification-before-completion' });
\`\`\`

**Important**: Always use `Skill()` tool - reading skill files alone does NOT apply them.
```

---

## Example: Domain Agent (Python Pro)

```markdown
## Skill Invocation Protocol (MANDATORY)

**Use the Skill tool to invoke skills, not just read them:**

\`\`\`javascript
// Invoke skills to apply their workflows
Skill({ skill: 'python-backend-expert' }); // Python best practices
Skill({ skill: 'tdd' }); // Test-Driven Development
\`\`\`

The Skill tool loads the skill instructions into your context and applies them to your current task.

### Automatic Skills (Always Invoke)

Before starting any task, invoke these skills:

| Skill                   | Purpose                    | When                 |
| ----------------------- | -------------------------- | -------------------- |
| `python-backend-expert` | Python patterns and idioms | Always at task start |
| `tdd`                   | Test-Driven Development    | Always at task start |

### Contextual Skills (When Applicable)

Invoke based on task context:

| Condition        | Skill                    | Purpose                        |
| ---------------- | ------------------------ | ------------------------------ |
| Debugging issues | `debugging`              | Systematic debugging process   |
| API development  | `api-development-expert` | API design patterns            |
| Testing strategy | `testing-expert`         | Comprehensive testing patterns |
| Git operations   | `git-expert`             | Git best practices             |

### Skill Discovery

1. Consult skill catalog: `.claude/docs/skill-catalog.md`
2. Search by category or keyword
3. Invoke with: `Skill({ skill: "<skill-name>" })`

**Important**: Always use `Skill()` tool - reading skill files alone does NOT apply them.
```

---

## Integration Notes

### Where to Place in Agent Definition

Add this section after the "Workflow" section and before the "Memory Protocol" section:

```markdown
## Workflow

[Agent workflow steps]

## Skill Invocation Protocol (MANDATORY)

[This template content]

## Memory Protocol (MANDATORY)

[Memory protocol content]
```

### YAML Frontmatter Skills

The `skills:` field in YAML frontmatter lists skills the agent is expected to use:

```yaml
---
name: agent-name
skills:
  - tdd
  - debugging
  - git-expert
  - verification-before-completion
  # Add agent-specific skills
---
```

**Note**: Listing skills in frontmatter documents intent but does NOT automatically invoke them. Agents must explicitly use `Skill({ skill: "..." })` to apply skill workflows.

### Skill Categories Quick Reference

| Category             | Common Skills                                                      |
| -------------------- | ------------------------------------------------------------------ |
| **Core Development** | `tdd`, `debugging`, `git-expert`, `verification-before-completion` |
| **Code Quality**     | `code-analyzer`, `code-quality-expert`, `code-style-validator`     |
| **Security**         | `security-architect`                                               |
| **Documentation**    | `doc-generator`, `diagram-generator`                               |
| **Planning**         | `plan-generator`, `complexity-assessment`                          |
| **Languages**        | `python-backend-expert`, `typescript-expert`, `golang-pro`         |
| **Frameworks**       | `react-expert`, `nextjs-expert`, `fastapi`                         |
| **Creator Tools**    | `agent-creator`, `skill-creator`, `workflow-creator`               |

See `.claude/docs/skill-catalog.md` for the complete list.
