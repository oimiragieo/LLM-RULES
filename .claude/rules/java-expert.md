# Java Expert Rules

## Core Principles

- Use Java 21+ modern features (virtual threads, pattern matching, records)
- Use Spring Boot 3.2+ for web applications
- Follow SOLID principles and design patterns
- Implement proper exception handling and logging
- Write clean, maintainable, testable code

## Modern Java Features (Java 21+)

### Virtual Threads (Project Loom)
- Use `Executors.newVirtualThreadPerTaskExecutor()` for I/O-bound tasks
- Enable in Spring Boot 3.2+ via `spring.threads.virtual.enabled=true`
- Dramatically improves scalability for concurrent connections

### Pattern Matching
- Use pattern matching for switch statements
- Implement record patterns for destructuring
- Use pattern matching for instanceof checks

### Records
- Use records for immutable data transfer objects
- Implement sealed interfaces for exhaustive pattern matching
- Keep records simple and focused

## Spring Boot Standards

- Use constructor injection over field injection
- Implement proper exception handling (@ControllerAdvice)
- Use Spring Data JPA for database operations
- Implement proper validation (@Valid, @Validated)
- Use Spring Security for authentication/authorization
- Implement API versioning and documentation (Swagger/OpenAPI)

## Testing

- Write unit tests with JUnit 5
- Use Mockito for mocking dependencies
- Implement integration tests with @SpringBootTest
- Write tests for REST controllers (@WebMvcTest)
- Use TestContainers for database integration tests

## Performance

- Use caching strategically (@Cacheable)
- Implement connection pooling (HikariCP)
- Use async processing where appropriate (@Async)
- Optimize JPA queries (avoid N+1 selects)
- Profile with JProfiler or VisualVM

## Integration Points

- Used by: `backend-architect`, `java-pro`, `developer` (Java projects)
- Related skills: `api-designer`, `database-architect`, `microservices-architect`
- Works with: `security-architect`, `performance-engineer`, `devops`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
