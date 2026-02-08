---
name: artifact-integrator
description: Deep integration analysis for newly created artifacts
version: 1.0.0
category: workflow
agents:
  - architect
  - planner
  - developer
tools:
  - Read
  - Write
  - Edit
  - TaskCreate
  - TaskList
  - TaskUpdate
  - Bash
---

# Artifact Integrator

## Purpose
Analyze newly created or modified artifacts for integration gaps and propose follow-up tasks to ensure full ecosystem integration.

## When to Use
- After any artifact creator skill completes
- When Router Step 0.5 detects unprocessed integration queue entries
- When manually checking integration health
- When reviewing artifacts for completeness

## Protocol

### Step 1: Read Integration Queue
Read `.claude/context/runtime/integration-queue.jsonl`
Filter for entries with `"processed": false`
If no unprocessed entries, check if `artifactId` argument was provided for direct analysis.

### Step 2: Analyze Each Artifact
For each unprocessed entry (or the directly specified artifact):

1. Load the artifact graph: `require('.claude/lib/workflow/artifact-graph.cjs')`
2. Load impact analyzer: `require('.claude/lib/workflow/integration-impact.cjs')`
3. Call `analyzeImpact({ artifactId, changeType, graphPath })`
4. Review the `missingIntegrations` and `proposedTasks`

### Step 3: Generate Integration Plan
For each artifact with missing integrations:

**Must-Have (P1) — Create tasks immediately:**
- Missing catalog entry → TaskCreate: "Add {name} to {catalog}"
- Missing agent assignment → TaskCreate: "Assign {name} to relevant agent"
- Missing routing entry → TaskCreate: "Update routing for {name}"
- Missing hook registration → TaskCreate: "Register {name} in settings.json"

**Should-Have (P2) — Create tasks with lower priority:**
- Missing documentation → TaskCreate: "Document {name} in {doc}"
- Missing enforcement hook → TaskCreate: "Create enforcement for {name}"
- Missing tests → TaskCreate: "Write tests for {name}"

**Nice-to-Have — Note but don't create tasks:**
- Missing templates, optional docs

### Step 4: Update Graph
After creating integration tasks:
- Add edges for newly discovered relationships
- Update node `integrationStatus` based on current state
- Save the graph

### Step 5: Mark Queue Entries Processed
For each processed entry, update the JSONL to mark `processed: true`

### Step 6: Report
Output a summary:
```
## Integration Analysis Report

Processed: {count} artifacts
Tasks created: {count}
Must-have gaps: {count}
Should-have gaps: {count}

### Details
[artifact-by-artifact breakdown]
```

## Arguments
- `artifactId` (optional) — Analyze a specific artifact instead of queue
- `mode` (optional) — 'queue' (default) | 'single' | 'health-check'

## Integration Rules by Artifact Type

| Type | Must-Have | Should-Have |
|------|-----------|-------------|
| Skill | Catalog + agent assignment | Hook, workflow ref |
| Agent | Registry + routing keywords | Skills, model config |
| Hook | settings.json registration | Docs entry |
| Workflow | Registry + agent mapping | Docs entry |
| Template | Catalog entry | Consumer ref |
| Schema | Catalog entry | Consumer wiring |

## Example Usage

```javascript
Skill({ skill: 'artifact-integrator' })
// Processes queue, creates tasks, updates graph

Skill({ skill: 'artifact-integrator', args: 'skill:rate-limiter' })
// Analyzes specific artifact
```

## Implementation Reference

**Core Libraries:**
- `.claude/lib/workflow/integration-impact.cjs` - Impact analysis and task generation
- `.claude/lib/workflow/artifact-graph.cjs` - Graph CRUD operations

**Data Sources:**
- `.claude/context/runtime/integration-queue.jsonl` - Queue of artifacts needing integration
- `.claude/context/data/artifact-graph.json` - Artifact relationship graph

**Integration Queue Format:**
```jsonl
{"artifactId":"skill:rate-limiter","changeType":"created","timestamp":"2026-02-07T10:30:00Z","processed":false}
{"artifactId":"agent:security-architect","changeType":"updated","timestamp":"2026-02-07T10:35:00Z","processed":false}
```

## Workflow Integration

This skill is invoked by:
- Router Step 0.5 (automatic when queue entries exist)
- Creator skills (after artifact creation)
- Manual health checks

**Auto-invoke pattern:**
```javascript
// Router Step 0.5 pseudocode
if (integrationQueueHasUnprocessedEntries()) {
  Task({
    subagent_type: 'developer',
    prompt: 'Invoke Skill({ skill: "artifact-integrator" })'
  });
}
```

## Related Skills

- `research-synthesis` - Research phase before artifact creation
- `agent-creator` - Creates agents (triggers integration analysis)
- `skill-creator` - Creates skills (triggers integration analysis)
- `hook-creator` - Creates hooks (triggers integration analysis)
- `workflow-creator` - Creates workflows (triggers integration analysis)

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**
- New integration pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
