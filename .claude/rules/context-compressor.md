---
paths:
  - .claude/skills/context-compressor/**
---

# Context Compressor Rules

## Core Principles

- Reduce token usage while preserving decision-critical information
- Transform verbose content, don't delete it
- Maintain traceability through references
- Test that work can continue from compressed context
- Use structured formats for consistency

## Standards

### Compression Targets

| Content Type  | Strategy                                     | Compression Ratio |
| ------------- | -------------------------------------------- | ----------------- |
| Code          | Keep signatures, summarize implementations   | 80-90%            |
| Conversations | Extract decisions, drop small talk           | 70-80%            |
| Documentation | Keep headings and key points                 | 60-70%            |
| Errors        | Keep message and location, drop stack frames | 90-95%            |
| Logs          | Keep patterns, drop repetitions              | 85-95%            |

### Decision Extraction Pattern

Transform verbose discussion into concise decisions:

**Before** (500 words):

```
User: Should we use Redis or Memcached?
Assistant: Let me analyze both options... [lengthy analysis]
Recommendation: Redis for pub/sub support.
User: Ok let's use Redis.
```

**After** (1 line):

```
Decision: Use Redis (chosen for pub/sub support)
```

### Code Summarization Pattern

**Before** (100 lines of implementation):

```javascript
class UserService {
  // 100 lines of CRUD implementation
}
```

**After** (5 lines of summary):

```
UserService: CRUD operations for users
- Methods: create, read, update, delete, findByEmail
- Dependencies: db, validator, logger
- Location: src/services/user.js
```

### Error Compression Pattern

**Before** (25 lines of stack trace):

```
Error: Cannot read property 'id' of undefined
    at UserController.getUser (src/controllers/user.js:45:23)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)
    ... 20 more stack frames
```

**After** (3 lines):

```
Error: Cannot read 'id' of undefined @ src/controllers/user.js:45
Cause: User object is null when accessing .id
```

## Structured Output Format

Use consistent formats for compressed output:

```markdown
## Session Summary

### Decisions Made

- [D1] Use Redis for caching
- [D2] JWT for authentication

### Files Modified

- src/auth/jwt.js (new)
- src/config/redis.js (updated)

### Open Items

- [ ] Add rate limiting
- [ ] Write tests for JWT
```

## Validation Checklist

Before finalizing compression, verify:

- [ ] All decisions captured with rationale
- [ ] Key file locations and line numbers retained
- [ ] Error causes documented (not just symptoms)
- [ ] Next steps clear and actionable
- [ ] Can resume work from compressed context
- [ ] Token count reduced by 60-90%

## Anti-Patterns

- Deleting information instead of summarizing
- Losing decision rationale
- Missing file paths and line numbers
- Vague summaries ("worked on auth")
- No validation that work can continue
- Compressing before identifying critical info

## Integration Points

### Session Handoff

- Compression feeds into session handoff documents
- Use compressed context for multi-session work
- Reference compressed summaries in task metadata

### Memory Protocol

- Compressed decisions go to `.claude/context/memory/decisions.md`
- Compressed patterns go to `.claude/context/memory/learnings.md`
- Don't lose information - transform and persist

### Multi-Agent Coordination

- Agents use compressed context for efficient handoffs
- Orchestrators compress phase summaries
- Background agents compress long-running task status

## When to Compress

**Triggers:**

- Context approaching 150K tokens
- Session ending with incomplete work
- Multi-agent handoff needed
- Long conversation history (>10 messages)
- Background agent reporting to main session

**Don't compress:**

- Active debugging (need full error traces)
- Mid-implementation (need code context)
- Before understanding the problem

## Compression Techniques

### 1. Decision Extraction

Keep: What was decided, why, who decided
Drop: Discussion details, alternatives explored (unless critical)

### 2. Code Summarization

Keep: Function signatures, dependencies, location
Drop: Implementation details (reference file instead)

### 3. Error Compression

Keep: Error message, location, root cause
Drop: Stack trace (keep top 2-3 frames only)

### 4. Log Compression

Keep: Unique events, patterns, anomalies
Drop: Repetitions, debug noise, timestamps (keep first/last only)

### 5. Conversation Compression

Keep: Questions asked, answers provided, decisions made
Drop: Clarifications, small talk, repeated information

## Related Skills

- `session-handoff` - Creates full session handoff documents
- `task-management-protocol` - Task metadata for context handoff
- `swarm-coordination` - Multi-agent context sharing

## Related References

- `.claude/skills/context-compressor/SKILL.md` - Complete compression techniques
- `.claude/rules/session-handoff.md` - Session handoff protocol
- `.claude/rules/memory-protocol.md` - Memory persistence rules
- `ADR-102` - Memory management rebuild (hierarchical tiers)
