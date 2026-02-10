# Python Backend Expert Rules

## Core Principles

- Use latest stable versions of frameworks (Django, FastAPI, Flask)
- Keep business logic in models and forms; keep views light
- Use Django's validation framework for form and model data validation
- Implement proper async patterns with asyncio
- Use type hints on all public functions (PEP 484)

## Framework Standards

### Django

- Use class-based views for HTMX responses
- Utilize form and model form classes for handling and validation
- Use middleware judiciously for cross-cutting concerns (auth, logging, caching)
- Follow Django's MVT (Model-View-Template) pattern
- Use Django ORM for database operations

### FastAPI

- Use Pydantic models for request/response validation
- Implement dependency injection for shared logic
- Use async/await for I/O-bound operations
- Follow OpenAPI/Swagger documentation standards

### Database Migrations

- Use Alembic for database migrations
- Write reversible migration scripts
- Test migrations on staging before production

## Code Quality

- Follow PEP 8 style guide
- Use docstrings (Google/NumPy style)
- Implement proper error handling (try/except with specific exceptions)
- Keep functions focused (single responsibility principle)
- Use virtual environments and requirements.txt

## Integration Points

- Used by: `python-pro`, `backend-architect`, `developer` (Python projects)
- Related skills: `database-architect`, `api-designer`
- Works with: `security-architect` (auth/authz), `tdd` (pytest)

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
