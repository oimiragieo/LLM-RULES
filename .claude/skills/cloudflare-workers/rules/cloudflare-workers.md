# cloudflare-workers Rules

## Purpose

Build Cloudflare Workers applications with Durable Objects, KV, R2, D1, Workers AI.

## Best Practices

- Use state.acceptWebSocket() for hibernation API
- Never store secrets in wrangler.toml vars
- Never use ws.accept() for Durable Object WebSockets
- Run wrangler types after editing wrangler.toml
- Use ctx.waitUntil() for non-blocking background work

## Storage Tiers

- KV: Config, feature flags, cached data (eventual consistency)
- R2: Files, images, large objects (strong consistency)
- D1: Relational data, queries (strong consistency)
- DO Storage: Per-entity state, coordination

## Integration Points

See SKILL.md for complete documentation.
