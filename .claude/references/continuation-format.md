# Continuation Format

Standard format for presenting next steps after completing a command or workflow.

## Core Structure

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**{identifier}: {name}** — {one-line description}

`{command to copy-paste}`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `{alternative option 1}` — description
- `{alternative option 2}` — description

───────────────────────────────────────────────────────────────
```

## Format Rules

1. **Always show what it is** — name + description, never just a command path
2. **Pull context from source** — PLAN.md `<objective>` for plans, workflow state for workflows
3. **Command in inline code** — backticks, easy to copy-paste, renders as clickable link
4. **`/clear` explanation** — always include, keeps it concise but explains why
5. **"Also available" not "Other options"** — sounds more app-like
6. **Visual separators** — `───────────────────────────────────────────────────────────────` above and below to make it stand out

## Variants

### Execute Next Plan

```
───────────────────────────────────────────────────────────────

## ▶ Next Up

**Task 2.3: Implement Statusline Hook** — Create hook for real-time status display

`/execute-plan`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- Review plan before executing
- `/write-plan` — create new plan

───────────────────────────────────────────────────────────────
```

### Plan Complete

```
───────────────────────────────────────────────────────────────

## ✓ Plan Complete

3/3 tasks executed

## ▶ Next Up

**Phase 2: Core Features** — User dashboard, settings, and data export

`/write-plan`

<sub>`/clear` first → fresh context window</sub>

───────────────────────────────────────────────────────────────

**Also available:**
- `/verify` — verify implementation
- Review completed work

───────────────────────────────────────────────────────────────
```

## Pulling Context

### For plans (from PLAN.md):

```markdown
## Task 2.3: Implement Statusline Hook

**Objective**: Create hook for real-time status display
```

Extract: `**Task 2.3: Implement Statusline Hook** — Create hook for real-time status display`

## Anti-Patterns

### Don't: Command-only (no context)

```
## To Continue

Run `/clear`, then paste:
/execute-plan
```

User has no idea what they're executing.

### Don't: Missing /clear explanation

```
`/execute-plan`

Run /clear first.
```

Doesn't explain why. User might skip it.

### Don't: "Other options" language

```
Other options:
- Review plan
```

Sounds like an afterthought. Use "Also available:" instead.
