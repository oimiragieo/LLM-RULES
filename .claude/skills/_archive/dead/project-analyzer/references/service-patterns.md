# Service Detection Patterns

> Source: Auto-Claude analysis framework (service_analyzer.py, framework_analyzer.py)

## Overview

This document contains patterns for detecting service types, frameworks, and entry points within a codebase. Use these patterns to classify services as frontend, backend, worker, library, etc.

## Service Type Detection

### Name-Based Classification

Classify services based on directory/service name keywords:

| Keywords                                   | Service Type |
| ------------------------------------------ | ------------ |
| `frontend`, `client`, `web`, `ui`, `app`   | frontend     |
| `backend`, `api`, `server`, `service`      | backend      |
| `worker`, `job`, `queue`, `task`, `celery` | worker       |
| `scraper`, `crawler`, `spider`             | scraper      |
| `proxy`, `gateway`, `router`               | proxy        |
| `lib`, `shared`, `common`, `core`, `utils` | library      |

**Example:**

```python
name_lower = service_name.lower()

if any(kw in name_lower for kw in ["frontend", "client", "web", "ui", "app"]):
    service_type = "frontend"
elif any(kw in name_lower for kw in ["backend", "api", "server", "service"]):
    service_type = "backend"
elif any(kw in name_lower for kw in ["worker", "job", "queue", "task", "celery"]):
    service_type = "worker"
# ... etc
```

### Content-Based Classification

If name does not match, infer from language and file presence:

**Python Backend Indicators:**

- `run.py` exists
- `main.py` exists
- `__main__.py` exists
- `agent.py` or `agents/` directory exists
- `runner.py` or `runners/` directory exists

## Framework Detection

### Python Frameworks

| Pattern in deps | Framework | Type    | Default Port |
| --------------- | --------- | ------- | ------------ |
| `fastapi`       | FastAPI   | backend | 8000         |
| `flask`         | Flask     | backend | 5000         |
| `django`        | Django    | backend | 8000         |
| `starlette`     | Starlette | backend | 8000         |
| `litestar`      | Litestar  | backend | 8000         |

**Task Queue Detection:**
| Pattern | Queue System |
|---------|--------------|
| `celery` | Celery |
| `dramatiq` | Dramatiq |
| `huey` | Huey |

**ORM Detection:**
| Pattern | ORM |
|---------|-----|
| `sqlalchemy` | SQLAlchemy |
| `tortoise` | Tortoise ORM |
| `prisma` | Prisma |

### Node.js/TypeScript Frameworks

**Frontend Frameworks:**
| Dependency | Framework | Type | Default Port |
|------------|-----------|------|--------------|
| `next` | Next.js | frontend | 3000 |
| `nuxt` | Nuxt | frontend | 3000 |
| `react` | React | frontend | 3000 |
| `vue` | Vue | frontend | 5173 |
| `svelte` | Svelte | frontend | 5173 |
| `@sveltejs/kit` | SvelteKit | frontend | 5173 |
| `angular` | Angular | frontend | 4200 |
| `@angular/core` | Angular | frontend | 4200 |
| `solid-js` | SolidJS | frontend | 3000 |
| `astro` | Astro | frontend | 4321 |

**Backend Frameworks:**
| Dependency | Framework | Type | Default Port |
|------------|-----------|------|--------------|
| `express` | Express | backend | 3000 |
| `fastify` | Fastify | backend | 3000 |
| `koa` | Koa | backend | 3000 |
| `hono` | Hono | backend | 3000 |
| `elysia` | Elysia | backend | 3000 |
| `@nestjs/core` | NestJS | backend | 3000 |

**Build Tools:**
| Dependency | Tool |
|------------|------|
| `vite` | Vite |
| `webpack` | Webpack |
| `esbuild` | esbuild |
| `turbopack` | Turbopack |

**Styling:**
| Dependency | Library |
|------------|---------|
| `tailwindcss` | Tailwind CSS |
| `styled-components` | styled-components |
| `@emotion/react` | Emotion |

**State Management:**
| Dependency | Library |
|------------|---------|
| `zustand` | Zustand |
| `@reduxjs/toolkit`, `redux` | Redux |
| `jotai` | Jotai |
| `pinia` | Pinia |

**ORMs:**
| Dependency | ORM |
|------------|-----|
| `@prisma/client`, `prisma` | Prisma |
| `typeorm` | TypeORM |
| `drizzle-orm` | Drizzle |
| `mongoose` | Mongoose |

### Go Frameworks

| Pattern in go.mod | Framework | Default Port |
| ----------------- | --------- | ------------ |
| `gin-gonic/gin`   | Gin       | 8080         |
| `labstack/echo`   | Echo      | 8080         |
| `gofiber/fiber`   | Fiber     | 3000         |
| `go-chi/chi`      | Chi       | 8080         |

### Rust Frameworks

| Pattern in Cargo.toml | Framework | Default Port |
| --------------------- | --------- | ------------ |
| `actix-web`           | Actix Web | 8080         |
| `axum`                | Axum      | 3000         |
| `rocket`              | Rocket    | 8000         |

### Ruby Frameworks

| Pattern in Gemfile | Framework     | Default Port |
| ------------------ | ------------- | ------------ |
| `rails`            | Ruby on Rails | 3000         |
| `sinatra`          | Sinatra       | 4567         |

**Task Queue:**
| Pattern | Queue |
|---------|-------|
| `sidekiq` | Sidekiq |

### Swift/iOS Detection

**UI Frameworks (from imports):**
| Import | Framework | Type |
|--------|-----------|------|
| `SwiftUI` | SwiftUI | mobile |
| `UIKit` | UIKit | mobile |
| `AppKit` | AppKit | desktop |

**Apple Frameworks:**

```
Combine, CoreData, MapKit, WidgetKit, CoreLocation,
StoreKit, CloudKit, ActivityKit, UserNotifications
```

## Entry Point Detection

### Common Entry Point Files

Check these files in order to find the main entry point:

**Python:**

```
main.py, app.py, __main__.py, server.py, wsgi.py, asgi.py
```

**JavaScript/TypeScript:**

```
index.ts, index.js, main.ts, main.js, server.ts, server.js,
app.ts, app.js, src/index.ts, src/index.js, src/main.ts,
src/app.ts, src/server.ts, src/App.tsx, src/App.jsx,
pages/_app.tsx, pages/_app.js
```

**Go:**

```
main.go, cmd/main.go
```

**Rust:**

```
src/main.rs, src/lib.rs
```

## Key Directory Detection

### Directory Purpose Classification

| Directory                         | Purpose          |
| --------------------------------- | ---------------- |
| `src/`, `app/`, `lib/`            | Source code      |
| `test/`, `tests/`, `__tests__/`   | Tests            |
| `config/`, `.config/`             | Configuration    |
| `docs/`, `documentation/`         | Documentation    |
| `dist/`, `build/`, `out/`         | Build output     |
| `scripts/`, `bin/`                | Scripts          |
| `assets/`, `static/`, `public/`   | Assets           |
| `api/`, `routes/`                 | API endpoints    |
| `controllers/`                    | Controllers      |
| `models/`, `schemas/`             | Data models      |
| `services/`                       | Business logic   |
| `components/`, `pages/`, `views/` | UI components    |
| `hooks/`                          | Custom hooks     |
| `utils/`, `helpers/`              | Utilities        |
| `middleware/`                     | Middleware       |
| `tasks/`, `jobs/`, `workers/`     | Background tasks |

## Package Manager Detection

### Node.js Package Managers

| Lock File                     | Package Manager |
| ----------------------------- | --------------- |
| `pnpm-lock.yaml`              | pnpm            |
| `yarn.lock`                   | yarn            |
| `bun.lockb`, `bun.lock`       | bun             |
| `package-lock.json` (default) | npm             |

### Python Package Managers

| File                                  | Package Manager |
| ------------------------------------- | --------------- |
| `requirements.txt`                    | pip             |
| `pyproject.toml` with `[tool.poetry]` | poetry          |
| `pyproject.toml` with `[tool.uv]`     | uv              |
| `Pipfile`                             | pipenv          |

## Integration Notes

When using these patterns with project-analyzer skill:

1. **Check frontend frameworks first**: Next.js includes React, detect the meta-framework
2. **Use confidence scoring**:
   - 1.0 for direct dependency match
   - 0.8 for import-based detection
   - 0.6 for structure-based inference
3. **Combine with database-patterns.md**: ORMs indicate database usage
4. **Combine with route-patterns.md**: Routes indicate API structure

## Memory Protocol (MANDATORY)

**After using these patterns:**

- Record new framework patterns in `.claude/context/memory/learnings.md`
- Document detection edge cases in `.claude/context/memory/issues.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
