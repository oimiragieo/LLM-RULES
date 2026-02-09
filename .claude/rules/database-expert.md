# Database Expert Rules

## Core Principles

- Use ORM for type safety (Prisma, TypeORM, SQLAlchemy)
- Connection pooling for performance
- Transactions for multi-step operations
- Migrations for schema changes (never manual DDL)
- Backups before schema changes

## Prisma Standards

- Schema-first development
- Prisma Client for type-safe queries
- Migrations via `prisma migrate`
- Seeds for development data
- Use `@unique`, `@index` annotations

## Supabase Standards

- Row-level security (RLS) policies on all tables
- PostgREST for auto-generated APIs
- Real-time subscriptions for live data
- Auth integration with Supabase Auth
- Edge Functions for server logic

## Query Optimization

- Use indexes on foreign keys and filter columns
- Avoid N+1 queries (use eager loading/joins)
- Pagination for large result sets
- Select only needed columns
- Use EXPLAIN ANALYZE to profile queries

## Security Standards

- Parameterized queries (prevent SQL injection)
- Least privilege database users
- Encrypt sensitive columns
- Never log full queries (redact values)
- RLS policies on Postgres tables

## Anti-Patterns

- String concatenation for SQL queries (SQL injection)
- No connection pooling (connection exhaustion)
- No indexes (slow queries)
- No transactions (data inconsistency)
- Expose database directly to frontend

## Integration Points

- `database-architect` skill - Schema design
- `security-architect` agent - Security review
- `text-to-sql` skill - Natural language to SQL

## Related References

- `.claude/skills/database-expert/SKILL.md` - Database patterns and ORM usage
- `.claude/skills/database-architect/SKILL.md` - Schema design principles
