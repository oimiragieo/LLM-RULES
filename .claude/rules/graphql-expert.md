# GraphQL Expert Rules

## Core Principles

- Schema-first development
- Strong typing with GraphQL schema
- Resolver-based data fetching
- Query complexity limits
- DataLoader for N+1 prevention

## Schema Design Standards

- Define types, queries, mutations in schema
- Use Input types for mutations
- Nullable fields by default (use ! for required)
- Enums for fixed sets of values
- Interfaces for shared fields across types

## Apollo Server Standards

- Apollo Server 4+ for production
- Context for authentication and data loaders
- Error handling with formatError
- Plugins for logging and metrics
- Introspection disabled in production

## Apollo Client Standards

- Client-side caching with InMemoryCache
- Cache normalization with id field
- Optimistic updates for better UX
- Error policies: none, ignore, all
- Refetch queries after mutations

## Performance Standards

- DataLoader for batching and caching
- Query complexity limits (prevent deep queries)
- Depth limiting (max query depth 5-10)
- Pagination with connections (cursor-based)
- Field-level caching

## Security Standards

- Authentication via context (JWT in headers)
- Authorization in resolvers (check permissions)
- Query depth limiting (prevent DoS)
- Query complexity limiting (prevent expensive queries)
- Rate limiting per user/IP

## Error Handling

- Return user-friendly errors
- Use GraphQL error extensions for codes
- Log detailed errors server-side
- Mask sensitive information in errors
- Separate user errors from server errors

## Anti-Patterns

- No query complexity limits (DoS risk)
- N+1 queries (no DataLoader)
- Over-fetching (select all fields)
- No pagination (return all data)
- Introspection enabled in production

## Integration Points

- `api-development-expert` skill - REST API comparison
- `security-architect` agent - GraphQL security review
- `database-expert` skill - DataLoader and query optimization

## Related References

- `.claude/skills/graphql-expert/SKILL.md` - GraphQL patterns
- `.claude/skills/api-development-expert/SKILL.md` - API design principles
