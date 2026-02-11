---
paths:
  - .claude/skills/database-architect/**
---

# Database Architect Rules

## Core Principles

- Normalize to 3NF unless performance requires denormalization
- Always plan indexes based on query patterns, not speculation
- Use migrations for all schema changes (never manual DDL)
- Document data models and relationships
- Test migrations on production-like data before deploying

## Input Requirements

- Data requirements (entities, relationships, access patterns)
- Expected data volume and growth rate
- Query patterns (read-heavy vs write-heavy)
- Consistency requirements (ACID vs eventual consistency)
- Technology constraints (PostgreSQL, MySQL, MongoDB, etc.)

## Output Standards

### Required Database Design Elements

1. **Schema Design**: Normalized structure (3NF) with primary/foreign keys
2. **Index Strategy**: Indexes based on query patterns
3. **Migration Scripts**: Versioned, reversible migrations
4. **Data Model Documentation**: ER diagrams and relationship explanations
5. **Performance Considerations**: Query optimization and scaling strategies

### Schema Design Standards

**Relational Databases (PostgreSQL, MySQL):**

```sql
-- Normalize to 3NF (Third Normal Form)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    total_amount DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 1:N relationship
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL
);
```

**NoSQL Databases (MongoDB):**

```javascript
// Embed for 1:1 and 1:few relationships
{
  "_id": ObjectId("..."),
  "email": "user@example.com",
  "profile": {
    "name": "John Doe",
    "avatar": "https://..."
  },
  "addresses": [
    { "type": "shipping", "street": "...", "city": "..." },
    { "type": "billing", "street": "...", "city": "..." }
  ]
}

// Reference for 1:many relationships
{
  "_id": ObjectId("..."),
  "user_id": ObjectId("..."),
  "items": [
    { "product_id": ObjectId("..."), "quantity": 2 }
  ]
}
```

## Index Strategy Standards

**Index Planning Rules:**

1. Index columns used in WHERE clauses
2. Index columns used in JOIN conditions
3. Index columns used in ORDER BY clauses
4. Consider composite indexes for multi-column queries
5. Use covering indexes for read-heavy queries

```sql
-- Single-column index for exact match
CREATE INDEX idx_users_email ON users(email);

-- Composite index for multi-column queries
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Partial index for filtered queries
CREATE INDEX idx_active_users ON users(email) WHERE active = true;

-- Covering index (includes all needed columns)
CREATE INDEX idx_orders_covering ON orders(user_id) INCLUDE (status, created_at);
```

**Index Anti-Patterns:**

| Anti-Pattern       | Problem                    | Fix                               |
| ------------------ | -------------------------- | --------------------------------- |
| Index every column | Slows writes, wastes space | Index only queried columns        |
| No indexes         | Slow queries (table scans) | Add indexes on WHERE/JOIN columns |
| Over-indexing      | Write performance penalty  | Remove unused indexes             |
| Wrong index order  | Index not used             | Most selective column first       |

## Migration Standards

**Versioned Migration Pattern:**

```
migrations/
  001_create_users.sql
  002_add_email_index.sql
  003_create_orders.sql
  004_add_order_status_column.sql
```

**Migration Best Practices:**

```sql
-- ✅ GOOD - Includes UP and DOWN
-- UP
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL
);

-- DOWN
DROP TABLE users;

-- ✅ GOOD - Add column with default (non-blocking)
ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';

-- ❌ BAD - Add column without default (locks table)
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL;
```

**Zero-Downtime Migration Pattern:**

```sql
-- Step 1: Add new column (nullable)
ALTER TABLE users ADD COLUMN email_verified BOOLEAN;

-- Step 2: Backfill data (in batches)
UPDATE users SET email_verified = false WHERE email_verified IS NULL;

-- Step 3: Add NOT NULL constraint
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;
```

## Query Optimization Standards

**Use EXPLAIN ANALYZE to profile queries:**

```sql
EXPLAIN ANALYZE
SELECT u.email, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.email;
```

**Optimization Patterns:**

| Pattern               | When to Use                  | Example                                  |
| --------------------- | ---------------------------- | ---------------------------------------- |
| **Index Scan**        | Small result set             | `WHERE id = 'abc'`                       |
| **Bitmap Index Scan** | Medium result set            | `WHERE status IN ('pending', 'shipped')` |
| **Seq Scan**          | Large result set or no index | Full table scan (avoid if possible)      |
| **Covering Index**    | Read-heavy queries           | `INDEX (user_id) INCLUDE (email, name)`  |

**Avoid N+1 Queries:**

```javascript
// ❌ BAD - N+1 query
const users = await db.users.findAll();
for (const user of users) {
  user.orders = await db.orders.findAll({ where: { user_id: user.id } });
}

// ✅ GOOD - Single query with join
const users = await db.users.findAll({
  include: [{ model: db.orders }],
});
```

## Data Modeling Best Practices

### Normalization Levels

| Level       | Description                          | When to Use    |
| ----------- | ------------------------------------ | -------------- |
| **1NF**     | Atomic values, no repeating groups   | Always minimum |
| **2NF**     | No partial dependencies              | Always         |
| **3NF**     | No transitive dependencies           | Default target |
| **BCNF**    | Every determinant is a candidate key | Rarely needed  |
| **4NF/5NF** | Eliminate multi-valued dependencies  | Very rare      |

**When to Denormalize:**

- Proven performance bottleneck (measure first!)
- Read-heavy workloads (10:1 read:write ratio or higher)
- Aggregated data for reporting
- Event sourcing patterns

```sql
-- ❌ BAD - Premature denormalization
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_email VARCHAR(255), -- Duplicates users.email
    user_name VARCHAR(255)    -- Duplicates users.name
);

-- ✅ GOOD - Normalized
CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id)
);

-- ✅ GOOD - Strategic denormalization for reporting
CREATE MATERIALIZED VIEW order_summary AS
SELECT u.email, u.name, COUNT(o.id) as order_count, SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.email, u.name;
```

## Anti-Patterns

| Anti-Pattern                | Problem                  | Fix                                    |
| --------------------------- | ------------------------ | -------------------------------------- |
| No foreign keys             | Data integrity issues    | Add REFERENCES constraints             |
| No indexes                  | Slow queries             | Add indexes on WHERE/JOIN columns      |
| VARCHAR(255) everywhere     | Wastes space             | Use appropriate lengths                |
| Premature denormalization   | Complexity without proof | Normalize first, denormalize with data |
| No migrations               | Schema drift             | Version all schema changes             |
| Direct schema modifications | No rollback              | Always use migrations                  |
| Storing JSON in VARCHAR     | No type safety           | Use JSONB or separate tables           |

## Database-Specific Best Practices

### PostgreSQL

```sql
-- Use SERIAL or UUID for primary keys
CREATE TABLE users (
    id SERIAL PRIMARY KEY,  -- Auto-incrementing
    -- OR
    id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Use JSONB for semi-structured data
CREATE TABLE events (
    id UUID PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_events_data_gin ON events USING gin(data);

-- Use partitioning for large tables
CREATE TABLE logs (
    id BIGSERIAL,
    created_at TIMESTAMP NOT NULL,
    message TEXT
) PARTITION BY RANGE (created_at);
```

### MySQL

```sql
-- Use InnoDB engine (default in MySQL 8+)
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- Use appropriate character sets
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### MongoDB

```javascript
// Define schema validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      required: ['email', 'created_at'],
      properties: {
        email: { bsonType: 'string' },
        created_at: { bsonType: 'date' },
      },
    },
  },
});

// Create indexes for common queries
db.users.createIndex({ email: 1 }, { unique: true });
db.orders.createIndex({ user_id: 1, created_at: -1 });
```

## Testing Checklist

Before finalizing database design, verify:

- [ ] All tables have primary keys
- [ ] Foreign keys enforce referential integrity
- [ ] Indexes planned for WHERE/JOIN/ORDER BY columns
- [ ] Migrations include UP and DOWN scripts
- [ ] Migrations tested on production-like data
- [ ] Query plans analyzed with EXPLAIN ANALYZE
- [ ] N+1 queries eliminated
- [ ] Schema normalized to 3NF (denormalization justified)
- [ ] Data types appropriate (no VARCHAR(255) everywhere)
- [ ] Constraints enforce business rules (CHECK, NOT NULL)
- [ ] Backup and restore procedures documented
- [ ] Connection pooling configured
- [ ] Database monitoring set up

## Iron Law

```
NO SCHEMA CHANGES WITHOUT MIGRATIONS
```

All schema changes must use versioned migrations with rollback capability.

## Integration Points

### Agents Using This Skill

- **database-architect** (primary): Database design and optimization
- **developer** (secondary): Implements schema changes via migrations
- **code-reviewer**: Reviews migration scripts
- **devops**: Executes migrations in production

### Related Skills

- **data-expert**: Data processing and transformation
- **text-to-sql**: Natural language to SQL queries
- **security-architect**: Database security review

### Workflows

- **feature-development-workflow.md**: Database design in Design phase
- **migration-workflow.md**: Schema migration procedures

## Related References

- `.claude/skills/database-architect/SKILL.md` - Complete skill documentation
- `.claude/workflows/database-architect-skill-workflow.md` - Multi-phase workflow
