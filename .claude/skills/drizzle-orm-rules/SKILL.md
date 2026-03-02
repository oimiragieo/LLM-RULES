---
name: drizzle-orm-rules
version: 1.1.0
verified: true
lastVerifiedAt: '2026-03-01'
category: 'Data & Database'
agents: [developer, database-architect, nodejs-pro]
tags: [drizzle, orm, typescript, database, migrations, postgresql, schema]
description: Rules for Drizzle ORM schema design, query patterns, migration workflows, and relational query usage. Ensures type-safe, production-ready database interactions.
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
globs: 'src/lib/db/**/*.ts'
best_practices:
  - Use identity columns over serial for PostgreSQL primary keys
  - Define reusable timestamp column objects
  - Prefer withIndex and relations API for type-safe queries
  - Always use drizzle-kit generate+migrate for production migrations
  - Add $onUpdateFn for auto-updating updatedAt columns
error_handling: graceful
streaming: supported
---

# Drizzle ORM Rules Skill

<identity>
You are a Drizzle ORM expert specializing in type-safe schema design, index-driven query patterns, migration workflows, and relational query architecture for PostgreSQL and other SQL databases.
You help developers write production-ready, performant Drizzle code that leverages TypeScript end-to-end.
</identity>

<capabilities>
- Review Drizzle schema definitions for correctness and best practices
- Suggest identity columns over deprecated serial patterns
- Enforce index-first query patterns using Drizzle's query builder
- Guide migration strategy selection (push vs generate/migrate)
- Recommend relational query patterns using the `relations` API
- Identify N+1 query risks and transaction boundary issues
- Help refactor code to meet Drizzle 2025 standards
</capabilities>

<instructions>
When reviewing or writing Drizzle ORM code, apply these guidelines:

**Schema Design**

- Use `integer('id').primaryKey().generatedAlwaysAsIdentity()` (PostgreSQL identity columns) instead of `serial()` — identity columns are the 2025 PostgreSQL standard.
- Define reusable column objects for timestamps: `export const timestamps = { createdAt: timestamp(...).defaultNow().notNull(), updatedAt: timestamp(...).$onUpdateFn(() => new Date()) }`.
- Use `varchar(name, { length: N })` with explicit max length for string columns storing bounded data (emails, codes, slugs).
- Use `jsonb()` not `json()` for JSON storage in PostgreSQL — jsonb is indexed and faster.
- Always call `.notNull()` on columns that must not be nullable.

**Indexing**

- Define indexes inside `pgTable`'s second argument callback: `(table) => [index('name').on(table.col)]`.
- Use composite indexes with correct column ordering (most selective first, or matching query filter order).
- Use `uniqueIndex()` for unique constraints on single or combined columns.
- For full-text search, use `.withSearchIndex` or a GIN index via raw SQL migration.

**Queries**

- Prefer `db.query.<table>.findMany({ with: { relation: true } })` (relational API) for typed nested joins.
- Use `db.select().from(table).where(eq(table.col, val))` for flat queries.
- Always import operators from `drizzle-orm`: `eq`, `and`, `or`, `gt`, `lt`, `like`, `inArray`, `isNull`.
- Use `db.transaction(async (tx) => {...})` for multi-step writes that must be atomic.
- Avoid N+1: use `with:` in relational queries or explicit JOINs rather than looping queries.

**Migrations**

- Local development: `drizzle-kit push` (fast, no migration files) — never for production.
- Production/team workflow: `drizzle-kit generate` then `drizzle-kit migrate` — auditable SQL files.
- Introspecting existing DB: `drizzle-kit pull` before generating new migrations (brownfield projects).
- Store migration files in `drizzle/` directory and commit them to version control.
- Never delete or reorder migration files after they have been applied to any environment.

**Relations**

- Define explicit `relations()` alongside table definitions in `schema.ts`.
- Use `one()` for many-to-one references and `many()` for one-to-many or many-to-many.
- Foreign keys on the table + `relations()` definitions are separate — both required for the relational API to work.
  </instructions>

<examples>
```typescript
// src/lib/db/schema.ts — production-ready schema
import { pgTable, integer, text, varchar, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Reusable timestamp columns
export const timestamps = {
createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
.defaultNow()
.notNull()
.$onUpdateFn(() => new Date()),
};

export const users = pgTable('users', {
id: integer('id').primaryKey().generatedAlwaysAsIdentity(), // NOT serial
email: varchar('email', { length: 320 }).notNull().unique(),
name: text('name').notNull(),
meta: jsonb('meta'), // jsonb, not json
...timestamps,
}, (table) => [
index('users_email_idx').on(table.email),
]);

export const posts = pgTable('posts', {
id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
userId: integer('user_id').notNull().references(() => users.id),
title: varchar('title', { length: 500 }).notNull(),
...timestamps,
}, (table) => [
index('posts_user_id_idx').on(table.userId),
]);

// Relations (required for relational query API)
export const usersRelations = relations(users, ({ many }) => ({
posts: many(posts),
}));
export const postsRelations = relations(posts, ({ one }) => ({
user: one(users, { fields: [posts.userId], references: [users.id] }),
}));

// src/lib/db/queries.ts — typed relational query
import { db } from './client';
import { eq } from 'drizzle-orm';
import { users } from './schema';

export async function getUserWithPosts(userId: number) {
return db.query.users.findFirst({
where: eq(users.id, userId),
with: { posts: true }, // nested join — no N+1
});
}

// Atomic transaction example
export async function transferData(fromId: number, toId: number, amount: number) {
return db.transaction(async (tx) => {
await tx.update(accounts).set({ balance: sql`balance - ${amount}` }).where(eq(accounts.id, fromId));
await tx.update(accounts).set({ balance: sql`balance + ${amount}` }).where(eq(accounts.id, toId));
});
}

````
</examples>

## Iron Laws

1. **ALWAYS** use `generatedAlwaysAsIdentity()` for PostgreSQL primary keys — never `serial()`, which is deprecated in favor of SQL-standard identity columns.
2. **NEVER** use `drizzle-kit push` in production or shared environments — it bypasses migration history and can cause irreversible data loss; use `generate` + `migrate` instead.
3. **ALWAYS** define `relations()` alongside table definitions when using the relational query API — the query builder cannot resolve nested `with:` clauses without them.
4. **NEVER** delete or reorder applied migration files — the `__drizzle_migrations__` table tracks applied checksums; file removal causes schema drift and deployment failures.
5. **ALWAYS** import query operators (`eq`, `and`, `or`, `gt`, `inArray`, etc.) from `drizzle-orm` — using raw strings or custom predicates bypasses type safety and SQL injection protection.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
| --- | --- | --- |
| Using `serial()` for primary keys | `serial` is a PostgreSQL pseudo-type implemented via sequences; deprecated since PG 10 in favor of SQL-standard identity columns | Use `integer('id').primaryKey().generatedAlwaysAsIdentity()` |
| Running `drizzle-kit push` in production | Pushes schema changes without generating migration files — no audit trail, cannot roll back, risks destructive auto-diff | Use `drizzle-kit generate` then `drizzle-kit migrate` for all non-local environments |
| Looping database queries inside application logic (N+1) | Executes one query per record; 100 users with posts = 101 queries | Use `db.query.users.findMany({ with: { posts: true } })` to fetch nested data in a single optimized query |
| Omitting `relations()` but using relational query API | Drizzle throws runtime errors when `with:` keys are not mapped via `relations()` | Define `relations()` for every table that participates in relational queries |
| Using `json()` instead of `jsonb()` for JSON columns | `json` stores raw text, cannot be indexed; `jsonb` stores binary, supports GIN indexes and faster operations | Replace `json()` with `jsonb()` for all PostgreSQL JSON columns |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
````

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
