# Supabase Rules

## Auth and OAuth

- Always use `supabase.auth.signInWithOAuth({ provider })` for social logins — never implement custom OAuth flows
- Set `redirectTo` to an explicit callback URL; never rely on the default redirect which differs between environments
- Store only the JWT from `session.access_token` in app state; never store `refresh_token` in localStorage (use `supabase-js` session management)
- Use `supabase.auth.onAuthStateChange` to reactively update auth context — do not poll `getSession()`
- Enable email confirmation for production deployments; disable only in development with explicit env flag

## Row Level Security (RLS)

- Enable RLS on every table that stores user data: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY`
- Write explicit policies for SELECT, INSERT, UPDATE, DELETE — do not rely on "no policy = deny all" as a security assumption
- Use `auth.uid()` (not `auth.role()`) in policies to scope rows to the authenticated user
- Test policies with `SET LOCAL role = 'authenticated'; SET LOCAL request.jwt.claims = '{"sub": "<uuid>"}'` in psql
- Never grant `anon` role INSERT or UPDATE on user-data tables; always require authenticated role

## Edge Functions

- Place Edge Functions in `supabase/functions/<function-name>/index.ts`; Deno runtime — use `https://deno.land/x/` imports
- Always return a `Response` with explicit `Content-Type` header; missing content-type causes client parse errors
- Use `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` only in server-side functions; never expose it to client bundles
- Set a `verify_jwt = false` flag only for public webhooks; all user-facing functions must verify JWT
- Handle CORS explicitly: return `OPTIONS` preflight response before processing the request body

## Realtime

- Use `supabase.channel('<name>').on('postgres_changes', ...)` for database change subscriptions
- Always call `.subscribe()` and capture the returned subscription for cleanup — missing cleanup causes connection leaks
- Unsubscribe on component unmount: `supabase.removeChannel(channel)`
- Use presence (`channel.track(...)`) for ephemeral state like online users; do not store presence data in the database
- Enable Realtime only on tables that require it — each enabled table adds replication overhead

## Storage

- Create buckets with explicit public/private settings; private buckets require signed URLs for every download
- Use `supabase.storage.from('<bucket>').upload(path, file, { upsert: false })` — set `upsert: true` only for intentional overwrites
- Generate signed URLs with short TTL (≤3600s) for sensitive files; never use `getPublicUrl()` for private content
- Validate file type and size on the client before uploading; Storage does not enforce MIME type by default
- Organize files as `<user-id>/<filename>` to make RLS storage policies straightforward

## Anti-Patterns

- Never call `supabase.from(<table>).select(*)` without RLS enabled — returns all rows to all users
- Never hardcode `SUPABASE_SERVICE_ROLE_KEY` in client-side code or public repos
- Never skip `await` on Supabase async calls; unhandled promise rejections hide auth and network errors
- Never use `eq('id', userId)` as the sole auth check in app code — rely on RLS policies in the database
- Never disable RLS "temporarily" for debugging in a production schema — use a separate test project

## When to invoke

`Skill({ skill: 'database-expert' })` for Supabase schema design, RLS policy authoring, and Edge Function development
