# API Route Detection Patterns

> Source: Auto-Claude analysis framework (route_detector.py)

## Overview

This document contains patterns for detecting API routes and endpoints across different web frameworks. Use these patterns to map the API surface of a codebase.

## Supported Frameworks

| Framework             | Language   | Detection Method       |
| --------------------- | ---------- | ---------------------- |
| FastAPI               | Python     | Decorator patterns     |
| Flask                 | Python     | Decorator patterns     |
| Django                | Python     | urls.py file patterns  |
| Express               | Node.js    | Method chain patterns  |
| Next.js               | TypeScript | File-based routing     |
| Gin, Echo, Chi, Fiber | Go         | Method chain patterns  |
| Axum, Actix           | Rust       | Route builder patterns |

## Directories to Exclude

Always skip these directories when scanning for routes:

```
node_modules, .venv, venv, __pycache__, .git
```

## FastAPI Routes

### File Pattern

All `.py` files (excluding excluded directories).

### Decorator Patterns

**Standard method decorators:**

```regex
@(?:app|router)\.(get|post|put|delete|patch)\(["\']([^"\']+)["\']
```

Matches:

- `@app.get("/users")`
- `@router.post("/auth/login")`
- `@app.delete("/users/{id}")`

**API route decorator:**

```regex
@(?:app|router)\.api_route\(["\']([^"\']+)["\'][^)]*methods\s*=\s*\[([^\]]+)\]
```

Matches:

- `@app.api_route("/multi", methods=["GET", "POST"])`

### Auth Detection

Check route definition line for auth indicators:

- `Depends` in the line
- `require` (case-insensitive) in the line

### Example

```python
@router.get("/users/{id}", dependencies=[Depends(require_auth)])
async def get_user(id: int):
    pass

@app.post("/auth/login")
async def login(credentials: Credentials):
    pass
```

## Flask Routes

### File Pattern

All `.py` files.

### Route Pattern

```regex
@(?:app|bp|blueprint)\.route\(["\']([^"\']+)["\'](?:[^)]*methods\s*=\s*\[([^\]]+)\])?
```

Matches:

- `@app.route("/users")`
- `@bp.route("/auth", methods=["GET", "POST"])`
- `@blueprint.route("/api/data", methods=["POST"])`

**Default method:** GET (if methods not specified)

### Auth Detection

Check decorator section (from previous `@` to match end) for:

- `login_required`
- `require` (case-insensitive)

### Example

```python
@app.route("/users")
def list_users():
    pass

@login_required
@bp.route("/admin", methods=["GET", "POST"])
def admin_panel():
    pass
```

## Django Routes

### File Pattern

`**/urls.py` files.

### URL Patterns

```regex
path\(["\']([^"\']+)["\']
re_path\([r]?["\']([^"\']+)["\']
```

Matches:

- `path('users/<int:id>/', views.user_detail)`
- `re_path(r'^api/v\d+/', include(api_urls))`

**Default methods:** GET, POST (Django allows both by default)

**Path normalization:** Add leading `/` if not present.

### Example

```python
urlpatterns = [
    path('users/', views.user_list),
    path('users/<int:pk>/', views.user_detail),
    path('auth/login/', views.login),
]
```

## Express Routes

### File Patterns

- All `.js` files
- All `.ts` files

### Route Pattern

```regex
(?:app|router)\.(get|post|put|delete|patch|use)\(["\']([^"\']+)["\']
```

Matches:

- `app.get('/users', handler)`
- `router.post('/auth', authMiddleware, login)`
- `app.delete('/users/:id', deleteUser)`

**Skip:** `.use()` calls (middleware, not routes)

### Auth Detection

Check route line for keywords:

- `auth`
- `authenticate`
- `protect`
- `require`

### Example

```javascript
app.get('/users', listUsers);
app.post('/users', authMiddleware, createUser);
router.delete('/users/:id', requireAuth, deleteUser);
```

## Next.js Routes

### App Router (app/ directory)

**File Pattern:**
`app/**/route.{ts,js,tsx,jsx}`

**Route Path Conversion:**

1. Get relative path from `app/` to route file's parent
2. Replace `\` with `/`
3. Convert `[id]` to `:id` for dynamic segments

**Method Detection:**

```regex
export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)
```

### Pages Router (pages/api/ directory)

**File Pattern:**
`pages/api/**/*.{ts,js,tsx,jsx}`

**Route Path Conversion:**

1. Get relative path from `pages/api/`
2. Remove file extension
3. Prepend `/api/`
4. Convert `[id]` to `:id`

**Default methods:** GET, POST

### Examples

**App Router:**

```typescript
// app/api/users/[id]/route.ts
// Route: /api/users/:id

export async function GET(request: Request) {
  // Handle GET
}

export async function DELETE(request: Request) {
  // Handle DELETE
}
```

**Pages Router:**

```typescript
// pages/api/users/[id].ts
// Route: /api/users/:id

export default function handler(req, res) {
  if (req.method === 'GET') {
    // Handle GET
  }
}
```

## Go Routes (Gin, Echo, Chi, Fiber)

### File Pattern

All `.go` files.

### Route Pattern

```regex
(?:r|e|app|router)\.(GET|POST|PUT|DELETE|PATCH|Get|Post|Put|Delete|Patch)\(["\']([^"\']+)["\']
```

Matches:

- `r.GET("/users", listUsers)` (Gin)
- `e.POST("/auth", loginHandler)` (Echo)
- `app.Get("/users/:id", getUser)` (Fiber)
- `r.Get("/users/{id}", getUser)` (Chi)

### Example

```go
// Gin
r.GET("/users", listUsers)
r.POST("/users", createUser)

// Echo
e.GET("/users/:id", getUser)
e.DELETE("/users/:id", deleteUser)

// Chi
r.Get("/users/{id}", getUser)
r.Put("/users/{id}", updateUser)
```

## Rust Routes (Axum, Actix)

### File Pattern

All `.rs` files.

### Route Patterns

**Axum:**

```regex
\.route\(["\']([^"\']+)["\'],\s*(get|post|put|delete|patch)
```

Matches:

- `.route("/users", get(list_users))`
- `.route("/users/:id", delete(delete_user))`

**Actix:**

```regex
web::(get|post|put|delete|patch)\(\)
```

Note: Actix pattern captures method but not path directly.

### Example

```rust
// Axum
let app = Router::new()
    .route("/users", get(list_users).post(create_user))
    .route("/users/:id", get(get_user).delete(delete_user));

// Actix
web::resource("/users")
    .route(web::get().to(list_users))
    .route(web::post().to(create_user))
```

## Output Schema

When detecting routes, structure the output as:

```json
{
  "path": "/users/:id",
  "methods": ["GET", "DELETE"],
  "file": "src/routes/users.ts",
  "framework": "Express",
  "requires_auth": true
}
```

## Aggregated API Analysis

After detecting all routes, generate summary:

```json
{
  "routes": [...],
  "total_routes": 25,
  "methods": ["GET", "POST", "PUT", "DELETE", "PATCH"],
  "protected_routes": ["/admin", "/users/:id/settings"]
}
```

## Integration Notes

When using these patterns with project-analyzer skill:

1. **Detect framework first**: Use service-patterns.md to identify which framework(s) the project uses
2. **Handle multiple routers**: Projects may have multiple router instances (e.g., `/api/v1`, `/api/v2`)
3. **Track route prefixes**: Blueprint/router mounting adds prefixes
4. **Combine with database-patterns.md**: Link routes to the models they manipulate
5. **Document protected routes**: Important for security review

## Memory Protocol (MANDATORY)

**After using these patterns:**

- Record new route patterns in `.claude/context/memory/learnings.md`
- Document detection edge cases in `.claude/context/memory/issues.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
