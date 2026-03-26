---
paths:
  - .claude/skills/data-expert/**
---

# Data Expert Rules

## Core Principles

- Data validation at boundaries (Zod, Yup, Joi)
- Type-safe parsing and transformation
- Error handling for malformed data
- Sanitize untrusted input
- Use schemas for API contracts

## Data Processing Standards

- Stream large datasets (don't load into memory)
- Batch processing for efficiency
- Progress indicators for long operations
- Graceful degradation on errors
- Idempotent operations

## Data Validation

- Validate all external data (API, user input, files)
- Use schema validators (Zod for TypeScript, Pydantic for Python)
- Type coercion with validation
- Custom validators for domain rules
- Error messages for users

## Data Transformation

- Pure functions for transformations
- Pipeline pattern for multi-step transforms
- Map-reduce for parallel processing
- Cache expensive computations
- Unit test transformations

## Security Standards

- Sanitize HTML and SQL inputs
- Validate file uploads (type, size, content)
- Rate limit data processing endpoints
- Redact PII in logs
- Encrypt sensitive data at rest

## Anti-Patterns

- No validation (trust all input)
- Loading entire files into memory
- Synchronous processing of large datasets
- No error handling (fail silently)
- String manipulation for data transforms (use parsers)

## Integration Points

- `database-expert` skill - Data persistence
- `api-development-expert` skill - API data contracts
- `security-architect` agent - Input validation review

## Related References

- `.claude/skills/data-expert/SKILL.md` - Data processing patterns
- `.claude/skills/database-expert/SKILL.md` - Database operations
