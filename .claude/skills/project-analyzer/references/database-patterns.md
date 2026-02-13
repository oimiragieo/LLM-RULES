# Database Detection Patterns

> Source: Auto-Claude analysis framework (database_detector.py)

## Overview

This document contains patterns for detecting database models and schemas across different ORMs. Use these patterns to identify data models, tables, fields, and database technology choices in a codebase.

## Supported ORMs

| ORM        | Language              | Configuration Files        |
| ---------- | --------------------- | -------------------------- |
| SQLAlchemy | Python                | Any .py with Base class    |
| Django ORM | Python                | models.py, models/\*.py    |
| Prisma     | Node.js/Python        | prisma/schema.prisma       |
| TypeORM    | TypeScript            | _.entity.ts, entities/_.ts |
| Drizzle    | TypeScript            | schema.ts, db/schema.ts    |
| Mongoose   | JavaScript/TypeScript | models/_.js, models/_.ts   |

## SQLAlchemy Detection

### File Pattern

All `.py` files in the project.

### Class Pattern

```regex
class\s+(\w+)\([^)]*(?:Base|db\.Model|DeclarativeBase)[^)]*\):
```

Matches classes inheriting from:

- `Base` (common SQLAlchemy pattern)
- `db.Model` (Flask-SQLAlchemy)
- `DeclarativeBase` (SQLAlchemy 2.0+)

### Table Name Detection

```regex
__tablename__\s*=\s*["\'](\w+)["\']
```

Default table name if not specified: model_name.lower() + "s"

### Column Detection

```regex
(\w+)\s*=\s*Column\((.*?)\)
```

**Field Properties:**
| Pattern | Property |
|---------|----------|
| `primary_key=True` | Primary key |
| `unique=True` | Unique constraint |
| `nullable=False` | NOT NULL |

**Type Detection:**

```regex
(Integer|String|Text|Boolean|DateTime|Float|JSON)
```

### Example

```python
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False)
    name = Column(String(100))
    created_at = Column(DateTime)
```

## Django ORM Detection

### File Patterns

- `**/models.py`
- `**/models/*.py`

### Class Pattern

```regex
class\s+(\w+)\(models\.Model\):
```

### Field Detection

```regex
(\w+)\s*=\s*models\.(\w+Field)\((.*?)\)
```

**Field Properties:**
| Pattern | Property |
|---------|----------|
| `unique=True` | Unique constraint |
| `null=True` | Nullable |

### Example

```python
class User(models.Model):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
```

## Prisma Detection

### File Pattern

`prisma/schema.prisma`

### Model Pattern

```regex
model\s+(\w+)\s*\{([^}]+)\}
```

### Field Pattern

```regex
(\w+)\s+(\w+)([^/\n]*)
```

**Field Properties:**
| Pattern | Property |
|---------|----------|
| `@id` | Primary key |
| `@unique` | Unique constraint |
| `?` in type | Nullable (optional) |

### Example

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  posts     Post[]
}
```

## TypeORM Detection

### File Patterns

- `**/*.entity.ts`
- `**/entities/*.ts`

### Entity Pattern

```regex
@Entity\([^)]*\)\s*(?:export\s+)?class\s+(\w+)
```

### Column Pattern

```regex
@(PrimaryGeneratedColumn|Column)\(([^)]*)\)\s+(\w+):\s*(\w+)
```

**Field Properties:**
| Pattern | Property |
|---------|----------|
| `PrimaryGeneratedColumn` | Primary key (auto-increment) |
| `unique: true` | Unique constraint |

### Example

```typescript
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;
}
```

## Drizzle Detection

### File Patterns

- `**/schema.ts`
- `**/db/schema.ts`

### Table Pattern

```regex
export\s+const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\(["\'](\w+)["\']
```

### Example

```typescript
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).unique(),
  name: varchar('name', { length: 100 }),
});
```

## Mongoose Detection

### File Patterns

- `**/models/*.js`
- `**/models/*.ts`

### Model Pattern

```regex
mongoose\.model\(["\'](\w+)["\']
```

### Example

```javascript
const userSchema = new Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
```

## Database Configuration Detection

### Configuration Files

| File                                 | Database Type                                         |
| ------------------------------------ | ----------------------------------------------------- |
| `prisma/schema.prisma`               | Prisma-supported (PostgreSQL, MySQL, SQLite, MongoDB) |
| `ormconfig.json`                     | TypeORM configuration                                 |
| `knexfile.js`                        | Knex.js migrations                                    |
| `alembic.ini`                        | SQLAlchemy migrations                                 |
| `docker-compose.yml` with db service | Various (parse service image)                         |

### Connection String Patterns

| Prefix                         | Database   |
| ------------------------------ | ---------- |
| `postgres://`, `postgresql://` | PostgreSQL |
| `mysql://`                     | MySQL      |
| `mongodb://`, `mongodb+srv://` | MongoDB    |
| `redis://`                     | Redis      |
| `sqlite://`                    | SQLite     |

### Environment Variable Patterns

Common database environment variable names:

```
DATABASE_URL, DB_URL, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD,
POSTGRES_URL, MYSQL_URL, MONGO_URL, MONGODB_URI, REDIS_URL
```

## Migration Detection

### Migration Directories

| Directory              | ORM/Tool              |
| ---------------------- | --------------------- |
| `prisma/migrations/`   | Prisma                |
| `alembic/`             | SQLAlchemy/Alembic    |
| `migrations/`          | Django, Knex, TypeORM |
| `db/migrate/`          | Rails ActiveRecord    |
| `database/migrations/` | Laravel               |

## Output Schema

When detecting models, structure the output as:

```json
{
  "ModelName": {
    "table": "table_name",
    "fields": {
      "field_name": {
        "type": "FieldType",
        "primary_key": false,
        "unique": false,
        "nullable": true
      }
    },
    "file": "relative/path/to/file.py",
    "orm": "SQLAlchemy"
  }
}
```

## Integration Notes

When using these patterns with project-analyzer skill:

1. **Check all supported ORMs**: Projects may use multiple ORMs (e.g., Prisma for app, Mongoose for sessions)
2. **Parse field details**: Extract type, constraints for schema documentation
3. **Track relationships**: Note foreign keys and relations for architecture diagrams
4. **Combine with route-patterns.md**: Link models to API endpoints they power
5. **Exclude test files**: Skip `test_*.py`, `*.test.ts`, `*_test.go`

## Memory Protocol (MANDATORY)

**After using these patterns:**

- Record new ORM patterns in `.claude/context/memory/learnings.md`
- Document detection edge cases in `.claude/context/memory/issues.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
