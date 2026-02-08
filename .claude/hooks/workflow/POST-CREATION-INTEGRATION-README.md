# Post-Creation Integration Hook

**Task:** #7 (Phase 1.5 - ADR-100 Integration Checklist System)
**Created:** 2026-02-08
**Type:** PostToolUse Hook (Advisory Mode)

## Overview

Detects when creator skills complete and automatically queues artifacts for integration analysis. This hook is part of Phase 1.5 of the Integration Checklist System (ADR-100).

## How It Works

1. **Intercepts** TaskUpdate events where `status === "completed"`
2. **Detects** creator completions via:
   - Method 1: `metadata.creatorType` field (preferred)
   - Method 2: Regex pattern matching on subject/summary
3. **Checks** integration status using ArtifactGraph library
4. **Queues** artifacts with missing integrations for analysis
5. **Returns** advisory message (never blocks)

## Detection Patterns

### Creator Types Detected

- `skill` - Skill creation
- `agent` - Agent creation
- `hook` - Hook creation
- `workflow` - Workflow creation
- `template` - Template creation
- `schema` - Schema creation

### Pattern Matching

```regex
/creat(e|ed|ing)\s+(new\s+)?(skill|agent|hook|workflow|template|schema)/i
/skill-creator|agent-creator|hook-creator|workflow-creator|template-creator|schema-creator/i
```

## Queue Format

**File:** `.claude/context/runtime/integration-queue.jsonl`

**Format:** JSONL (one JSON object per line)

**Entry Structure:**

```json
{
  "timestamp": "2026-02-08T01:20:27.471Z",
  "artifactId": "skill:rate-limiter",
  "creatorType": "skill",
  "changeType": "created",
  "source": "post-creation-integration.cjs",
  "gaps": ["catalog-entry", "agent-assignment"],
  "priority": "P1",
  "processed": false
}
```

**Queue Management:**

- Max 500 lines
- Rotates automatically when limit exceeded
- Trims oldest 100 processed entries
- Append-only writes (no locking required)

## Integration Check

Uses `ArtifactGraph.isFullyIntegrated(artifactId)` to check:

- Catalog/registry entries
- Agent assignments
- Workflow references
- Hook registrations
- Required integrations per artifact type

## Performance

- **Target:** < 100ms
- **Actual:** ~198ms (includes Node.js startup overhead ~50-100ms)
- **Mode:** Synchronous (graph operations are fast, ~80KB max file)

## Advisory Mode

**Always returns `{ allow: true }`**

- Never blocks creator completions
- Logs diagnostics to stderr
- Returns integration gap message to stdout
- Fail-open on errors (exit 0)

## Usage

### Automatic (via settings.json registration)

Hook automatically triggers on all TaskUpdate completions.

### Manual Testing

```bash
# Test with valid input
echo '{"toolUse":{"tool":"TaskUpdate","input":{"status":"completed","taskId":"7","metadata":{"creatorType":"skill","artifactId":"skill:test"}}}}' | \
  node .claude/hooks/workflow/post-creation-integration.cjs

# Expected output (stdout):
# {"allow":true,"message":"⚠️ Artifact skill:test has N missing integration(s): [...]. Queued for integration analysis."}

# Diagnostic logs (stderr):
# [post-creation-integration] Detected skill completion: skill:test
# [post-creation-integration] Integration status: partially-integrated, gaps: catalog-entry, agent-assignment
# [post-creation-integration] Queued for integration analysis
```

## Error Handling

### Graceful Degradation

| Scenario             | Behavior                                                     |
| -------------------- | ------------------------------------------------------------ |
| Graph file missing   | Returns `{ gaps: ['graph-unavailable'], status: 'unknown' }` |
| Node not in graph    | Returns `{ gaps: ['not-in-graph'], status: 'unknown' }`      |
| Hook error           | Logs to stderr, returns `{ allow: true }`, exits 0           |
| Queue rotation fails | Logs to stderr, continues (rotation is optimization)         |

### Edge Cases

- Non-TaskUpdate tools → Pass through immediately
- Non-completed status → Ignore
- Non-creator tasks → Ignore
- Missing metadata → Construct `{type}:unknown` artifact ID

## Test Coverage

**13 tests across 2 test files:**

1. Detection logic (metadata method)
2. Detection logic (pattern matching)
3. Status filtering (completed only)
4. Creator type detection (all 6 types)
5. Queue writing
6. Queue format validation
7. Graph unavailable handling
8. Node not in graph handling
9. Non-TaskUpdate tool handling
10. Non-completed status handling
11. Non-creator task handling
12. Artifact ID extraction (explicit)
13. Artifact ID extraction (fallback)

**Run tests:**

```bash
node --test .claude/hooks/workflow/post-creation-integration*.test.cjs
```

## Integration Points

**Reads:**

- `.claude/context/data/artifact-graph.json` (via ArtifactGraph library)

**Writes:**

- `.claude/context/runtime/integration-queue.jsonl` (append-only)

**Dependencies:**

- `.claude/lib/workflow/artifact-graph.cjs` (ArtifactGraph library)

**Hook Type:**

- PostToolUse on TaskUpdate

**Registration:**

- Add to `.claude/settings.json` (pending)

## Future Enhancements

1. **Dashboard Widget** - Show pending integration queue size
2. **CLI Processor** - Tool to process queue entries
3. **Metrics Tracking** - Integration gap trends over time
4. **Priority Escalation** - P1 → P0 if not processed in 7 days
5. **Batch Processing** - Process multiple queue entries at once
6. **Integration Reports** - Generate integration status reports

## Related

- **ADR-100:** Integration Checklist System
- **Phase 1.2:** Artifact Graph Library (`.claude/lib/workflow/artifact-graph.cjs`)
- **Phase 1.5:** Post-Creation Integration Hook (this hook)
- **Phase 2:** Integration Processor (planned)
- **Phase 3:** Dashboard Integration (planned)

## Files

- **Hook:** `.claude/hooks/workflow/post-creation-integration.cjs` (342 lines)
- **Tests:** `.claude/hooks/workflow/post-creation-integration.test.cjs` (97 lines)
- **Edge Cases:** `.claude/hooks/workflow/post-creation-integration-edge-cases.test.cjs` (147 lines)
- **README:** This file
