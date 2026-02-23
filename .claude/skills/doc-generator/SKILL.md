---
name: doc-generator
description: Generates comprehensive documentation from code, APIs, and specifications. Creates API documentation, developer guides, architecture docs, and user manuals with examples and tutorials.
version: 1.1.0
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Glob, Grep]
best_practices:
  - Extract documentation from code comments
  - Generate OpenAPI/Swagger specs from code
  - Create comprehensive examples
  - Include troubleshooting guides
  - Follow documentation standards
error_handling: graceful
streaming: supported
templates: [api-docs, developer-guide, architecture-docs, user-manual]
verified: true
lastVerifiedAt: 2026-02-22T00:00:00.000Z
---

**Mode: Cognitive/Prompt-Driven** — No standalone utility script; use via agent context.

<identity>
Documentation Generator Skill - Generates comprehensive documentation from code, APIs, and specifications including API docs, developer guides, architecture documentation, and user manuals.
</identity>

<capabilities>
- Generating API documentation
- Creating developer guides
- Documenting architecture
- Creating user manuals
- Generating OpenAPI/Swagger specs
- Updating existing documentation
</capabilities>

<instructions>
<execution_process>

### Step 1: Identify Documentation Type

Determine documentation type:

- **API Documentation**: Endpoint references
- **Developer Guide**: Setup and usage
- **Architecture Docs**: System overview
- **User Manual**: Feature guides

### Step 2: Extract Information

Gather documentation content:

- Read code and comments
- Analyze API endpoints
- Extract examples
- Understand architecture

### Step 3: Generate Documentation

Create documentation:

- Follow documentation templates
- Include examples
- Add troubleshooting
- Create clear structure

### Step 4: Validate Documentation

Validate quality:

- Check completeness
- Verify examples work
- Ensure clarity
- Validate links
  </execution_process>

<integration>
**Integration with Technical Writer Agent**:
- Uses this skill for documentation generation
- Ensures documentation quality
- Validates completeness

**Integration with Developer Agent**:

- Generates API documentation
- Creates inline documentation
- Updates docs with code changes
  </integration>

<best_practices>

1. **Extract from Code**: Use code as source of truth
2. **Include Examples**: Provide working examples
3. **Keep Updated**: Sync docs with code
4. **Clear Structure**: Organize logically
5. **User-Focused**: Write for users, not system
   </best_practices>
   </instructions>

<examples>
<formatting_example>
**API Documentation**

````markdown
# Users API

## Endpoints

### GET /api/users

List all users with pagination.

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100
  }
}
```
````

**Example:**

```bash
curl -X GET "http://localhost:3000/api/users?page=1&limit=10"
```

````
</formatting_example>

<formatting_example>
**Developer Guide**

```markdown
# Developer Guide

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 8+

### Installation
```bash
pnpm install
````

### Development

```bash
pnpm dev
```

## Architecture

[Architecture overview]

## Development Workflow

[Development process]

```
</formatting_example>
</examples>

<examples>
<usage_example>
**Example Commands**:

```

# Generate API documentation

Generate API documentation for app/api/users

# Generate developer guide

Generate developer guide for this project

# Generate architecture docs

Generate architecture documentation

# Generate OpenAPI spec

Generate OpenAPI specification from API routes

```
</usage_example>
</examples>

## Iron Laws

1. **ALWAYS** extract documentation from code as the source of truth — never write documentation that describes how you wish the code worked rather than how it actually works.
2. **NEVER** publish documentation with non-runnable examples — every code example must be copy-paste ready and verified to work before the documentation is written.
3. **ALWAYS** structure documentation with the progressive disclosure pattern (Setup → Quick Start → Reference → Troubleshooting) — readers need orientation before details.
4. **NEVER** document internal implementation details that consumers don't need to know — documentation of private internals creates false contracts and maintenance burden.
5. **ALWAYS** regenerate documentation when the code it describes changes — stale documentation is worse than no documentation because it actively misleads users.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| No working code examples | Users can't understand how to use the API without runnable examples | Include minimal copy-paste examples verified to work for every public API |
| Aspirational documentation (describes intended behavior) | Creates false contracts; users file bugs when docs don't match code | Read the actual implementation first; document only observed behavior |
| Documenting private/internal APIs | Creates implicit dependencies; refactoring breaks "documented" behavior | Only document public APIs; mark internal functions with `@internal` if needed |
| Monolithic reference dumps without Quick Start | Users abandon before finding what they need | Always include a Quick Start section with the simplest possible working example |
| Documentation in a separate PR from code change | Docs drift immediately; often abandoned | Require documentation updates in the same PR as API changes |

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**
- New pattern -> `.claude/context/memory/learnings.md`
- Issue found -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
```
