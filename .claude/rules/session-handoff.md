# Session Handoff Rules

## Core Principles

- Sessions end without warning - always prepare for handoff
- Handoff documents must be self-contained (no external dependencies)
- Include enough context to resume work immediately
- Use structured metadata for machine-readable state
- Handoff is NOT a summary - it's a continuation protocol

## Handoff Document Structure

### Required Sections
1. **Session Context** - What was being worked on
2. **Current State** - Exact state of work (not "almost done", but specific)
3. **Progress** - What was completed with evidence
4. **Next Steps** - Immediate next action (single step, not list)
5. **Key Files** - Files to read first
6. **Decisions Made** - ADRs and technical choices
7. **Blockers** - What's preventing progress (if any)
8. **Artifacts** - Files created/modified during session

### Optional Sections
- **Context References** - Links to relevant docs/ADRs
- **Commands to Run** - Verification commands
- **Environment State** - Branch, pending commits, etc.

## Standards

- Write handoff to `.claude/context/runtime/session-handoff.md`
- Update task metadata with handoff reference
- Include timestamps for all state information
- Use absolute file paths (not relative)
- Provide copy-pasteable commands
- Test handoff by having another agent resume work

## Handoff Triggers

Create handoff when:
- Session approaching context limit (150K+ tokens)
- Complex multi-phase work not yet complete
- Need to switch agents/contexts
- User says "pause work" or "continue later"
- About to end session with incomplete work

## Anti-Patterns

- Handoff says "almost done" without specifics
- No clear next step (just "continue implementation")
- Missing file paths or commands
- Assumes receiving agent has context
- References external state not in document
- Uses "we" or "should" instead of "is" and "next"

## Integration Points

- **Task Management Protocol**: Reference task IDs in handoff
- **Memory Protocol**: Point to relevant learnings/decisions
- **Context Compressor**: Use for long session compression
- **TaskUpdate**: Update task metadata with handoff location
