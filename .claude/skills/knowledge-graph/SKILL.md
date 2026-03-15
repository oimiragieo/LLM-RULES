---
name: knowledge-graph
description: Entity and relation tracking skill using MCP memory server patterns and local knowledge graph storage. Build persistent knowledge graphs of entities, relationships, and observations across agent sessions. Covers the MCP memory server (@modelcontextprotocol/server-memory), local JSON-based graphs, and entity-relation querying patterns for long-running agents.
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Bash, Read, Write, Edit, Glob, Grep]
best_practices:
  - Always use entity IDs (not names) as stable references
  - Store observations with timestamps for temporal reasoning
  - Normalize entity types across all insertions
  - Use relation types that are directional (e.g., "manages" not "related_to")
  - Prune stale observations periodically to keep graph queryable
error_handling: graceful
streaming: not_applicable
verified: true
lastVerifiedAt: 2026-03-15T00:00:00.000Z
---

# Knowledge Graph

## Overview

Build and query persistent knowledge graphs of entities, relationships, and observations across agent sessions. Enables agents to accumulate structured knowledge over time — tracking what they've learned about projects, people, codebases, and domains.

## When to Invoke

`Skill({ skill: 'knowledge-graph' })` when:

- Agent needs to remember structured facts across sessions
- Building a model of a codebase, project, or domain from observations
- Tracking relationships between people, systems, or concepts
- Implementing long-term memory that survives context resets

## Option 1: MCP Memory Server (Recommended for Claude Agents)

The official MCP memory server provides a persistent knowledge graph accessible via tool calls.

### Setup

```bash
npx -y @modelcontextprotocol/server-memory
```

**Claude Desktop / settings.json config:**

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": ".claude/context/memory/knowledge-graph.json"
      }
    }
  }
}
```

### MCP Memory Server Tools

| Tool                  | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `create_entities`     | Add one or more entities with type and observations |
| `create_relations`    | Add directed relations between entities             |
| `add_observations`    | Append new observations to existing entities        |
| `delete_entities`     | Remove entities (and their relations)               |
| `delete_observations` | Remove specific observations                        |
| `delete_relations`    | Remove specific relations                           |
| `read_graph`          | Return the full graph                               |
| `search_nodes`        | Search entities by query string                     |
| `open_nodes`          | Retrieve specific entities by name                  |

### Usage Pattern

```javascript
// Create entities
mcp__memory__create_entities({
  entities: [
    {
      name: 'authentication-service',
      entityType: 'service',
      observations: [
        'Handles JWT authentication and refresh token rotation',
        'Located at src/auth/',
        'Uses Redis for token storage',
        'Rate-limited to 100 req/min per IP',
      ],
    },
    {
      name: 'Alice Chen',
      entityType: 'person',
      observations: ['Senior engineer, owns the auth service', 'On-call for auth incidents'],
    },
  ],
});

// Create relations
mcp__memory__create_relations({
  relations: [
    {
      from: 'Alice Chen',
      to: 'authentication-service',
      relationType: 'owns',
    },
  ],
});

// Add new observations as you learn more
mcp__memory__add_observations({
  observations: [
    {
      entityName: 'authentication-service',
      contents: ['Migrated to Argon2 password hashing in March 2026'],
    },
  ],
});

// Search for relevant nodes
mcp__memory__search_nodes({ query: 'authentication' });

// Retrieve specific entities
mcp__memory__open_nodes({ names: ['authentication-service', 'Alice Chen'] });
```

### Session Startup Pattern (MANDATORY)

At the start of every agent session that uses knowledge graphs:

```javascript
// 1. Load existing graph context
const existing = await mcp__memory__read_graph({});
// Review existing entities for this domain

// 2. Search for relevant entities
const relevant = await mcp__memory__search_nodes({ query: '<current task domain>' });

// 3. Update entities with new observations from this session
// ... do work ...

// 4. Before session end, add observations for key discoveries
await mcp__memory__add_observations({
  observations: [
    {
      entityName: 'my-project',
      contents: [`Session ${new Date().toISOString()}: Discovered X, fixed Y`],
    },
  ],
});
```

## Option 2: Local JSON Knowledge Graph

For agents without MCP memory server access, use a local JSON file:

```python
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

GRAPH_PATH = Path(".claude/context/memory/knowledge-graph.json")

def load_graph() -> dict:
    if GRAPH_PATH.exists():
        return json.loads(GRAPH_PATH.read_text())
    return {"entities": {}, "relations": []}

def save_graph(graph: dict):
    GRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
    GRAPH_PATH.write_text(json.dumps(graph, indent=2))

def add_entity(graph: dict, name: str, entity_type: str, observations: list[str]) -> str:
    """Add or update an entity. Returns entity ID."""
    # Check if entity with this name exists
    for eid, entity in graph["entities"].items():
        if entity["name"] == name:
            entity["observations"].extend(observations)
            entity["updated_at"] = datetime.now(timezone.utc).isoformat()
            return eid

    # Create new entity
    eid = str(uuid.uuid4())[:8]
    graph["entities"][eid] = {
        "id": eid,
        "name": name,
        "type": entity_type,
        "observations": observations,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    return eid

def add_relation(graph: dict, from_name: str, to_name: str, relation_type: str):
    """Add a directed relation between two entities by name."""
    graph["relations"].append({
        "from": from_name,
        "to": to_name,
        "type": relation_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

def search_entities(graph: dict, query: str) -> list[dict]:
    """Search entities by name, type, or observation content."""
    query_lower = query.lower()
    results = []
    for entity in graph["entities"].values():
        if (query_lower in entity["name"].lower()
            or query_lower in entity["type"].lower()
            or any(query_lower in obs.lower() for obs in entity["observations"])):
            results.append(entity)
    return results

def get_entity_relations(graph: dict, entity_name: str) -> dict:
    """Get all relations for an entity (outgoing and incoming)."""
    outgoing = [r for r in graph["relations"] if r["from"] == entity_name]
    incoming = [r for r in graph["relations"] if r["to"] == entity_name]
    return {"outgoing": outgoing, "incoming": incoming}

# Usage
graph = load_graph()

auth_id = add_entity(graph, "authentication-service", "service", [
    "Handles JWT authentication",
    "Located at src/auth/",
    "Uses Redis for token storage",
])

add_entity(graph, "Alice Chen", "person", [
    "Senior engineer, owns the auth service",
])

add_relation(graph, "Alice Chen", "authentication-service", "owns")

save_graph(graph)

# Query
results = search_entities(graph, "auth")
relations = get_entity_relations(graph, "Alice Chen")
```

## Entity Schema

```typescript
interface Entity {
  id: string; // Stable UUID (never changes)
  name: string; // Human-readable identifier
  type: EntityType; // Normalized type string
  observations: string[]; // Timestamped facts (append-only)
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

interface Relation {
  from: string; // Entity name (source)
  to: string; // Entity name (target)
  type: string; // Directional verb: "owns", "depends_on", "calls", "manages"
  created_at: string;
}

// Common entity types
type EntityType =
  | 'person'
  | 'service'
  | 'codebase'
  | 'file'
  | 'concept'
  | 'organization'
  | 'tool'
  | 'decision'
  | 'issue'
  | 'feature';
```

## Common Relation Types

| Relation        | Direction         | Example                             |
| --------------- | ----------------- | ----------------------------------- |
| `owns`          | person → service  | Alice owns auth-service             |
| `depends_on`    | service → service | api-gateway depends_on auth-service |
| `calls`         | service → service | checkout calls payment-processor    |
| `manages`       | person → person   | CTO manages engineering team        |
| `implements`    | service → concept | auth-service implements JWT         |
| `documented_in` | feature → file    | login documented_in README          |
| `fixes`         | commit → issue    | fix/abc123 fixes issue-456          |
| `blocks`        | issue → issue     | JIRA-100 blocks JIRA-101            |

## Codebase Knowledge Graph Pattern

Build a knowledge graph of a codebase as you explore it:

```javascript
// As you discover things about a codebase, record them
async function recordCodebaseDiscovery(findings: Discovery[]) {
  const entities = findings.map(f => ({
    name: f.componentName,
    entityType: f.type, // "module", "class", "service", "database"
    observations: f.observations,
  }));

  await mcp__memory__create_entities({ entities });

  const relations = findings.flatMap(f =>
    f.dependencies.map(dep => ({
      from: f.componentName,
      to: dep,
      relationType: "depends_on",
    }))
  );

  if (relations.length > 0) {
    await mcp__memory__create_relations({ relations });
  }
}

// Session startup: check what we already know
async function loadCodebaseContext(projectName: string) {
  const graph = await mcp__memory__search_nodes({ query: projectName });
  if (graph.entities.length > 0) {
    console.log(`Loaded ${graph.entities.length} known entities for ${projectName}`);
    return graph;
  }
  return null; // Fresh start
}
```

## Graph Storage Location

- MCP server graph: `MEMORY_FILE_PATH` env var → default: in-memory (not persisted)
- Local JSON graph: `.claude/context/memory/knowledge-graph.json`
- Project-specific graphs: `.claude/context/memory/kg-<project-name>.json`

## Anti-Patterns

- Never use mutable names as entity IDs — names change, IDs must not
- Never store observations without timestamps — temporal context is critical
- Never use symmetric relation types like "related_to" — always directional
- Never let graphs grow unbounded — prune entities older than 90 days with no recent observations
- Never query the full graph for every lookup — use `search_nodes` with specific queries

## Related Skills

- `memory-search` — Semantic search over agent memory
- `context-compressor` — Compress large knowledge graphs when approaching token limits
- `mcp-builder` — Build custom MCP servers for specialized knowledge graph backends

## Memory Protocol (MANDATORY)

**Before starting any task:**

```bash
# Check what the agent already knows
mcp__memory__search_nodes({ query: "<task domain>" })
```

**After completing work:**

```javascript
// Record key discoveries as observations
mcp__memory__add_observations({
  observations: [
    {
      entityName: '<project-or-domain>',
      contents: ['<what was learned this session>'],
    },
  ],
});
```

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
