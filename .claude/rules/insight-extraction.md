# Insight Extraction Rules

## Core Principles

- Sessions produce learnings - capture them before context is lost
- Extract patterns, not just facts
- Focus on actionable insights (not "worked on X")
- Distinguish between project-specific and universal patterns
- Insights inform future agents and users

## Extraction Categories

### Pattern Insights

- Recurring code patterns discovered
- Architectural patterns that worked/failed
- Testing patterns that caught bugs
- Workflow patterns that were efficient

### Technical Insights

- Performance optimizations discovered
- Library/API behaviors learned
- Platform-specific gotchas
- Integration challenges solved

### Process Insights

- Workflow improvements
- Tool usage patterns
- Communication patterns
- Collaboration patterns

### Decision Insights

- Why certain approaches were chosen
- Alternatives considered and rejected
- Trade-offs made
- Context that influenced decisions

## Standards

- Extract insights immediately after task completion
- Write to `.claude/context/memory/learnings.md`
- Include context (why insight matters)
- Provide examples when possible
- Tag insights by domain (code, workflow, architecture)
- Link to related decisions.md entries

## Insight Format

```markdown
### [Pattern Name] (YYYY-MM-DD)

**Context**: [When/where this applies]

**Insight**: [What was learned]

**Example**: [Concrete example]

**Impact**: [Why this matters]

**Related**: [Links to decisions/files]
```

## Anti-Patterns

- Recording what was done (not what was learned)
- Vague insights ("X is good")
- Insights without context
- Duplicate insights (check existing first)
- Forgetting to extract after long sessions
- Storing insights only in task metadata

## Extraction Triggers

### Automatic Triggers

| Trigger             | When                                      | Extract To   |
| ------------------- | ----------------------------------------- | ------------ |
| Task completion     | Every completed task (if learnings exist) | learnings.md |
| Bug fix             | Root cause identified and fixed           | learnings.md |
| Decision made       | Architecture or design decision           | decisions.md |
| Blocker encountered | Unresolved issue or workaround applied    | issues.md    |
| Pattern discovered  | Reusable pattern identified               | learnings.md |

### Manual Triggers

Extract insights when:

- Session ending with valuable learnings
- Unexpected behavior encountered (document gotchas)
- Performance optimization discovered
- Third-party API behavior learned
- Security vulnerability fixed (pattern to avoid)

## Deduplication Strategy

Before writing insights, check for duplicates:

1. **Search existing learnings**: `grep -i "keyword" .claude/context/memory/learnings.md`
2. **If duplicate found**: Update existing entry instead of creating new
3. **If similar but different**: Cross-reference both entries
4. **If completely new**: Add with proper context

### Deduplication Checklist

- [ ] Searched learnings.md for similar patterns
- [ ] Searched decisions.md for related decisions
- [ ] Checked date (is this a recent duplicate?)
- [ ] If duplicate: updated existing entry or cross-referenced

## Domain Tagging

Tag insights by domain for easier discovery:

| Domain Tag       | Examples                                      |
| ---------------- | --------------------------------------------- |
| `[CODE]`         | Code patterns, refactoring techniques         |
| `[WORKFLOW]`     | Process improvements, tool usage              |
| `[ARCHITECTURE]` | System design, component patterns             |
| `[SECURITY]`     | Security patterns, vulnerabilities            |
| `[PERFORMANCE]`  | Optimization techniques, bottlenecks          |
| `[TESTING]`      | Test patterns, coverage strategies            |
| `[INTEGRATION]`  | Third-party API behaviors, integration issues |
| `[DEBUGGING]`    | Debug techniques, root cause patterns         |

### Tagged Format Example

```markdown
### [CODE] Windows Path Normalization (2026-02-09)

**Context**: Windows path separators break regex patterns

**Insight**: Always normalize Windows backslashes to forward slashes before regex matching

**Example**: `path.relative().replace(/\\/g, '/')`

**Impact**: Prevents regex pattern mismatches on Windows

**Related**: `.claude/context/memory/issues.md` (glob pattern bugs)
```

## Memory Integration

### Integration Workflow

1. **Extract**: During or immediately after task completion
2. **Format**: Use insight format template with tags
3. **Deduplicate**: Check for existing similar insights
4. **Write**: Append to appropriate memory file
5. **Cross-reference**: Link related insights (decisions ↔ learnings ↔ issues)

### Memory File Selection

| Memory File    | Content Type                          |
| -------------- | ------------------------------------- |
| `learnings.md` | Patterns, techniques, optimizations   |
| `decisions.md` | Architecture decisions, trade-offs    |
| `issues.md`    | Known blockers, workarounds, gotchas  |
| `named/*.md`   | Project-specific persistent knowledge |

### Cross-Referencing Pattern

```markdown
### [ARCHITECTURE] BM25-Only Mode for Code Indexer (2026-02-09)

**Context**: Code indexer OOMs with async pipeline at 600+ files

**Insight**: BM25-only mode bypasses async pipeline, uses sync fast-path

**Example**: Set `LANCEDB_EMBEDDING_MODE=off` before requiring indexer

**Impact**: 1330 files in 19.5s (vs OOM at 600 files)

**Related**:

- Decision: ADR-105 (BM25-only mode architecture)
- Issue: Async pipeline OOM (resolved by sync fast-path)
- Learning: Lazy IDF calculation deferred to search time
```

## Integration Points

- **Memory Protocol**: Write to learnings.md/decisions.md/issues.md
- **Session Handoff**: Include key insights in handoff document
- **Task Management**: Reference insights in task metadata
- **Reflection Agent**: Reviews and consolidates insights
- **Context Compressor**: Insights guide what to preserve during compression
