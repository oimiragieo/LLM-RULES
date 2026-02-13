---
paths:
  - .claude/skills/doc-generator/**
---

# Doc Generator Rules

## Core Principles

- Documentation from code - extract truth from source
- Follow documentation templates for consistency
- Include working examples that are runnable
- Update docs when code changes
- Clear structure: Setup → Usage → Examples → Troubleshooting

## When to Use

Use doc-generator when:

- Generating API documentation from code
- Creating developer guides for libraries/frameworks
- Documenting architecture from system design
- Writing user manuals from specifications
- Updating existing documentation after code changes

## Standards

### Documentation Types

**API Documentation**:

- Endpoint references with request/response examples
- Parameter descriptions with types and constraints
- Error codes and handling
- Authentication requirements
- Rate limiting details

**Developer Guides**:

- Installation and setup instructions
- Quick start with minimal example
- Core concepts and architecture
- Integration patterns
- Common use cases

**Architecture Docs**:

- System overview with diagrams
- Component relationships
- Data flows
- Technology stack
- Deployment architecture

**User Manuals**:

- Feature descriptions
- Step-by-step guides
- Screenshots and visual aids
- Troubleshooting common issues
- FAQ section

### Documentation Structure

```markdown
# [Component/API Name]

Brief description (1-2 sentences)

## Installation

### Requirements

- Requirement 1
- Requirement 2

### Steps

\`\`\`bash
installation command
\`\`\`

## Quick Start

\`\`\`language
// Minimal working example
\`\`\`

## API Reference

### Method/Endpoint Name

**Description**: What it does

**Parameters**:
| Name | Type | Required | Description |
|------|------|----------|-------------|
| param1 | string | Yes | Parameter description |

**Returns**: Return type and description

**Example**:
\`\`\`language
example usage
\`\`\`

## Examples

### Use Case 1

[Detailed example with explanation]

### Use Case 2

[Another common scenario]

## Troubleshooting

**Problem**: Common issue
**Solution**: How to fix it

## See Also

- [Related documentation]
```

### Example Quality Standards

- **Runnable**: Examples must be copy-paste ready
- **Realistic**: Use actual use cases, not foo/bar
- **Complete**: Include all necessary imports/setup
- **Tested**: Verify examples work before documenting
- **Annotated**: Explain non-obvious parts

## Anti-Patterns

| Pattern           | Problem                 | Fix                              |
| ----------------- | ----------------------- | -------------------------------- |
| No examples       | Unclear how to use      | Add working code examples        |
| Outdated docs     | Misleads users          | Auto-regenerate from code        |
| Incomplete setup  | Users can't get started | Full installation instructions   |
| No error handling | Users get stuck         | Document common errors           |
| Technical jargon  | Excludes beginners      | Define terms or link to glossary |
| Walls of text     | Hard to scan            | Use headers, lists, tables       |

## Workflow

### Step 1: Extract Information

- Read source code and comments
- Analyze API endpoints/functions
- Review test files for usage patterns
- Understand architecture from system design

### Step 2: Generate Documentation

- Follow appropriate template (API, guide, architecture, manual)
- Include working examples
- Add troubleshooting section
- Create clear structure with headers

### Step 3: Validate Quality

- Check completeness (all public APIs documented)
- Verify examples work
- Ensure clarity (understandable by target audience)
- Validate links and references
- Test code examples

### Step 4: Keep Updated

- Regenerate when code changes
- Version documentation with code
- Mark deprecated features
- Update examples for breaking changes

## Integration Points

**Related Skills**:

- `readme` - README file generation
- `writing-skills` - Writing quality guidelines
- `diagram-generator` - Architecture diagrams

**Related Agents**:

- `technical-writer` - Uses this skill for documentation
- `developer` - Generates inline documentation
- `architect` - Creates architecture docs

**Related Workflows**:

- Feature development - Documentation phase
- API design - Generate API docs from spec
- Architecture review - Document design decisions

## OpenAPI/Swagger Integration

For REST APIs, generate OpenAPI specs:

```yaml
openapi: 3.0.0
info:
  title: API Name
  version: 1.0.0
paths:
  /endpoint:
    get:
      summary: Endpoint description
      parameters:
        - name: param
          in: query
          schema:
            type: string
      responses:
        '200':
          description: Success response
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
```

## Best Practices

1. **Extract from code**: Use code as source of truth
2. **Include examples**: Provide working examples
3. **Keep updated**: Sync docs with code
4. **Clear structure**: Organize logically
5. **User-focused**: Write for users, not system
6. **Visual aids**: Use diagrams for complex concepts
7. **Progressive disclosure**: Start simple, add complexity
8. **Accessibility**: Clear language, proper formatting

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
