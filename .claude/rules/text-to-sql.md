# Text-to-SQL Rules

## Core Principles

- Convert natural language to SQL queries
- Validate generated SQL before execution
- Use parameterized queries for values
- Explain query logic to users
- Handle ambiguous requests gracefully

## Query Generation Standards

- Start with schema understanding
- Map entities to tables
- Use appropriate joins for relationships
- Apply filters from natural language
- Limit results for safety (default LIMIT 100)

## Security Standards

- Always use parameterized queries (prevent injection)
- Read-only queries by default
- Validate table/column names against schema
- Reject DROP, DELETE, TRUNCATE without confirmation
- Sanitize user input

## Query Optimization

- Use indexes on filter columns
- Avoid SELECT * (specify columns)
- Use EXISTS instead of COUNT for boolean checks
- Apply filters early in query
- Use query planner hints when needed

## Error Handling

- Validate query syntax before execution
- Explain SQL errors in plain English
- Suggest corrections for ambiguous requests
- Provide example natural language patterns
- Log failed query attempts

## Anti-Patterns

- No validation (execute raw queries)
- Allow destructive operations without confirmation
- No LIMIT clause (return all rows)
- String interpolation (SQL injection)
- No schema validation

## Integration Points

- `database-architect` skill - Schema understanding
- `database-expert` skill - Query execution
- `security-architect` agent - SQL injection review

## Related References

- `.claude/skills/text-to-sql/SKILL.md` - Text-to-SQL patterns
- `.claude/skills/database-expert/SKILL.md` - Database operations
