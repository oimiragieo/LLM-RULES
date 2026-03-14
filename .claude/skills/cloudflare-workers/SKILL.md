---
name: cloudflare-workers
description: Cloudflare Workers edge computing — Durable Objects, KV, R2, D1, Workers AI, AI Gateway
version: 1.0.0
model: sonnet
invoked_by: agent
user_invocable: false
tools: [Read, Write, Edit, Bash]
agents: [developer, devops]
category: 'DevOps & Infrastructure'
tags: [cloudflare, workers, edge, durable-objects, kv, r2, d1, ai-gateway, workers-ai, wrangler]
---

# Cloudflare Workers Skill

## Purpose

Expert patterns for building Cloudflare Workers applications including Durable Objects for stateful coordination, KV/R2/D1 storage tiers, Workers AI inference, and AI Gateway for LLM routing.

## When to Invoke

`Skill({ skill: 'cloudflare-workers' })`

Invoke when:

- Building or debugging Cloudflare Workers scripts
- Designing Durable Object state coordination
- Choosing between KV, R2, and D1 storage
- Integrating Workers AI or AI Gateway
- Configuring wrangler.toml bindings

---

## Core Primitives

### Workers Script Structure

```typescript
export interface Env {
  MY_KV: KVNamespace;
  MY_R2: R2Bucket;
  MY_D1: D1Database;
  MY_DO: DurableObjectNamespace;
  AI: Ai;
  AI_GATEWAY_ID: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Route to Durable Object for stateful operations
    if (url.pathname.startsWith('/room/')) {
      const id = env.MY_DO.idFromName(url.pathname);
      const stub = env.MY_DO.get(id);
      return stub.fetch(request);
    }

    return new Response('OK');
  },
};
```

### Durable Objects

Use Durable Objects for stateful coordination, real-time collaboration, and rate limiting:

```typescript
export class RoomDO implements DurableObject {
  private sessions: Map<WebSocket, { id: string }> = new Map();
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    // Restore hibernated WebSockets on wake
    this.state.getWebSockets().forEach(ws => {
      this.sessions.set(ws, ws.deserializeAttachment());
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      // Use hibernation API — do NOT call accept() for hibernatable sockets
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ id: crypto.randomUUID() });
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('Expected WebSocket', { status: 426 });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Broadcast to all connected sessions
    this.sessions.forEach((_, session) => {
      if (session !== ws && session.readyState === WebSocket.READY_STATE_OPEN) {
        session.send(message);
      }
    });
  }

  webSocketClose(ws: WebSocket): void {
    this.sessions.delete(ws);
  }

  // Persistent storage via transactional SQL
  async persistState(key: string, value: unknown): Promise<void> {
    await this.state.storage.put(key, value);
  }
}
```

**Durable Object Rules:**

- Use `state.acceptWebSocket()` (hibernation API) instead of `ws.accept()` — saves CPU costs during idle periods
- Use `state.storage.transaction()` for atomic multi-key writes
- One DO instance per logical entity (room, user session, rate limit bucket)
- DO IDs from `idFromName()` are deterministic — same name always routes to same instance
- Never store large blobs in DO storage — use R2 instead, store only the key reference

### Storage Tiers

| Storage    | Use Case                           | Consistency     | Latency   |
| ---------- | ---------------------------------- | --------------- | --------- |
| KV         | Config, feature flags, cached data | Eventual (60s)  | ~1ms read |
| R2         | Files, images, large objects       | Strong          | ~10ms     |
| D1         | Relational data, queries           | Strong          | ~5ms      |
| DO Storage | Per-entity state, coordination     | Strong (per-DO) | ~1ms      |

```typescript
// KV — best for reads, not writes
const value = await env.MY_KV.get('config:feature-flags', 'json');
await env.MY_KV.put('session:abc', JSON.stringify(data), { expirationTtl: 3600 });

// R2 — S3-compatible object storage
const object = await env.MY_R2.get('uploads/image.png');
if (object) {
  return new Response(object.body, {
    headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
  });
}
await env.MY_R2.put('uploads/image.png', request.body, {
  httpMetadata: { contentType: 'image/png' },
});

// D1 — SQLite at the edge
const { results } = await env.MY_D1.prepare('SELECT * FROM users WHERE id = ?').bind(userId).all();

// Batch D1 writes for efficiency
await env.MY_D1.batch([
  env.MY_D1.prepare('INSERT INTO events (type, ts) VALUES (?, ?)').bind('click', Date.now()),
  env.MY_D1.prepare('UPDATE counters SET n = n + 1 WHERE key = ?').bind('clicks'),
]);
```

### Workers AI

```typescript
// Text generation
const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: prompt },
  ],
  max_tokens: 512,
  stream: true,
});

// Return streaming response directly
return new Response(response as ReadableStream, {
  headers: { 'Content-Type': 'text/event-stream' },
});

// Embeddings
const { data } = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
  text: [document1, document2],
});
const embeddings = data; // Float32Array[]

// Image classification
const result = await env.AI.run('@cf/microsoft/resnet-50', {
  image: [...new Uint8Array(await request.arrayBuffer())],
});
```

### AI Gateway

Route LLM requests through AI Gateway for caching, rate limiting, and observability:

```typescript
// Use AI Gateway endpoint instead of direct provider URL
const gatewayUrl = `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/openai`;

const response = await fetch(`${gatewayUrl}/chat/completions`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
    // Optional: cache control
    'cf-aig-cache-ttl': '3600',
    'cf-aig-skip-cache': 'false',
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
  }),
});

// AI Gateway supports multiple providers in one config
// openai, anthropic, google-ai-studio, azure-openai, workers-ai
```

---

## Deployment

### wrangler.toml

```toml
name = "my-worker"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

# KV namespace binding
[[kv_namespaces]]
binding = "MY_KV"
id = "abc123..."
preview_id = "def456..."

# R2 bucket binding
[[r2_buckets]]
binding = "MY_R2"
bucket_name = "my-bucket"
preview_bucket_name = "my-bucket-dev"

# D1 database binding
[[d1_databases]]
binding = "MY_D1"
database_name = "my-db"
database_id = "ghi789..."

# Durable Object binding + migration
[[durable_objects.bindings]]
name = "MY_DO"
class_name = "RoomDO"

[[migrations]]
tag = "v1"
new_classes = ["RoomDO"]

# Workers AI binding
[ai]
binding = "AI"

# Environment variables (non-secret)
[vars]
AI_GATEWAY_ID = "my-gateway"

# Secrets set via: wrangler secret put SECRET_NAME
```

### CLI Commands

```bash
# Development
wrangler dev                          # Local dev server
wrangler dev --remote                 # Dev against production bindings

# Deployment
wrangler deploy                       # Deploy to production
wrangler deploy --env staging         # Deploy to staging environment

# Type generation (ALWAYS run after editing wrangler.toml/wrangler.jsonc)
wrangler types                        # Generates worker-configuration.d.ts — never hand-write Env interface

# Storage management
wrangler kv:key put --binding MY_KV "key" "value"
wrangler kv:key get --binding MY_KV "key"
wrangler r2 object put my-bucket/path/file.txt --file ./local-file.txt
wrangler d1 execute my-db --file ./migrations/001.sql
wrangler d1 execute my-db --command "SELECT * FROM users LIMIT 5"

# Secrets
wrangler secret put OPENAI_API_KEY    # Prompts for value
wrangler secret list

# Durable Objects
wrangler durable-objects migrate apply  # Apply pending migrations

# Logs and observability
wrangler tail                         # Stream live logs from production
wrangler tail --format pretty
wrangler tail --json                  # Structured JSON log stream for analysis
```

---

## Performance Patterns

```typescript
// Use ctx.waitUntil() for non-blocking background work
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const response = await handleRequest(request, env);

    // Fire-and-forget: analytics, cache warm, audit logging
    ctx.waitUntil(logAnalytics(request, response, env));

    return response;
  },
};

// Stream large bodies — never buffer fully into memory
async function streamBody(request: Request, env: Env): Promise<Response> {
  const { readable, writable } = new TransformStream();
  // Pipe without buffering — stays within 128MB Worker limit
  request.body?.pipeTo(writable);
  return new Response(readable);
}
```

**Durable Objects with SQLite (2025 default):**

New Durable Objects should use the SQL API for storage — SQLite-backed DOs provide relational queries, indexes, and transactions:

```typescript
export class RoomDO implements DurableObject {
  private sql: SqlStorage;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.sql = state.storage.sql;
    // Create tables on first initialization
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, ts INTEGER, body TEXT)`
    );
  }

  async addMessage(body: string): Promise<void> {
    this.sql.exec('INSERT INTO messages (ts, body) VALUES (?, ?)', Date.now(), body);
  }

  async getMessages(): Promise<{ id: number; ts: number; body: string }[]> {
    return [...this.sql.exec('SELECT * FROM messages ORDER BY ts DESC LIMIT 50')];
  }
}
```

---

## Observability

Enable Workers Logs and Traces before any production deployment:

```toml
# wrangler.toml
[observability]
enabled = true
head_sampling_rate = 1  # 0.0–1.0; reduce for high-volume workers
```

```typescript
// Structured logging — searchable in Workers dashboard
console.log(JSON.stringify({ level: 'info', requestId: crypto.randomUUID(), path: url.pathname }));
console.error(JSON.stringify({ level: 'error', message: err.message, stack: err.stack }));
```

**Never use `passThroughOnException()`** — it hides bugs. Use explicit try/catch with structured error responses.

---

## Anti-Patterns

- **Never use `setTimeout`/`setInterval`** in Workers — use Cron Triggers or Durable Object alarms instead
- **Never store secrets in wrangler.toml vars** — use `wrangler secret put` for sensitive values
- **Never use `ws.accept()`** for Durable Object WebSockets — use `state.acceptWebSocket()` for hibernation
- **Never read KV in hot loops** — KV has a 1000 reads/second soft limit per worker; cache in memory for the request lifetime
- **Never write to D1 on every request** — batch writes or use a queue (Workers Queue) for high-throughput write paths
- **Never exceed 128MB script size** — keep Workers bundles lean; offload large assets to R2
- **Never rely on in-memory state between requests** — Workers are stateless; use KV/D1/DO for persistence
- **Never store request-scoped data in module-level variables** — isolates reuse across requests causing data leaks; pass state via function arguments
- **Never use `passThroughOnException()`** — it hides bugs silently; use explicit try/catch blocks
- **Never hand-write the `Env` interface** — run `wrangler types` to generate it from your actual config
- **Never use `Math.random()` for security tokens** — use `crypto.randomUUID()` or `crypto.getRandomValues()`

---

## Testing

```typescript
// Use Vitest + @cloudflare/vitest-pool-workers for unit tests
import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Worker', () => {
  it('responds with 200', async () => {
    const response = await SELF.fetch('https://example.com/');
    expect(response.status).toBe(200);
  });

  it('reads from KV', async () => {
    await env.MY_KV.put('test-key', 'test-value');
    const response = await SELF.fetch('https://example.com/kv/test-key');
    expect(await response.text()).toBe('test-value');
  });
});
```

```bash
# Run tests
pnpm vitest run

# Run with Cloudflare runtime (recommended)
pnpm vitest run --pool @cloudflare/vitest-pool-workers
```

---

## Related Skills

- `devops` — CI/CD pipeline configuration for Cloudflare deployments
- `terraform-infra` — Cloudflare Terraform provider for infrastructure-as-code
- `database-expert` — D1 schema design and query optimization
- `container-expert` — Cloudflare Containers (complementary to Workers)

---

## Search Protocol

Before starting any Cloudflare Workers task, search for existing wrangler configs and worker scripts:

```bash
pnpm search:code "wrangler OR DurableObject OR KVNamespace OR R2Bucket"
pnpm search:code "cloudflare workers"
```

Use `Skill({ skill: 'ripgrep' })` for fast search across `.toml` and `.ts` files. Use `Skill({ skill: 'code-semantic-search' })` to find similar edge function patterns.

---

## Memory Protocol (MANDATORY)

**Before starting any task, you must query semantic memory and read recent static memory:**

```bash
node .claude/lib/memory/memory-search.cjs "cloudflare workers durable objects KV R2 D1"
```

Read `.claude/context/memory/learnings.md`
Read `.claude/context/memory/decisions.md`

Check for Cloudflare-specific gotchas (wrangler version issues, D1 migration quirks, DO hibernation bugs, SQLite API changes).

**After completing work, record findings:**

- Cloudflare Workers gotchas or undocumented behavior -> Append to `.claude/context/memory/issues.md`
- Storage tier decisions (KV vs D1 vs DO) -> Update `.claude/context/memory/decisions.md`
- Wrangler version-specific issues -> Append to `.claude/context/memory/learnings.md`

**During long tasks:** Use `.claude/context/memory/active_context.md` as scratchpad.

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
