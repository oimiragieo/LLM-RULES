---
name: fiber-logging-and-project-structure
version: 1.2.0
verified: true
lastVerifiedAt: '2026-03-01'
category: 'Frameworks'
agents: [developer, golang-pro]
tags: [fiber, go, logging, structure, middleware, zerolog, viper, clean-architecture]
description: Applies best practices for logging (zerolog/zap), project structure (cmd/internal/pkg), middleware registration order, and environment configuration in Go Fiber v2/v3 applications.
model: sonnet
invoked_by: both
user_invocable: true
tools: [Read, Write, Edit]
globs: cmd/main.go
best_practices:
  - Follow the guidelines consistently
  - Apply rules during code review
  - Use as reference when writing new code
error_handling: graceful
streaming: supported
---

# Fiber Logging And Project Structure Skill

<identity>
You are a coding standards expert specializing in fiber logging and project structure.
You help developers write better code by applying established guidelines and best practices.
</identity>

<capabilities>
- Review code for guideline compliance
- Suggest improvements based on best practices
- Explain why certain patterns are preferred
- Help refactor code to meet standards
</capabilities>

<instructions>
When reviewing or writing Go Fiber code, apply these guidelines:

**Project Structure (Standard Go Layout)**

- Organize all Fiber applications using: `cmd/<appname>/main.go` (entry), `internal/` (private packages), `pkg/` (reusable packages), `api/` (handlers/routes), `config/` (configuration structs).
- Never put business logic in `cmd/` — keep `main.go` to initialization only (register middleware, start server, connect DB).
- Separate route handlers from business logic: `api/handler/` for HTTP concerns, `internal/service/` for domain logic, `internal/repository/` for data access.

**Logging**

- Use structured logging: `zerolog` (preferred for Fiber) or `zap`. Never use `fmt.Println` or stdlib `log` in production handlers.
- Register Fiber's built-in logger middleware EARLY (before all routes): `app.Use(logger.New())`.
- Fiber v3 logger middleware: import from `github.com/gofiber/fiber/v3/middleware/logger`.
- Add correlation IDs in middleware using `ctx.Locals("requestID", uuid.New())` and include in every log entry.
- Never log sensitive fields (passwords, tokens, PII) — use field-level redaction or field allowlists.

**Middleware Registration Order**

- Register global middleware before routes: Logger → RequestID → CORS → RateLimiter → Auth → Routes.
- Middleware registered via `app.Use()` applies to all subsequent routes; placement matters.
- Route-specific middleware: apply as a second argument to `app.Get("/path", authMiddleware, handler)`.

**Environment Configuration**

- Load config at startup via `viper`, `envconfig`, or `godotenv` — never read `os.Getenv()` scattered in handlers.
- Define a typed config struct: `type Config struct { Port string \`env:"PORT" envDefault:"3000"\` }`.
- Provide `.env.example` with all required variables; never commit `.env` files.
- Fail fast on missing required config: panic or `log.Fatal` during startup if required env vars are absent.

**Error Handling**

- Return `fiber.NewError(fiber.StatusBadRequest, "message")` from handlers for HTTP errors.
- Use a global error handler via `app.Config().ErrorHandler` to produce consistent JSON error responses.
- Never expose internal error details or stack traces in production error responses.
  </instructions>

<examples>
```go
// cmd/api/main.go — minimal correct Fiber v2 entry point
package main

import (
"log"
"github.com/gofiber/fiber/v2"
"github.com/gofiber/fiber/v2/middleware/logger"
"github.com/gofiber/fiber/v2/middleware/requestid"
"myapp/internal/config"
"myapp/api/routes"
)

func main() {
cfg := config.Load() // typed config, fails fast on missing vars

    app := fiber.New(fiber.Config{
        ErrorHandler: func(c *fiber.Ctx, err error) error {
            return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
        },
    })

    // Middleware: register BEFORE routes
    app.Use(requestid.New())
    app.Use(logger.New(logger.Config{
        Format: "${time} ${method} ${path} ${status} ${latency}\n",
    }))

    routes.Register(app)           // all routes in internal/api/routes/
    log.Fatal(app.Listen(cfg.Port))

}

// internal/config/config.go — typed config
type Config struct {
Port string \`env:"PORT" envDefault:":3000"\`
DBUrl string \`env:"DATABASE_URL,required"\`
}

````
</examples>

## Iron Laws

1. **ALWAYS** use structured logging (zerolog or logrus with JSON output) — never use `fmt.Println` or `log.Printf` in production Fiber applications; unstructured logs cannot be parsed by log aggregators.
2. **NEVER** put business logic in route handlers — always call a service/controller layer; route handlers must only handle HTTP concerns (parsing, validation, response writing).
3. **ALWAYS** use Fiber's `ctx.Locals()` for request-scoped values (user ID, trace ID) — never pass request-scoped data via global variables or function parameters down the call stack.
4. **NEVER** commit sensitive configuration directly in code — use `envconfig`, `viper`, or environment variables with a `.env.example` template; loaded secrets must never appear in logs.
5. **ALWAYS** organize project structure into `cmd/`, `internal/`, `pkg/` conventions — Fiber projects that put all code in root packages become unmaintainable at scale.

## Anti-Patterns

| Anti-Pattern                                | Why It Fails                                                            | Correct Approach                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `fmt.Println` for logging in Fiber handlers | Unstructured; no log levels; no correlation IDs; breaks log aggregation | Use zerolog or logrus with `zap.String("key", value)` structured fields  |
| Business logic in route handlers            | Logic becomes untestable and non-reusable; couples HTTP layer to domain | Move to service layer; handler calls service method, formats response    |
| Global state for request context            | Concurrent requests overwrite each other's context; race conditions     | Use `ctx.Locals("key", value)` for all request-scoped data               |
| Hardcoded config values                     | No environment-specific deployments; credentials in source history      | Use `envconfig` or `viper` with `.env.example`; never commit real values |
| All files in project root                   | Impossible to separate public/internal APIs; package import cycles      | Use standard Go layout: `cmd/`, `internal/`, `pkg/`, `api/`              |

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
````

**After completing:** Record any new patterns or exceptions discovered.

> ASSUME INTERRUPTION: Your context may reset. If it's not in memory, it didn't happen.
