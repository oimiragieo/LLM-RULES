# FastAPI Development Standards

## Project Structure

- Organize by feature, not by layer: `app/users/`, `app/auth/`, `app/orders/`
- Keep routers thin — business logic belongs in service modules, not route handlers
- Place shared dependencies in `app/dependencies.py`
- Define models in `app/models/` (SQLAlchemy), schemas in `app/schemas/` (Pydantic)
- Use `app/core/config.py` with `pydantic-settings` for configuration

## Request and Response Models

- Always use Pydantic v2 models for request bodies and responses — never use `dict` as a type hint
- Separate input schemas (Create, Update) from output schemas (Read/Response) — never reuse the same model for both
- Use `model_config = ConfigDict(from_attributes=True)` for ORM mode in response models
- Validate with `Field(...)` constraints: `gt`, `lt`, `min_length`, `max_length`, `pattern`
- Never expose internal IDs or sensitive fields in response models — use explicit field inclusion

```python
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    created_at: datetime
```

## Dependency Injection

- Use `Depends()` for shared logic: database sessions, current user, pagination, rate limiting
- Chain dependencies — a `get_current_active_user` can depend on `get_current_user`
- Use `Annotated[T, Depends(...)]` syntax (FastAPI 0.95+) for cleaner signatures
- Never instantiate services or DB sessions directly inside route handlers

```python
CurrentUser = Annotated[User, Depends(get_current_active_user)]

@router.get("/me")
async def read_me(user: CurrentUser) -> UserResponse:
    return user
```

## Async Patterns

- Use `async def` for I/O-bound routes (DB calls, HTTP calls, file I/O)
- Use `def` (sync) for CPU-bound operations — FastAPI runs them in a thread pool automatically
- Never call blocking I/O (requests, time.sleep) inside `async def` — use `httpx.AsyncClient` and `asyncio.sleep`
- Use `asynccontextmanager` lifespan events instead of deprecated `@app.on_event`

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    await db.connect()
    yield
    # shutdown
    await db.disconnect()
```

## Error Handling

- Use `HTTPException` with explicit `status_code` and `detail` strings — never return raw dicts for errors
- Register custom exception handlers with `@app.exception_handler(MyError)`
- Define domain-specific exception classes; map them to HTTP status codes in handlers
- Never leak stack traces in `detail` — log internally, return user-safe messages

```python
@app.exception_handler(EntityNotFoundError)
async def not_found_handler(request: Request, exc: EntityNotFoundError):
    return JSONResponse(status_code=404, content={"detail": str(exc)})
```

## Security

- Use `OAuth2PasswordBearer` or `HTTPBearer` for token extraction in dependencies
- Hash passwords with `bcrypt` via `passlib` — never store plaintext or use MD5/SHA1
- Validate JWT with `python-jose` or `PyJWT`; always check `exp`, `iss`, `aud` claims
- Use `Depends(get_current_user)` on every protected route — never check auth inline
- Enable CORS explicitly: whitelist allowed origins, never use `allow_origins=["*"]` in production
- Rate-limit endpoints that accept credentials (login, password reset)

## Router Organization

- Register routers with `app.include_router(router, prefix="/api/v1", tags=["users"])`
- Group related endpoints in one router file; keep each router under 200 lines
- Use `APIRouter(dependencies=[Depends(require_auth)])` to protect all routes in a router at once
- Version APIs with prefix: `/api/v1/`, `/api/v2/`

## Anti-Patterns

- Never use global mutable state (module-level dicts, lists) for shared data — use a database or cache
- Never use `response_model=None` to skip validation — define a proper response schema
- Never import `app` into sub-modules — use dependency injection to pass context
- Never catch `Exception` broadly in route handlers — handle specific exceptions with specific status codes
- Never run database migrations inside route handlers or startup events in production — use Alembic CLI

## When to invoke

`Skill({ skill: "fastapi-pro" })` for FastAPI project setup, async patterns, and API design tasks
