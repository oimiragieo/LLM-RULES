# Memory Schema Documentation

**Version:** 1.0
**Status:** Production Ready
**Date:** 2026-01-28
**Related Spec:** `.claude/context/artifacts/specs/memory-system-enhancement-spec.md`

---

## Overview

This document describes the SQLite entity schema for Agent Studio's hybrid memory system. The schema tracks entities (agents, tasks, skills, concepts, files, patterns, decisions, issues) and their relationships to enable graph-based queries and relationship-aware reasoning.

**Key Design Principles:**

1. **Files as Source of Truth:** SQLite serves as a performance index, files remain canonical
2. **Entity Relationships:** Graph-like tracking of how entities relate (blocks, depends_on, assigned_to, etc.)
3. **Quality Scoring:** Track utility of entities based on access patterns
4. **Schema Versioning:** Migration tracking for future schema evolution

---

## Schema Version

**Current Version:** 1
**Applied:** Initial entity schema with entities, relationships, and attributes
**Migration Script:** `.claude/tools/cli/init-memory-db.cjs`

---

## Tables

### 1. entities

Primary table for tracking all entity types.

**Purpose:** Store metadata about agents, tasks, skills, concepts, files, patterns, decisions, and issues extracted from memory files.

**Schema:**

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY,                      -- Unique identifier (e.g., "agent-developer-001")
  type TEXT NOT NULL CHECK(type IN (       -- Entity type (enforced via CHECK)
    'agent', 'task', 'skill', 'concept',
    'file', 'pattern', 'decision', 'issue'
  )),
  name TEXT NOT NULL,                       -- Human-readable name
  content TEXT,                             -- Full text content (optional)
  source_file TEXT,                         -- Origin file (learnings.md, decisions.md, etc.)
  line_number INTEGER,                      -- Line number in source file
  created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_accessed TIMESTAMP,                  -- Last time entity was queried
  access_count INTEGER DEFAULT 0,           -- How many times entity has been accessed
  quality_score REAL DEFAULT 0.5 CHECK(quality_score BETWEEN 0 AND 1)  -- Utility score (0-1)
);
```

**Indexes:**

- `idx_entities_type` - Fast lookup by entity type
- `idx_entities_name` - Fast lookup by name (pattern matching)
- `idx_entities_source_file` - Fast lookup by source file
- `idx_entities_created` - Sort by recency (DESC)
- `idx_entities_quality` - Sort by quality score (DESC)

**Entity Types:**

| Type       | Description                      | Example                             |
| ---------- | -------------------------------- | ----------------------------------- |
| `agent`    | Developer, planner, QA, etc.     | "developer-agent"                   |
| `task`     | TaskCreate entries               | "task-123-implement-auth"           |
| `skill`    | Invoked skills                   | "skill-tdd-red-green-refactor"      |
| `concept`  | Abstract ideas                   | "concept-hybrid-memory-architecture |
| `file`     | Key project files                | "file-auth-ts"                      |
| `pattern`  | Reusable solutions               | "pattern-write-ahead-log"           |
| `decision` | ADRs from decisions.md           | "adr-054-memory-enhancement"        |
| `issue`    | Problems/blockers from issues.md | "issue-chromadb-server-startup"     |

**Example Inserts:**

```sql
-- Agent entity
INSERT INTO entities (id, type, name, content, source_file)
VALUES (
  'agent-developer-001',
  'agent',
  'Developer Agent',
  'TDD-focused implementer. Writes code, runs tests, and refactors.',
  '.claude/agents/core/developer.md'
);

-- Task entity
INSERT INTO entities (id, type, name, source_file, line_number)
VALUES (
  'task-123',
  'task',
  'P1-1.1: Install ChromaDB',
  '.claude/context/memory/learnings.md',
  145
);

-- Concept entity
INSERT INTO entities (id, type, name, quality_score)
VALUES (
  'concept-hybrid-memory',
  'concept',
  'Hybrid Memory Architecture',
  0.85  -- High quality (frequently accessed, proven useful)
);
```

---

### 2. entity_relationships

Tracks relationships between entities (graph edges).

**Purpose:** Enable graph queries like "What tasks are blocked?" or "What skills does developer agent use?"

**Schema:**

```sql
CREATE TABLE entity_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_entity_id TEXT NOT NULL,              -- Source entity
  to_entity_id TEXT NOT NULL,                -- Target entity
  relationship_type TEXT NOT NULL CHECK(relationship_type IN (
    'relates_to', 'blocks', 'blocked_by', 'implements',
    'conflicts_with', 'assigned_to', 'depends_on', 'supersedes',
    'references', 'resolves'
  )),
  weight REAL DEFAULT 1.0 CHECK(weight BETWEEN 0 AND 1),  -- Strength of relationship
  metadata JSON,                             -- Additional context (optional)
  created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  CHECK (from_entity_id != to_entity_id)     -- No self-references
);
```

**Indexes:**

- `idx_relationships_from` - Fast lookup by source entity
- `idx_relationships_to` - Fast lookup by target entity
- `idx_relationships_type` - Fast lookup by relationship type

**Relationship Types:**

| Type             | Description                    | Example                                         |
| ---------------- | ------------------------------ | ----------------------------------------------- |
| `relates_to`     | Generic association            | concept-auth `relates_to` pattern-jwt           |
| `blocks`         | Task dependency (blocking)     | task-22 `blocks` task-23                        |
| `blocked_by`     | Task dependency (inverse)      | task-23 `blocked_by` task-22                    |
| `implements`     | Implementation relationship    | pattern-wal `implements` decision-memory-sync   |
| `conflicts_with` | Conflicting decisions/patterns | decision-054 `conflicts_with` decision-002      |
| `assigned_to`    | Task to agent assignment       | task-25 `assigned_to` agent-developer           |
| `depends_on`     | Code/feature dependency        | file-auth-ts `depends_on` concept-jwt           |
| `supersedes`     | Replacement relationship       | decision-054 `supersedes` decision-053          |
| `references`     | Citation/mention               | decision-054 `references` concept-hybrid-memory |
| `resolves`       | Issue resolution               | task-25 `resolves` issue-schema-missing         |

**Example Inserts:**

```sql
-- Task assignment
INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, weight)
VALUES ('task-25', 'agent-developer', 'assigned_to', 1.0);

-- Task dependency
INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type)
VALUES ('task-26', 'task-25', 'blocked_by');

-- Concept reference
INSERT INTO entity_relationships (from_entity_id, to_entity_id, relationship_type, metadata)
VALUES (
  'decision-054',
  'concept-hybrid-memory',
  'implements',
  '{"section": "Phase 1", "confidence": 0.95}'
);
```

---

### 3. entity_attributes

Key-value attributes for flexible entity metadata.

**Purpose:** Store additional properties without schema changes (e.g., agent model, task complexity, file LOC).

**Schema:**

```sql
CREATE TABLE entity_attributes (
  entity_id TEXT NOT NULL,
  attribute_key TEXT NOT NULL,
  attribute_value TEXT,
  created_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  PRIMARY KEY (entity_id, attribute_key)
);
```

**Example Inserts:**

```sql
-- Agent attributes
INSERT INTO entity_attributes (entity_id, attribute_key, attribute_value)
VALUES
  ('agent-developer', 'model', 'sonnet'),
  ('agent-developer', 'temperature', '0.3'),
  ('agent-developer', 'priority', 'high');

-- Task attributes
INSERT INTO entity_attributes (entity_id, attribute_key, attribute_value)
VALUES
  ('task-25', 'complexity', 'MEDIUM'),
  ('task-25', 'estimated_hours', '4'),
  ('task-25', 'actual_hours', '5');

-- File attributes
INSERT INTO entity_attributes (entity_id, attribute_key, attribute_value)
VALUES
  ('file-auth-ts', 'loc', '342'),
  ('file-auth-ts', 'language', 'typescript');
```

---

### 4. schema_version

Tracks schema migrations for version control.

**Purpose:** Enable safe schema evolution over time.

**Schema:**

```sql
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  description TEXT
);
```

**Current Version:**

```sql
INSERT INTO schema_version (version, description)
VALUES (1, 'Initial entity schema with entities, relationships, and attributes');
```

**Future Migrations:**

When adding new features (e.g., embedding vectors, event history), create migration scripts:

```bash
node .claude/tools/cli/migrate-memory-v2.cjs  # Hypothetical future migration
```

---

## Queries

### Common Query Patterns

#### 1. Find All Tasks Assigned to an Agent

```sql
SELECT e.*
FROM entities e
JOIN entity_relationships r ON e.id = r.from_entity_id
WHERE r.to_entity_id = 'agent-developer'
  AND r.relationship_type = 'assigned_to'
  AND e.type = 'task';
```

#### 2. Find All Blocked Tasks

```sql
SELECT e.id, e.name, GROUP_CONCAT(r.to_entity_id) AS blocked_by_tasks
FROM entities e
JOIN entity_relationships r ON e.id = r.from_entity_id
WHERE e.type = 'task'
  AND r.relationship_type = 'blocked_by'
GROUP BY e.id;
```

#### 3. Find Related Concepts (Graph Traversal)

```sql
-- Direct relations
SELECT DISTINCT e2.*
FROM entities e1
JOIN entity_relationships r ON e1.id = r.from_entity_id
JOIN entities e2 ON r.to_entity_id = e2.id
WHERE e1.id = 'concept-hybrid-memory'
  AND r.relationship_type = 'relates_to';

-- Two-hop traversal (concept → pattern → file)
WITH RECURSIVE related AS (
  SELECT to_entity_id AS entity_id, 1 AS depth
  FROM entity_relationships
  WHERE from_entity_id = 'concept-hybrid-memory'
    AND relationship_type IN ('implements', 'relates_to')

  UNION ALL

  SELECT r.to_entity_id, related.depth + 1
  FROM entity_relationships r
  JOIN related ON r.from_entity_id = related.entity_id
  WHERE related.depth < 2
)
SELECT DISTINCT e.*
FROM entities e
JOIN related ON e.id = related.entity_id;
```

#### 4. Find High-Quality Entities by Type

```sql
SELECT *
FROM entities
WHERE type = 'pattern'
  AND quality_score > 0.7
ORDER BY quality_score DESC, access_count DESC
LIMIT 10;
```

#### 5. Find Recently Updated Entities

```sql
SELECT *
FROM entities
WHERE updated_at > datetime('now', '-7 days')
ORDER BY updated_at DESC;
```

---

## Maintenance

### Updating Quality Scores

Quality scores should be updated based on access patterns:

```sql
-- Increment access count and update quality score
UPDATE entities
SET
  access_count = access_count + 1,
  last_accessed = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  quality_score = MIN(1.0, quality_score + 0.01)  -- Increase slightly
WHERE id = 'entity-id';
```

### Pruning Low-Quality Entities

Periodically remove entities that are never accessed:

```sql
-- Find candidates for pruning (not accessed in 90 days, low quality)
SELECT id, name, type, last_accessed, quality_score
FROM entities
WHERE (last_accessed IS NULL OR last_accessed < datetime('now', '-90 days'))
  AND quality_score < 0.3
  AND access_count < 5;

-- Archive before deletion (export to JSON)
-- Then delete
DELETE FROM entities
WHERE id IN (/* candidate IDs */);
```

### Reconciliation with Files

Periodically verify entities match source files:

```bash
node .claude/tools/cli/reconcile-entities.cjs  # Hypothetical future tool
```

---

## Migration Guide

### Initializing Schema

```bash
# Default path (.claude/data/memory.db)
node .claude/tools/cli/init-memory-db.cjs

# Custom path
node .claude/tools/cli/init-memory-db.cjs --db-path ./custom-memory.db
```

### Verifying Schema

```bash
# Check tables
sqlite3 .claude/data/memory.db ".tables"

# Check schema version
sqlite3 .claude/data/memory.db "SELECT * FROM schema_version;"

# Check indexes
sqlite3 .claude/data/memory.db "SELECT name FROM sqlite_master WHERE type='index';"
```

### Backup and Restore

```bash
# Backup
sqlite3 .claude/data/memory.db ".backup backup-$(date +%Y%m%d).db"

# Restore
cp backup-20260128.db .claude/data/memory.db
```

---

## Performance

### Index Usage

All queries in this document are optimized with indexes:

- Entity type lookups: `idx_entities_type` (O(log n))
- Name searches: `idx_entities_name` (O(log n) + LIKE scan)
- Relationship traversal: `idx_relationships_from`, `idx_relationships_to` (O(log n))

### Write-Ahead Logging (WAL)

Schema uses `journal_mode = WAL` for better concurrency:

- Readers don't block writers
- Writers don't block readers
- ~10-20% write performance improvement

### Disk Usage

Estimated disk usage (based on 10,000 entities):

- Entities: ~5MB
- Relationships: ~3MB
- Attributes: ~1MB
- Indexes: ~1MB
- **Total:** ~10MB

---

## Testing

### Unit Tests

Run unit tests for schema creation:

```bash
node --test tests/unit/memory/schema-creation.test.mjs
```

**Coverage:**

- Table structure validation (11 columns × 4 tables)
- Index creation (8 indexes)
- Constraint enforcement (PRIMARY KEY, FOREIGN KEY, CHECK)
- Default values (timestamps, access_count, quality_score, weight)
- Idempotency (re-running migration doesn't duplicate)

### Integration Tests

Integration tests (Task #29) will verify:

- Entity extraction from learnings.md, decisions.md, issues.md
- Relationship building from task metadata
- Query performance benchmarks

---

## Related Documentation

- **Specification:** `.claude/context/artifacts/specs/memory-system-enhancement-spec.md` (Section 6.3)
- **Implementation Plan:** `.claude/context/artifacts/plans/p1-detailed-implementation-plan.md` (Week 2)
- **ADR:** `.claude/context/memory/decisions.md` (ADR-054: Memory System Enhancement Strategy)

---

## Future Enhancements

### Phase 2 (P2)

- **Embedding Vectors:** Store entity embeddings for semantic similarity
- **Event History:** Track entity lifecycle events (created, updated, accessed)
- **Temporal Queries:** Query entities by time windows (last week, last month)

### Phase 3 (P3)

- **Multi-Graph:** Separate working/episodic/semantic memory graphs (MAGMA-style)
- **Graph Analytics:** PageRank-style importance scoring
- **Auto-Pruning:** Machine learning-based entity quality prediction

---

**Document Version:** 1.0
**Last Updated:** 2026-01-28
**Maintained By:** Developer Agent (Task #25)
