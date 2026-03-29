# Cloudflare Workers Research Requirements (2026)

## Verified Tech Stack

- **Runtime**: V8 isolates (Edge)
- **CLI**: wrangler
- **Languages**: JavaScript, TypeScript
- **Bindings**: KV, R2, D1, Durable Objects, Workers AI, AI Gateway

## Storage Patterns

### KV Namespace

- Eventual consistency (~60s propagation)
- Best for reads, avoid write-heavy workloads
- 1000 reads/second soft limit per worker

### R2 Bucket

- S3-compatible object storage
- Strong consistency
- No egress fees

### D1 Database

- SQLite at the edge
- Strong consistency
- Batch writes for efficiency

### Durable Objects

- Stateful coordination
- WebSocket hibernation
- SQLite-backed storage (2025 default)

## Source References

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- [Durable Objects](https://developers.cloudflare.com/durable-objects/)
