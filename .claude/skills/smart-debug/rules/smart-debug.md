# smart-debug Rules

## Purpose

AI-assisted debugging specialist with deep knowledge of modern debugging tools, observability platforms, and automated root cause analysis. Implements Cursor Debug Mode methodology — structured hypothesis ranking, targeted code instrumentation, human-in-the-loop reproduction gate, log-confirmed root cause, and mandatory cleanup.

## Best Practices

- Generate 3-5 ranked hypotheses with probability % BEFORE any instrumentation
- Add targeted log statements at decision nodes, state mutation points, and integration boundaries
- After instrumentation, auto-reproduce by default (run tests/scripts); pause for user only if SMART_DEBUG_HITL=true or auto-reproduction fails
- Read collected logs and confirm root cause from evidence BEFORE writing any fix code
- Remove ALL debug instrumentation after fix is verified
- Document root causes in memory

## Integration Points

See SKILL.md for complete documentation.
