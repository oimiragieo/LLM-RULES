# Lazy Loading with @-References

## Overview

The `@-reference` pattern signals what files to read without pre-loading them into context. This reduces context size and keeps prompts focused.

## Syntax

```
@.claude/references/ui-patterns.md
@.claude/agents/core/planner.md
@.claude/workflows/planning-workflow.md
```

## Usage Rules

1. **Use @-references in workflow definitions** — tell agents what to read, don't pre-load
2. **Use @-references in agent prompts** — reference context files without loading
3. **Use @-references in templates** — indicate what context is needed
4. **Never pre-load** — let the agent read files on demand

## Examples

### In Workflow Files

```markdown
<context>
@.claude/references/ui-patterns.md
@.claude/agents/core/planner.md
@.claude/templates/plan-template.md
</context>
```

### In Agent Definitions

```markdown
<execution_context>
@.claude/references/continuation-format.md
@.claude/workflows/planning-workflow.md
</execution_context>
```

## Benefits

1. **Reduced Context Size** — files not loaded until needed
2. **Better Performance** — less token usage
3. **Clearer Intent** — explicit context needed
4. **Easier Maintenance** — update references without changing code

## Anti-Patterns

### Don't: Pre-load everything

```markdown
<context>
[Entire file content here - 5000 lines]
</context>
```

### Don't: Mix @-references with content

```markdown
<context>
@.claude/references/ui-patterns.md
[Additional content here]
</context>
```

Keep @-references separate from loaded content.

### Don't: Use relative paths without @

```markdown
<context>
.claude/references/ui-patterns.md
</context>
```

Always use `@` prefix to indicate lazy loading.
