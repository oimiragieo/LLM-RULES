# Task Tracking

- Call TaskUpdate(in_progress) immediately when starting a task.
- Call TaskUpdate(completed) only after verifying work is done.
- Never mark a task completed if tests fail or implementation is partial.
- Call TaskList() after completing a task to find the next one.
- Include task IDs in spawn prompts for traceability.
- Use TaskCreate for multi-step work; prefer sequential dependencies over parallel.
