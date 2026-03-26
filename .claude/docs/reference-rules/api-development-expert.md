---
paths:
  - .claude/skills/api-development-expert/**
---

# API Development Expert Rules

## Core Principles

- RESTful resource-oriented design
- OpenAPI/Swagger specification for all APIs
- Versioning via URI or headers
- Rate limiting and authentication required
- Comprehensive error responses

## REST Design Standards

- Resources as nouns (plural): /users, /products
- HTTP methods: GET (read), POST (create), PUT (replace), PATCH (update), DELETE (remove)
- Nested resources: /users/{id}/orders
- Query params for filtering/sorting/pagination
- No verbs in URIs (use HTTP methods)

## OpenAPI/Swagger Standards

- Define all endpoints in OpenAPI 3.0+ spec
- Request/response schemas with examples
- Error responses documented
- Authentication methods specified
- Generate interactive docs with Swagger UI

## Versioning Standards

- URI versioning: /v1/users, /v2/users (most common)
- Header versioning: Accept: application/vnd.api.v2+json
- Deprecation warnings for old versions
- Semantic versioning for breaking changes

## Authentication Standards

- OAuth 2.1 for delegated authorization (MANDATORY PKCE)
- JWT for stateless authentication (short-lived tokens)
- API keys for service-to-service auth
- Rate limiting per authenticated user/key

## Error Handling Standards

- Consistent error response format
- HTTP status codes: 4xx (client error), 5xx (server error)
- Machine-readable error codes
- Human-readable error messages
- Validation error details

## Rate Limiting

- Implement rate limiting on all public endpoints
- Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- 429 Too Many Requests response
- Different limits for authenticated vs anonymous

## Anti-Patterns

- Verbs in URIs (/getUser)
- No API documentation
- No versioning (breaking changes break clients)
- Returning 200 OK for errors
- No rate limiting (abuse risk)

## Integration Points

- `graphql-expert` skill - GraphQL API design
- `security-architect` agent - API security review
- `auth-security-expert` skill - OAuth 2.1 patterns

## Related References

- `.claude/skills/api-development-expert/SKILL.md` - REST API patterns
- `.claude/skills/graphql-expert/SKILL.md` - GraphQL patterns
