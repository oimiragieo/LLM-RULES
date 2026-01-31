# Memory System Documentation

## Why Memory Matters

> "If it's not in memory, it didn't happen."

AI agents operate in a stateless environment where context resets between sessions. Memory provides continuity across conversations, enabling learnings to compound over time. Without memory, every session starts from zero.

## Memory File Locations

All memory files live in `.claude/context/memory/`:

| File                | Purpose                       | Format                    |
| ------------------- | ----------------------------- | ------------------------- |
| `learnings.md`      | Patterns, solutions, gotchas  | Markdown (Legacy Archive) |
| `decisions.md`      | Architecture Decision Records | ADR format                |
| `issues.md`         | Known blockers and fixes      | Issue format              |
| `active_context.md` | Current session state         | Markdown                  |
| `gotchas.json`      | Pitfalls to avoid             | JSON array                |
| `patterns.json`     | Reusable solutions            | JSON array                |
| `codebase_map.json` | File discoveries              | JSON object               |
| `sessions/`         | Per-session JSON files        | JSON                      |

## Session-Based Memory

Sessions persist automatically via the SessionEnd hook. This is the primary memory storage mechanism.

### Session Files

**Location**: `.claude/context/memory/sessions/`

Session files follow the naming pattern `session_NNN.json` where NNN is a zero-padded number (e.g., `session_001.json`, `session_002.json`).

**Auto-increment**: The memory manager automatically creates the next session number when saving.

**Structure**:

```json
{
  "session_number": 1,
  "timestamp": "2026-01-25T10:30:00.000Z",
  "summary": "Session summary text",
  "tasks_completed": ["Task 1", "Task 2"],
  "files_modified": ["path/to/file.js"],
  "discoveries": ["Discovery 1"],
  "patterns_found": ["Pattern 1"],
  "gotchas_encountered": ["Gotcha 1"],
  "decisions_made": ["Decision 1"],
  "next_steps": ["Next step 1"]
}
```

### JSON Memory Files

**Gotchas** (`.claude/context/memory/gotchas.json`):

```json
[
  {
    "text": "Always close DB connections in workers",
    "timestamp": "2026-01-25T10:30:00.000Z"
  }
]
```

**Patterns** (`.claude/context/memory/patterns.json`):

```json
[
  {
    "text": "Use async/await for all API calls",
    "timestamp": "2026-01-25T10:30:00.000Z"
  }
]
```

**Codebase Map** (`.claude/context/memory/codebase_map.json`):

```json
{
  "discovered_files": {
    "src/auth.ts": {
      "description": "JWT authentication handler",
      "category": "security",
      "discovered_at": "2026-01-25T10:30:00.000Z"
    }
  },
  "last_updated": "2026-01-25T10:30:00.000Z"
}
```

### Session Retention

The memory system automatically prunes old sessions to prevent unbounded growth:

- **Max sessions**: 50 (configurable in `memory-manager.cjs`)
- **Pruning**: Automatic when saving new sessions
- **Retention**: Most recent 50 sessions kept

## Memory Manager CLI

The `memory-manager.cjs` script provides CLI access to the memory system.

**Location**: `.claude/lib/memory/memory-manager.cjs`

### Record a Gotcha

```bash
node .claude/lib/memory/memory-manager.cjs record-gotcha "description"
```

Records a pitfall to avoid. The gotcha is saved to `gotchas.json` with a timestamp.

### Record a Pattern

```bash
node .claude/lib/memory/memory-manager.cjs record-pattern "description"
```

Records a reusable solution. The pattern is saved to `patterns.json` with a timestamp.

### Record a Discovery

```bash
node .claude/lib/memory/memory-manager.cjs record-discovery "path" "description" [category]
```

Records a codebase file discovery. The discovery is saved to `codebase_map.json` with the file path, description, category (default: "general"), and timestamp.

**Example**:

```bash
node .claude/lib/memory/memory-manager.cjs record-discovery "src/auth.ts" "JWT authentication handler" "security"
```

### Load All Memory

```bash
node .claude/lib/memory/memory-manager.cjs load
```

Loads all memory files and outputs as formatted markdown. This is the command agents use to read memory at the start of a session.

**Output includes**:

- Recent gotchas (truncated to 20 items)
- Recent patterns (truncated to 20 items)
- Recent discoveries (truncated to 30 items)
- Recent sessions (last 5 sessions with summaries)
- Legacy learnings.md summary (last 3000 characters)

### Memory Statistics

```bash
node .claude/lib/memory/memory-manager.cjs stats
```

Outputs JSON statistics about the memory system:

```json
{
  "gotchas_count": 15,
  "patterns_count": 23,
  "discoveries_count": 42,
  "sessions_count": 12,
  "total_size_bytes": 125430
}
```

### Save a Session

```bash
echo '{"summary":"Fixed auth bug", "tasks_completed":["Fix login"], "files_modified":["src/auth.ts"]}' | node .claude/lib/memory/memory-manager.cjs save-session
```

Saves a session from JSON input (via stdin). This is typically called by the SessionEnd hook automatically.

## Memory Protocol for Agents

Every agent MUST follow the Memory Protocol before starting work:

### 1. Read Memory (MANDATORY)

Before starting any task, agents must read memory to understand context:

```bash
cat .claude/context/memory/learnings.md
```

Or use the memory manager to load structured memory:

```bash
node .claude/lib/memory/memory-manager.cjs load
```

### 2. Record Learnings (MANDATORY)

During and after completing work, agents must record discoveries:

**Record a gotcha**:

```bash
node .claude/lib/memory/memory-manager.cjs record-gotcha "Always validate user input before database queries"
```

**Record a pattern**:

```bash
node .claude/lib/memory/memory-manager.cjs record-pattern "Use Zod schemas for API validation"
```

**Record a discovery**:

```bash
node .claude/lib/memory/memory-manager.cjs record-discovery "src/api/users.ts" "User API endpoints" "api"
```

### 3. Assume Interruption (CRITICAL)

Agents must operate under the assumption that their context can reset at any time. If information is not persisted to memory, it is lost.

**Rule**: Persist context immediately after discovering something important. Don't wait until the end of the session.

## How Sessions Persist

The `unified-reflection-handler.cjs` hook automatically captures session insights:

**Location**: `.claude/hooks/reflection/unified-reflection-handler.cjs`

**Trigger**: SessionEnd event (when a conversation session ends)

**Workflow**:

1. Gather session insights from the SessionEnd payload (if provided) or `active_context.md`
2. Build session data structure
3. Call `memory-manager.cjs` `saveSession()` function
4. Auto-increment session number
5. Save to `sessions/session_NNN.json`
6. Extract patterns and gotchas to their respective JSON files
7. Prune old sessions if count exceeds 50

**Note**: The deprecated `session-end-recorder.cjs` functionality was consolidated into `unified-reflection-handler.cjs` (PERF-003).

**Session Data Structure**:

```javascript
{
  summary: 'Session summary',
  tasks_completed: ['Task 1', 'Task 2'],
  files_modified: ['path/to/file.js'],
  discoveries: ['Discovery 1'],
  patterns_found: ['Pattern 1'],
  gotchas_encountered: ['Gotcha 1'],
  decisions_made: ['Decision 1'],
  next_steps: ['Next step 1']
}
```

## Automatic Memory Injection

Memory context is automatically injected into agent spawn prompts via `prompt-assembler.cjs`.

**Integration point**:

- Injection is applied at runtime by the PreToolUse(Task) hook: `.claude/hooks/routing/spawn-prompt-assembler.cjs`
- This avoids relying on the Router agent (a prompt file) to manually call the assembler.
- Semantic matches are enabled by default; set `SPAWN_PROMPT_SEMANTIC_MEMORY=off` to disable.

**What's injected**:

- Recent gotchas
- Recent patterns
- Recent discoveries
- Recent session summaries

**How it works**:

1. Router spawns agent via Task()
2. `prompt-assembler.cjs` loads memory via `loadMemoryForContext()`
3. Memory is formatted as a markdown section
4. Memory section is injected near `## Memory Protocol` when possible

**Disabling**:

- Memory injection: Pass `includeMemory: false` to `assembleSpawnPrompt()` (not recommended)
- Semantic matches: Set `SPAWN_PROMPT_SEMANTIC_MEMORY=off` environment variable

## Keyword Search Fallback

When semantic search (ChromaDB) is unavailable, `ContextualMemory` falls back to keyword search with performance optimizations:

**Tool Priority**:

1. **ripgrep** (fastest) - Uses `@vscode/ripgrep` npm package or bundled binary
2. **File reads** (fallback) - Bounded reads (80KB max per file)

**Performance**:

- ripgrep: <50ms for typical searches across memory files
- File reads: <200ms (bounded to last 80KB per file)

**Dependencies**:

- `@vscode/ripgrep` - Automatically downloads correct binary for your platform
- `@ast-grep/cli` - Available for future structured search enhancements

## ADR Format (decisions.md)

Architecture Decision Records follow a standard format:

```markdown
## [ADR-XXX] Title

- **Date**: YYYY-MM-DD
- **Status**: Proposed | Accepted | Deprecated | Superseded
- **Context**: Why this decision was needed
- **Decision**: What was decided
- **Consequences**: Trade-offs and implications
```

**Example**:

```markdown
## [ADR-001] Router-First Protocol

- **Date**: 2026-01-23
- **Status**: Accepted
- **Context**: Need consistent request handling across all agent interactions
- **Decision**: All requests must first go through the Router Agent for classification
- **Consequences**: Adds routing overhead but ensures proper agent selection
```

**When to create ADRs**:

- Major architectural decisions
- Framework adoption decisions
- Protocol changes
- Tool/library selections with trade-offs

**Status transitions**:

- Proposed → Accepted (when team agrees)
- Accepted → Deprecated (when replaced)
- Accepted → Superseded (when a new ADR replaces it)

## Issue Format (issues.md)

Known issues and blockers follow a standard format:

```markdown
## [ISSUE-XXX] Title

- **Date**: YYYY-MM-DD
- **Severity**: Critical | High | Medium | Low
- **Status**: Open | In Progress | Resolved | Won't Fix
- **Description**: What the issue is
- **Workaround**: Temporary solution (if any)
- **Resolution**: How it was fixed (when resolved)
```

**Example**:

```markdown
## [SEC-001] RESOLVED: Bash Command Validator Fail-Open Vulnerability

- **Date**: 2026-01-25
- **Severity**: Critical
- **Status**: Resolved
- **File**: `.claude/hooks/safety/bash-command-validator.cjs`
- **Lines**: 166-173
- **STRIDE Category**: Elevation of Privilege
- **Description**: The bash command validator had a fail-open pattern where catch blocks would call `process.exit(0)`, allowing all commands through on any error. An attacker could craft malformed input to trigger errors and bypass security validation entirely.
- **Resolution**: Changed `process.exit(0)` to `process.exit(2)` (block) in the catch block. Added security rationale comments explaining defense-in-depth principle: "deny by default when security state is unknown."
```

## Context Efficiency

The memory system uses read-time truncation to ensure memory loading fits within context limits:

**Configuration** (in `memory-manager.cjs`):

```javascript
MAX_CONTEXT_CHARS: {
  gotchas: 2000,
  patterns: 2000,
  discoveries: 3000,
  sessions: 5000,
  legacy: 3000,
}

MAX_ITEMS: {
  gotchas: 20,
  patterns: 20,
  discoveries: 30,
  sessions: 5,
}
```

**Loading strategy**:

1. Load most recent items (last N items from arrays)
2. Truncate to max characters per category
3. Return only what fits in context
4. Gracefully degrade if memory files are missing or corrupted

**Why this matters**: Loading full memory files can consume excessive context tokens. Truncation ensures agents get the most relevant recent memory without blowing the context budget.

## Best Practices

### 1. Record Learnings Immediately

Don't wait until the end of a session to record discoveries. Record them as soon as you find them.

**Why**: Context can reset at any time. Early recording ensures learnings survive interruptions.

### 2. Use Specific, Searchable Descriptions

Write gotchas and patterns with enough detail that future agents can find and understand them.

**Bad**: "Fix the bug"
**Good**: "Always validate user input before database queries to prevent SQL injection"

### 3. Reference File Paths When Relevant

Include file paths in discoveries and patterns so future agents can locate the code.

**Example**: "JWT authentication handler in `src/auth/jwt.ts` uses RS256 algorithm"

### 4. Keep Issues Updated with Status

When an issue is resolved, update the status and add the resolution. Don't leave stale "Open" issues.

**Update template**:

```markdown
- **Status**: Resolved
- **Resolution**: Changed `process.exit(0)` to `process.exit(2)` in catch block
```

### 5. Use Categories for Discoveries

When recording file discoveries, use consistent categories:

- `api` - API endpoints
- `security` - Security-related code
- `config` - Configuration files
- `testing` - Test files
- `database` - Database schemas and migrations
- `general` - Everything else

### 6. Read Memory Before Every Task

Never start work without reading memory. It's the only way to benefit from past learnings.

**MANDATORY**: All agents must read memory files at the start of their workflow.

### 7. Don't Duplicate Entries

The memory manager automatically checks for duplicates when recording gotchas and patterns. Don't manually add duplicates to JSON files.

**Duplicate detection**: Simple text match (case-insensitive)

## How Memory Enables Persistent AI Collaboration

Memory transforms AI agents from one-shot tools into persistent collaborators:

### Without Memory

- Every session starts from zero
- Same mistakes repeated
- No learning from past work
- Context lost between sessions
- Inefficient exploration of codebase

### With Memory

- Learnings compound over time
- Gotchas captured and avoided
- Patterns emerge and get reused
- Context persists across sessions
- Efficient navigation of codebase via codebase_map

### Example: Multi-Session Feature Development

**Session 1** (exploration):

- Agent discovers auth handler in `src/auth.ts`
- Records discovery to codebase_map
- Records pattern: "Use JWT with RS256 algorithm"

**Session 2** (implementation):

- Agent reads memory, sees auth handler location
- Reuses JWT pattern from memory
- Avoids re-exploring codebase

**Session 3** (debugging):

- Agent reads memory, sees past gotcha: "Always validate JWT expiry"
- Applies gotcha to fix bug
- Records new gotcha: "Check token refresh race conditions"

**Result**: Each session builds on previous work. No wasted effort, faster iteration, higher quality.

## Legacy Archive System

The original `learnings.md` file is now a **read-only archive**. New learnings should use the session-based system.

### Why the Change?

**Problems with monolithic learnings.md**:

- File grew too large (5000+ lines)
- Context token waste loading entire file
- Hard to find relevant learnings
- No structure or categorization

**Solutions with session-based memory**:

- Learnings split across sessions
- Read-time truncation for efficiency
- Structured JSON for gotchas/patterns/discoveries
- Automatic pruning of old sessions

### Archival Guidance

When `learnings.md` exceeds 5000 lines, archive older sections to `.claude/context/memory/archive/learnings-YYYY-MM.md` where YYYY-MM is the month being archived.

**Archive process**:

1. Create archive directory if it doesn't exist
2. Move old content (e.g., content older than 6 months) to dated archive file
3. Update `learnings.md` header with archive location
4. Keep recent learnings in main file

## Integration with Other Systems

### Integration with Task System

Memory and task systems work together:

- Tasks reference memory for context
- Task completion triggers memory recording
- TaskUpdate metadata can include discoveries

**Example**:

```javascript
TaskUpdate({
  taskId: '3',
  status: 'completed',
  metadata: {
    summary: 'Fixed auth bug',
    filesModified: ['src/auth.ts'],
    discoveries: ['JWT expiry validation missing'],
    patterns: ['Always check token expiry before refresh'],
  },
});
```

### Integration with Agent Spawning

Agents receive memory context in spawn prompts:

```javascript
Task({
  prompt: `You are DEVELOPER.

## Memory Protocol (MANDATORY)
1. Read .claude/context/memory/learnings.md before starting
2. Record learnings/issues/decisions during work
3. Assume interruption - persist context immediately

## Task
[Task details here]
`,
});
```

### Integration with Workflow Skills

Workflow skills like `session-handoff` leverage memory:

- Read current session state from `active_context.md`
- Generate session summary
- Save to session file via memory-manager
- Clear active context for next session

## Troubleshooting

### Memory Files Not Found

**Symptom**: `load` command returns empty results

**Solution**: Initialize memory files

```bash
mkdir -p .claude/context/memory/sessions
echo '[]' > .claude/context/memory/gotchas.json
echo '[]' > .claude/context/memory/patterns.json
echo '{"discovered_files":{},"last_updated":null}' > .claude/context/memory/codebase_map.json
```

### Session Numbers Not Incrementing

**Symptom**: New sessions overwrite old ones

**Solution**: Check session file naming format. Files must match `session_NNN.json` pattern with zero-padded numbers.

### Memory Load Too Slow

**Symptom**: Loading memory takes > 1 second

**Solution**: Prune old sessions and reduce MAX_ITEMS/MAX_CONTEXT_CHARS in `memory-manager.cjs`:

```javascript
MAX_ITEMS: {
  gotchas: 10,  // Reduced from 20
  patterns: 10,
  discoveries: 15,
  sessions: 3,
}
```

### Duplicate Entries

**Symptom**: Same gotcha appears multiple times

**Solution**: Memory manager checks for duplicates automatically. If duplicates persist, manually deduplicate the JSON file:

```bash
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('.claude/context/memory/gotchas.json')); const unique=[...new Map(data.map(g=>[g.text,g])).values()]; fs.writeFileSync('.claude/context/memory/gotchas.json', JSON.stringify(unique,null,2));"
```

## Advanced Usage

### Programmatic Access

The memory-manager can be imported and used programmatically:

```javascript
const memoryManager = require('./.claude/lib/memory/memory-manager.cjs');

// Record a gotcha
memoryManager.recordGotcha('Always validate user input');

// Record a pattern
memoryManager.recordPattern('Use async/await for API calls');

// Record a discovery
memoryManager.recordDiscovery('src/auth.ts', 'JWT handler', 'security');

// Load memory for context
const memory = memoryManager.loadMemoryForContext();
console.log(memory.gotchas);

// Get statistics
const stats = memoryManager.getMemoryStats();
console.log(`Total gotchas: ${stats.gotchas_count}`);

// Save a session
memoryManager.saveSession({
  summary: 'Fixed auth bug',
  tasks_completed: ['Fix login'],
  files_modified: ['src/auth.ts'],
});
```

### Custom Session Data

The `saveSession` function accepts additional custom fields:

```javascript
memoryManager.saveSession({
  summary: 'Implemented feature X',
  tasks_completed: ['Task 1', 'Task 2'],
  files_modified: ['file1.ts', 'file2.ts'],
  custom_metric: 42, // Custom field preserved
  team_notes: 'Reviewed by Alice', // Custom field preserved
});
```

### Filtering Loaded Memory

You can filter memory by category when loading:

```javascript
const memory = memoryManager.loadMemoryForContext();

// Filter discoveries by category
const securityDiscoveries = memory.discoveries.filter(d => d.category === 'security');

// Filter sessions by date
const recentSessions = memory.recent_sessions.filter(s => {
  const sessionDate = new Date(s.timestamp);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return sessionDate > weekAgo;
});
```

## Summary

The memory system provides persistent context across AI agent sessions through:

1. **Session-based JSON files** for structured memory storage
2. **Read-time truncation** for context efficiency
3. **Automatic SessionEnd hook** for zero-overhead persistence
4. **CLI and programmatic access** for flexible memory recording
5. **Memory Protocol** requiring all agents to read before starting work

**Remember**: "If it's not in memory, it didn't happen."

Always read memory before starting work. Always record learnings immediately. Always assume interruption.
