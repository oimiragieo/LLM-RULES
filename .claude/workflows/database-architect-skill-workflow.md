---
name: database-architect-workflow
description: Multi-agent database design, migration planning, and optimization workflow
version: 1.0.0
agents: [database-architect, developer, qa, security-architect, architect]
phases: 5
triggers:
  - new database design
  - schema changes
  - database migration
  - query optimization
  - data modeling
complexity: medium-to-high
estimated_duration: 2-5 days
---

# Database Architect Workflow

Multi-agent orchestration for database design, schema changes, and migration planning with built-in security review and rollback procedures.

**Extended Thinking**: This workflow orchestrates specialized agents through comprehensive database design phases - from requirements gathering and schema design through query optimization, migration planning, and validation. Each phase builds on previous outputs with parallel agent spawning for design and security review. The workflow supports multiple database types (SQL, NoSQL, cloud), complexity levels, and ensures safe migrations with complete rollback procedures.

## Overview

This workflow coordinates multiple agents to deliver:

- **Validated database schemas** with proper normalization
- **Entity-Relationship Diagrams (ERD)** for documentation
- **Optimized query patterns** with index strategies
- **Safe migration scripts** with rollback procedures
- **Test data generators** and validation suites

## When to Use

| Scenario                    | Complexity | This Workflow?              |
| --------------------------- | ---------- | --------------------------- |
| New application database    | High       | Yes                         |
| Major schema refactoring    | High       | Yes                         |
| Performance optimization    | Medium     | Yes                         |
| Adding new tables/relations | Medium     | Yes                         |
| Simple column addition      | Low        | No (use developer directly) |
| Index-only changes          | Low        | No (use developer directly) |

## Configuration Options

### Database Type

- **postgresql**: Full-featured relational (default)
- **mysql**: MySQL/MariaDB
- **sqlite**: Embedded/local-first
- **mongodb**: Document store
- **multi**: Polyglot persistence (multiple databases)

### Migration Strategy

- **online**: Zero-downtime, backward-compatible migrations
- **offline**: Maintenance window required
- **blue-green**: Parallel database deployment
- **expand-contract**: Gradual schema evolution

### Complexity Level

- **simple**: Single service, < 10 tables (1-2 days)
- **medium**: Multiple services, 10-50 tables (3-5 days)
- **complex**: Cross-domain, 50+ tables, sharding (1-2 weeks)

---

## Phase 1: Requirements Analysis

**Goal**: Gather data requirements, access patterns, and constraints.

### Step 1.1: Business Requirements Analysis

**Agent**: Planner

**Task Spawn**:

```javascript
Task({
  task_id: 'task-1',
  subagent_type: 'developer',
  description: 'Database requirements analysis',
  prompt: `You are the PLANNER agent.

## Task
Analyze data requirements for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/planner.md
2. **Invoke skill**: Skill({ skill: "plan-generator" })
3. Identify data entities, relationships, and access patterns
4. Document data volume estimates and growth projections
5. List compliance requirements (GDPR, HIPAA, SOC2, etc.)
6. Identify performance SLAs (latency, throughput)
7. Save output to: .claude/context/plans/database-$PROJECT_NAME-requirements.md

## Context
- Project description: $ARGUMENTS
- Expected scale: $EXPECTED_SCALE
- Compliance requirements: $COMPLIANCE

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record decisions to .claude/context/memory/decisions.md
`,
});
```

**Expected Output**: Requirements document with entities, access patterns, volume estimates, compliance needs

### Step 1.2: Existing Schema Analysis (if applicable)

**Agent**: Database Architect

**Task Spawn**:

```javascript
Task({
  task_id: 'task-2',
  subagent_type: 'developer',
  description: 'Existing schema analysis',
  prompt: `You are the DATABASE-ARCHITECT agent.

## Task
Analyze existing database schema for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/database-architect.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "sequential-thinking" })
3. Review existing schema files, migrations, and queries
4. Identify normalization issues, missing indexes, constraint gaps
5. Document current data model strengths and weaknesses
6. Map current schema to new requirements from Step 1.1
7. Save analysis to: .claude/context/reports/backend/database-$PROJECT_NAME-current-analysis.md

## Context
- Current schema location: $SCHEMA_LOCATION
- Requirements from Step 1.1

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Current schema analysis with improvement recommendations

---

## Phase 2: Schema Design

**Goal**: Create normalized schema with proper relationships and constraints.

### Step 2.1: Logical Data Model Design

**Agent**: Database Architect + Architect (Parallel)

**Task Spawn** (Parallel Execution):

```javascript
// BOTH in same message for parallel execution

// Database Architect - Schema Design
Task({
  task_id: 'task-3',
  subagent_type: 'developer',
  description: 'Logical data model design',
  prompt: `You are the DATABASE-ARCHITECT agent.

## Task
Design logical data model for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/database-architect.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "diagram-generator" })
   - Skill({ skill: "sequential-thinking" })
3. Review requirements: .claude/context/plans/database-$PROJECT_NAME-requirements.md
4. Define entities, attributes, and relationships
5. Apply normalization (target 3NF, document any denormalization)
6. Define primary keys, foreign keys, and unique constraints
7. Design indexes based on access patterns
8. Generate ERD diagram using Mermaid
9. Save schema to: .claude/context/artifacts/database/schemas/$PROJECT_NAME-schema.sql
10. Save ERD to: .claude/context/artifacts/database/diagrams/$PROJECT_NAME-erd.md

## Context
- Requirements from Phase 1
- Database type: $DATABASE_TYPE (default: postgresql)
- Expected tables: $TABLE_COUNT

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record schema decisions to .claude/context/memory/decisions.md
`,
});

// Security Architect - Data Security Review
Task({
  task_id: 'task-4',
  subagent_type: 'developer',
  model: 'opus',
  description: 'Data security and compliance review',
  prompt: `You are the SECURITY-ARCHITECT agent.

## Task
Review data security requirements for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/security-architect.md
2. **Invoke skill**: Skill({ skill: "security-architect" })
3. Review requirements: .claude/context/plans/database-$PROJECT_NAME-requirements.md
4. Identify sensitive data fields (PII, PHI, financial)
5. Recommend encryption strategy (at-rest, in-transit, field-level)
6. Define access control requirements (row-level security, roles)
7. Document audit trail requirements
8. Verify compliance alignment (GDPR, HIPAA, SOC2)
9. Save security requirements to: .claude/context/reports/security/database-$PROJECT_NAME-security-requirements.md

## Context
- Requirements from Phase 1
- Compliance requirements: $COMPLIANCE

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record security findings to .claude/context/memory/issues.md
`,
});
```

**Expected Output**:

- Logical data model with normalized schema
- ERD diagram
- Security requirements and encryption strategy

### Step 2.2: Physical Schema Implementation

**Agent**: Database Architect

**Task Spawn**:

```javascript
Task({
  task_id: 'task-5',
  subagent_type: 'developer',
  description: 'Physical schema implementation',
  prompt: `You are the DATABASE-ARCHITECT agent.

## Task
Implement physical database schema for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/database-architect.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "doc-generator" })
3. Review logical model from Step 2.1
4. Incorporate security requirements from security review
5. Create complete SQL schema with:
   - Tables with appropriate data types
   - Primary and foreign key constraints
   - Check constraints for business rules
   - Indexes for query optimization
   - Encryption for sensitive fields
   - Row-level security policies (if needed)
   - Comments on all tables and columns
6. Generate comprehensive schema documentation
7. Save schema to: .claude/context/artifacts/database/schemas/$PROJECT_NAME-schema.sql
8. Save docs to: .claude/context/artifacts/database/docs/$PROJECT_NAME-schema-docs.md

## Context
- Logical model from Step 2.1
- Security requirements from Step 2.1
- Database type: $DATABASE_TYPE

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Complete physical schema with constraints, indexes, encryption, and documentation

---

## Phase 3: Query Optimization

**Goal**: Design efficient query patterns and index strategy.

### Step 3.1: Query Pattern Analysis

**Agent**: Database Architect

**Task Spawn**:

```javascript
Task({
  task_id: 'task-6',
  subagent_type: 'developer',
  description: 'Query pattern analysis and optimization',
  prompt: `You are the DATABASE-ARCHITECT agent.

## Task
Analyze and optimize query patterns for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/database-architect.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "text-to-sql" })
   - Skill({ skill: "sequential-thinking" })
3. Review access patterns from requirements
4. Design common queries for each access pattern
5. Analyze query execution plans (EXPLAIN)
6. Identify potential N+1 problems and batch solutions
7. Recommend index strategy:
   - B-tree indexes for equality/range queries
   - Hash indexes for equality-only queries
   - GIN/GiST for full-text and JSON
   - Composite indexes for multi-column queries
   - Partial indexes for filtered queries
8. Document query patterns and expected performance
9. Save analysis to: .claude/context/reports/backend/database-$PROJECT_NAME-query-optimization.md

## Context
- Schema from Phase 2
- Access patterns from requirements

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record optimization patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Query optimization report with index strategy and expected performance

### Step 3.2: Performance Benchmarking Setup

**Agent**: Developer

**Task Spawn**:

```javascript
Task({
  task_id: 'task-7',
  subagent_type: 'developer',
  description: 'Performance benchmarking setup',
  prompt: `You are the DEVELOPER agent.

## Task
Set up database performance benchmarks for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "tdd" })
3. Review query patterns from Step 3.1
4. Create benchmark scripts for:
   - Common read queries (SELECT, JOIN, aggregate)
   - Write operations (INSERT, UPDATE, DELETE)
   - Batch operations
   - Concurrent access scenarios
5. Define performance baselines and SLAs
6. Set up monitoring queries (pg_stat_statements, slow query log)
7. Save benchmarks to: .claude/context/artifacts/database/benchmarks/$PROJECT_NAME/

## Context
- Schema from Phase 2
- Query patterns from Step 3.1
- Performance SLAs: $PERFORMANCE_SLAS

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record benchmarking patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Benchmark scripts with baseline metrics and monitoring setup

---

## Phase 4: Migration Planning

**Goal**: Plan safe, reversible migrations with rollback procedures.

### Step 4.1: Migration Script Generation

**Agent**: Database Architect

**Task Spawn**:

```javascript
Task({
  task_id: 'task-8',
  subagent_type: 'developer',
  description: 'Migration script generation',
  prompt: `You are the DATABASE-ARCHITECT agent.

## Task
Generate migration scripts for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/database-architect.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "sequential-thinking" })
3. Compare current schema (if exists) with target schema
4. Generate migration scripts following expand-contract pattern:
   - Phase 1: ADD (new columns, tables - nullable/defaults)
   - Phase 2: MIGRATE (backfill data, update application)
   - Phase 3: CONTRACT (remove old columns, add constraints)
5. Each migration MUST include:
   - UP migration (forward)
   - DOWN migration (rollback)
   - Pre-migration validation checks
   - Post-migration validation checks
   - Estimated execution time
6. Use transactions where supported
7. Save migrations to: .claude/context/artifacts/database/migrations/$PROJECT_NAME/

## Migration Naming Convention
[YYYYMMDD_HHMMSS]_[description].sql

## Context
- Target schema from Phase 2
- Current schema (if exists) from Phase 1
- Migration strategy: $MIGRATION_STRATEGY

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record migration patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Versioned migration scripts with UP/DOWN and validation checks

### Step 4.2: Rollback Procedures

**Agent**: Database Architect + DevOps (Parallel)

**Task Spawn** (Parallel Execution):

```javascript
// BOTH in same message for parallel execution

// Database Architect - Rollback Scripts
Task({
  task_id: 'task-9',
  subagent_type: 'developer',
  description: 'Rollback procedure documentation',
  prompt: `You are the DATABASE-ARCHITECT agent.

## Task
Document rollback procedures for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/database-architect.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "doc-generator" })
3. Review migrations from Step 4.1
4. Document rollback procedure for EACH migration:
   - Pre-rollback validation (ensure data integrity)
   - Rollback script execution
   - Post-rollback validation
   - Application compatibility check
5. Create emergency rollback runbook:
   - Decision criteria for rollback
   - Step-by-step rollback instructions
   - Data recovery procedures
   - Communication templates
6. Save runbook to: .claude/context/runbooks/database-$PROJECT_NAME-rollback.md

## Context
- Migrations from Step 4.1

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record rollback patterns to .claude/context/memory/learnings.md
`,
});

// DevOps - Deployment Pipeline
Task({
  task_id: 'task-10',
  subagent_type: 'developer',
  description: 'Migration deployment pipeline',
  prompt: `You are the DEVOPS agent.

## Task
Set up migration deployment pipeline for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/specialized/devops.md
2. **Invoke skill**: Skill({ skill: "ci-cd-implementation-rule" })
3. Review migrations from Step 4.1
4. Create CI/CD pipeline for migrations:
   - Test migrations on staging environment
   - Pre-deployment backup
   - Migration execution with monitoring
   - Post-migration validation
   - Automatic rollback on failure
5. Set up migration monitoring and alerts
6. Save pipeline config to: .claude/context/artifacts/database/pipelines/$PROJECT_NAME-migration-pipeline.yaml

## Context
- Migrations from Step 4.1
- Migration strategy: $MIGRATION_STRATEGY
- Environment: $TARGET_ENVIRONMENT

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record deployment patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**:

- Comprehensive rollback runbook
- CI/CD pipeline for safe migration deployment

---

## Phase 5: Testing & Validation

**Goal**: Validate schema, migrations, and performance.

### Step 5.1: Schema Validation Tests

**Agent**: QA

**Task Spawn**:

```javascript
Task({
  task_id: 'task-11',
  subagent_type: 'developer',
  description: 'Database schema validation tests',
  prompt: `You are the QA agent.

## Task
Create database validation tests for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/qa.md
2. **Invoke skill**: Skill({ skill: "tdd" })
3. Review schema from Phase 2
4. Create test suites for:
   - Schema validation (tables, columns, constraints exist)
   - Constraint enforcement (FK, unique, check)
   - Index existence and usage
   - Data type validation
   - Trigger behavior (if any)
5. Create data integrity tests:
   - Referential integrity
   - Cascade delete/update behavior
   - Null handling
6. Save tests to: .claude/context/artifacts/database/tests/$PROJECT_NAME/

## Context
- Schema from Phase 2
- Migrations from Phase 4

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record testing patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Comprehensive database test suites

### Step 5.2: Test Data Generation

**Agent**: Developer

**Task Spawn**:

```javascript
Task({
  task_id: 'task-12',
  subagent_type: 'developer',
  description: 'Test data generation',
  prompt: `You are the DEVELOPER agent.

## Task
Generate test data for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/developer.md
2. **Invoke skills**:
   - Skill({ skill: "database-expert" })
   - Skill({ skill: "tdd" })
3. Review schema from Phase 2
4. Create test data generators:
   - Seed data for development
   - Fixture data for unit tests
   - Load test data (realistic volume)
   - Edge case data (nulls, max lengths, special chars)
5. Ensure referential integrity in generated data
6. Create data cleanup scripts
7. Save generators to: .claude/context/artifacts/database/seeds/$PROJECT_NAME/

## Context
- Schema from Phase 2
- Expected data volume: $EXPECTED_VOLUME

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record data generation patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Test data generators and seed scripts

### Step 5.3: Migration Testing

**Agent**: QA

**Task Spawn**:

```javascript
Task({
  task_id: 'task-13',
  subagent_type: 'developer',
  description: 'Migration testing and validation',
  prompt: `You are the QA agent.

## Task
Test database migrations for: $PROJECT_NAME

## Instructions
1. Read your agent definition: .claude/agents/core/qa.md
2. **Invoke skill**: Skill({ skill: "tdd" })
3. Review migrations from Phase 4
4. Test each migration:
   - UP migration succeeds
   - DOWN migration succeeds (rollback)
   - UP -> DOWN -> UP cycle works
   - Data integrity preserved
   - Performance acceptable
5. Test migration failure scenarios:
   - Interrupted migration recovery
   - Partial migration state
   - Concurrent migration attempt
6. Document test results
7. Save test report to: .claude/context/reports/qa/database-$PROJECT_NAME-migration-tests.md

## Context
- Migrations from Phase 4
- Test data from Step 5.2

## Memory Protocol
1. Read .claude/context/memory/learnings.md first
2. Record migration testing patterns to .claude/context/memory/learnings.md
`,
});
```

**Expected Output**: Migration test report with pass/fail status

---

## Deliverables

Upon workflow completion, the following artifacts will be available:

### Documentation

| Artifact              | Location                                                                           |
| --------------------- | ---------------------------------------------------------------------------------- |
| Requirements          | `.claude/context/plans/database-$PROJECT_NAME-requirements.md`                     |
| Current Analysis      | `.claude/context/reports/backend/database-$PROJECT_NAME-current-analysis.md`       |
| Security Requirements | `.claude/context/reports/security/database-$PROJECT_NAME-security-requirements.md` |
| Query Optimization    | `.claude/context/reports/backend/database-$PROJECT_NAME-query-optimization.md`     |
| Migration Test Report | `.claude/context/reports/qa/database-$PROJECT_NAME-migration-tests.md`             |

### Schema Artifacts

| Artifact             | Location                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| SQL Schema           | `.claude/context/artifacts/database/schemas/$PROJECT_NAME-schema.sql`  |
| ERD Diagram          | `.claude/context/artifacts/database/diagrams/$PROJECT_NAME-erd.md`     |
| Schema Documentation | `.claude/context/artifacts/database/docs/$PROJECT_NAME-schema-docs.md` |

### Migration Artifacts

| Artifact           | Location                                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| Migration Scripts  | `.claude/context/artifacts/database/migrations/$PROJECT_NAME/`                       |
| Rollback Runbook   | `.claude/context/runbooks/database-$PROJECT_NAME-rollback.md`                        |
| Migration Pipeline | `.claude/context/artifacts/database/pipelines/$PROJECT_NAME-migration-pipeline.yaml` |

### Testing Artifacts

| Artifact             | Location                                                       |
| -------------------- | -------------------------------------------------------------- |
| Schema Tests         | `.claude/context/artifacts/database/tests/$PROJECT_NAME/`      |
| Test Data Generators | `.claude/context/artifacts/database/seeds/$PROJECT_NAME/`      |
| Benchmarks           | `.claude/context/artifacts/database/benchmarks/$PROJECT_NAME/` |

---

## Rollback Procedures

### Pre-Migration Checklist

- [ ] Full database backup completed
- [ ] Backup verified (test restore)
- [ ] Rollback scripts tested on staging
- [ ] Application compatible with both schemas
- [ ] Monitoring and alerts configured
- [ ] Communication plan ready

### Rollback Decision Matrix

| Scenario                    | Action                                | Time Estimate |
| --------------------------- | ------------------------------------- | ------------- |
| Migration script error      | Execute DOWN migration                | < 5 min       |
| Data integrity violation    | Restore from backup                   | 15-60 min     |
| Performance degradation     | Execute DOWN migration                | < 5 min       |
| Application incompatibility | Execute DOWN migration + app rollback | 10-30 min     |
| Unknown data corruption     | Restore from backup                   | 15-60 min     |

### Emergency Rollback Steps

1. **STOP** - Halt all writes to database
2. **ASSESS** - Identify the specific failure
3. **DECIDE** - Rollback script or backup restore?
4. **EXECUTE** - Run rollback with monitoring
5. **VALIDATE** - Verify data integrity
6. **RESTORE** - Re-enable writes
7. **COMMUNICATE** - Notify stakeholders
8. **POSTMORTEM** - Document and learn

### Point-in-Time Recovery

For databases supporting PITR (PostgreSQL, MySQL):

```sql
-- PostgreSQL example
-- Identify target timestamp
SELECT pg_current_wal_lsn();

-- Recover to specific point
-- (Requires WAL archiving and pg_basebackup)
recovery_target_time = '2026-01-25 14:30:00'
```

---

## Execution Parameters

### Required Parameters

- **--project**: Project name
- **--database-type**: Database technology (postgresql|mysql|sqlite|mongodb|multi)

### Optional Parameters

- **--migration-strategy**: Migration approach (online|offline|blue-green|expand-contract) [default: online]
- **--complexity**: Schema complexity (simple|medium|complex) [default: medium]
- **--compliance**: Compliance requirements (gdpr|hipaa|soc2|pci|none) [default: none]
- **--expected-scale**: Expected data volume (small|medium|large|xlarge) [default: medium]
- **--performance-slas**: Performance requirements [default: <100ms read, <200ms write]
- **--target-environment**: Deployment target (development|staging|production) [default: staging]

---

## Success Criteria

- [ ] All entities from requirements captured in schema
- [ ] Schema normalized to 3NF (denormalization documented)
- [ ] ERD diagram generated and accurate
- [ ] All migrations have UP and DOWN scripts
- [ ] Rollback procedures tested and documented
- [ ] Security requirements implemented (encryption, access control)
- [ ] Query performance meets SLAs
- [ ] All validation tests pass
- [ ] Migration tests pass (UP/DOWN/UP cycle)
- [ ] Test data generators working
- [ ] Documentation complete

---

## Usage Example

```javascript
// Router spawning workflow orchestrator
Task({
  task_id: 'task-14',
  subagent_type: 'developer',
  description: 'Orchestrating database design workflow',
  prompt: `Execute database architect workflow.

## Parameters
- Project: e-commerce-platform
- Database Type: postgresql
- Migration Strategy: online
- Complexity: medium
- Compliance: gdpr, pci
- Expected Scale: large
- Performance SLAs: <50ms read, <100ms write

## Instructions
Follow the phased workflow in: .claude/workflows/database-architect-skill-workflow.md

Execute each phase sequentially, spawning appropriate agents with correct skills.
Ensure parallel spawning where indicated (Phase 2.1, Phase 4.2).
`,
});
```

---

## Related Skill

This workflow implements the structured process for the corresponding skill:

- **Skill**: `.claude/skills/database-architect/SKILL.md`
- **Invoke skill**: `Skill({ skill: "database-architect" })`
- **Relationship**: Workflow provides multi-agent orchestration; skill provides core capabilities

## Agent-Skill Mapping Reference

| Phase                  | Agent              | Required Skills                                         |
| ---------------------- | ------------------ | ------------------------------------------------------- |
| 1.1 Requirements       | planner            | plan-generator                                          |
| 1.2 Current Analysis   | database-architect | database-expert, sequential-thinking                    |
| 2.1 Logical Model      | database-architect | database-expert, diagram-generator, sequential-thinking |
| 2.1 Security Review    | security-architect | security-architect                                      |
| 2.2 Physical Schema    | database-architect | database-expert, doc-generator                          |
| 3.1 Query Optimization | database-architect | database-expert, text-to-sql, sequential-thinking       |
| 3.2 Benchmarking       | developer          | database-expert, tdd                                    |
| 4.1 Migration Scripts  | database-architect | database-expert, sequential-thinking                    |
| 4.2 Rollback Docs      | database-architect | database-expert, doc-generator                          |
| 4.2 Deploy Pipeline    | devops             | ci-cd-implementation-rule                               |
| 5.1 Schema Tests       | qa                 | tdd                                                     |
| 5.2 Test Data          | developer          | database-expert, tdd                                    |
| 5.3 Migration Tests    | qa                 | tdd                                                     |

---

## Notes

- This workflow integrates with the Task tracking system for multi-phase coordination
- All agents follow Memory Protocol (read learnings.md, write to memory files)
- Agents use Skill() tool to invoke specialized capabilities
- Each phase builds on previous outputs via saved artifacts in .claude/context/
- Parallel agent spawning used in Phase 2.1 and Phase 4.2 for efficiency
- Always test rollback procedures before production deployment
