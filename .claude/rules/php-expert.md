---
paths:
  - .claude/skills/php-expert/**
---

# PHP Expert Rules

## Core Principles

- Use PHP 8.3+ features (union types, attributes, enums, readonly properties)
- Follow PSR standards (PSR-1, PSR-12 for code style)
- Use Composer for dependency management
- Implement proper error handling and logging
- Write type-safe code with strict typing

## Laravel Standards

- Use Eloquent ORM over raw SQL queries
- Implement Repository pattern for data access layer
- Use Laravel's built-in auth and authorization features
- Utilize caching mechanisms (Redis, Memcached)
- Implement job queues for long-running tasks (Laravel Horizon)
- Use Laravel Mix/Vite for asset compilation

### Laravel Naming Conventions

- File names: kebab-case (my-class-file.php)
- Class names: PascalCase (MyClass)
- Method names: camelCase (myMethod)
- Variables/properties: snake_case (my_variable)
- Constants: SCREAMING_SNAKE_CASE (MY_CONSTANT)

### Laravel Package Development

- Use spatie/laravel-package-tools boilerplate
- Implement Pint configuration for code styling
- Prefer helpers over facades
- Focus on developer experience (DX): autocompletion, type safety, docblocks

## Testing

- Use PHPUnit for unit and feature tests
- Use Laravel Dusk for browser tests
- Implement proper test coverage (>80%)
- Use factories and seeders for test data
- Test API endpoints with Laravel HTTP client

## Security

- Implement CSRF protection
- Use Laravel's built-in security features
- Validate and sanitize all inputs
- Use prepared statements for database queries
- Implement rate limiting for APIs

## Performance

- Implement database indexing for queries
- Use Laravel's caching features
- Optimize Eloquent queries (avoid N+1)
- Use pagination for large datasets
- Profile with Laravel Telescope or Debugbar

## Integration Points

- Used by: `backend-architect`, `php-pro`, `developer` (PHP projects)
- Related skills: `api-designer`, `database-architect`, `wordpress-expert`
- Works with: `security-architect`, `performance-engineer`, `devops`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
