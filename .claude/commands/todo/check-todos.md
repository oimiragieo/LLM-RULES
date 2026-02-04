---
name: check-todos
description: List pending todos and select one to work on
argument-hint: [area filter]
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - AskUserQuestion
---

<objective>
List all pending todos, allow selection, load full context for the selected todo, and route to appropriate action.

Enables reviewing captured ideas and deciding what to work on next.
</objective>

<context>
@.claude/state/current-task.json (if exists)
</context>

<process>

<step name="check_exist">
```bash
TODO_COUNT=$(ls .claude/todos/pending/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "Pending todos: $TODO_COUNT"
```

If count is 0:

```
No pending todos.

Todos are captured during work sessions with /add-todo.

───────────────────────────────────────────────────────────────

Would you like to:

1. Continue with current work
2. Add a todo now (/add-todo)
```

Exit.
</step>

<step name="parse_filter">
Check for area filter in arguments:
- `/check-todos` → show all
- `/check-todos api` → filter to area:api only
</step>

<step name="list_todos">
```bash
for file in .claude/todos/pending/*.md; do
  created=$(grep "^created:" "$file" | cut -d' ' -f2)
  title=$(grep "^title:" "$file" | cut -d':' -f2- | xargs)
  area=$(grep "^area:" "$file" | cut -d' ' -f2)
  echo "$created|$title|$area|$file"
done | sort
```

Apply area filter if specified. Display as numbered list:

```
Pending Todos:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago)
3. Refactor database connection pool (database, 5h ago)

───────────────────────────────────────────────────────────────

Reply with a number to view details, or:
- `/check-todos [area]` to filter by area
- `q` to exit
```

Format age as relative time.
</step>

<step name="handle_selection">
Wait for user to reply with a number.

If valid: load selected todo, proceed.
If invalid: "Invalid selection. Reply with a number (1-[N]) or `q` to exit."
</step>

<step name="load_context">
Read the todo file completely. Display:

```
## [title]

**Area:** [area]
**Created:** [date] ([relative time] ago)
**Files:** [list or "None"]

### Problem
[problem section content]

### Solution
[solution section content]
```

If `files` field has entries, read and briefly summarize each.
</step>

<step name="offer_actions">
Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this todo?"
- options:
  - "Work on it now" — move to done, start working
  - "Create a plan" — /write-plan with this scope
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list
</step>

<step name="execute_action">
**Work on it now:**
```bash
mv ".claude/todos/pending/[filename]" ".claude/todos/done/"
```
Update state. Present problem/solution context. Begin work or ask how to proceed.

**Create a plan:**
Display: `/write-plan [description from todo]`
Keep in pending. User runs command in fresh context.

**Brainstorm approach:**
Keep in pending. Start discussion about problem and approaches.

**Put it back:**
Return to list_todos step.
</step>

<step name="update_state">
After any action that changes todo count:
```bash
ls .claude/todos/pending/*.md 2>/dev/null | wc -l
```

Update `.claude/state/current-task.json` if exists.
</step>

</process>

<output>
- Moved todo to `.claude/todos/done/` (if "Work on it now")
- Updated `.claude/state/current-task.json` (if todo count changed)
</output>

<anti_patterns>

- Don't delete todos — move to done/ when work begins
- Don't start work without moving to done/ first
- Don't create plans from this command — route to /write-plan
  </anti_patterns>

<success_criteria>

- [ ] All pending todos listed with title, area, age
- [ ] Area filter applied if specified
- [ ] Selected todo's full context loaded
- [ ] Appropriate actions offered
- [ ] Selected action executed
- [ ] State updated if todo count changed
      </success_criteria>
