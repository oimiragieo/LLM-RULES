---
paths:
  - .claude/skills/nodejs-expert/**
---

# Node.js Expert Rules

## Core Principles

- Use modular architecture (encapsulate API in modules)
- Implement proper async/await patterns (avoid callback hell)
- Use TypeScript for type safety in Node.js projects
- Follow Express/NestJS conventions and best practices
- Implement proper error handling and logging

## NestJS Standards

### Module Structure

- One module per main domain/route
- One controller for its route (and secondary controllers for sub-routes)
- A models folder with data types
- DTOs validated with class-validator for inputs
- Declare simple types for outputs
- A services module with business logic and persistence (one service per entity)

### Core Module

- Global filters for exception handling
- Global middlewares for request management
- Guards for permission management
- Interceptors for request management

### Shared Module

- Utilities and shared business logic
- Services shared between modules

### Testing

- Use standard Jest framework for testing
- Write tests for each controller and service
- Write end-to-end tests for each API module
- Add admin/test method to each controller as smoke test

## Express Standards

- Use middleware pattern for cross-cutting concerns
- Implement proper route organization and modularization
- Use async/await with error handling middleware
- Implement proper security (helmet, CORS, rate limiting)

## Performance

- Use connection pooling for databases
- Implement caching where appropriate (Redis)
- Use clustering for multi-core utilization
- Monitor memory usage and prevent leaks

## Integration Points

- Used by: `backend-architect`, `nodejs-pro`, `developer` (Node.js projects)
- Related skills: `typescript-expert`, `api-designer`, `database-architect`
- Works with: `security-architect`, `performance-engineer`, `devops`

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
