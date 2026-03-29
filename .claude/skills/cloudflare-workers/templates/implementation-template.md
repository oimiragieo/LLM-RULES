# cloudflare-workers Implementation Template

## Goal

- Create or update Cloudflare Worker
- Configure bindings (KV, R2, D1, Durable Objects)

## TDD

1. Write worker script with TypeScript
2. Configure wrangler.toml bindings
3. Run wrangler types for type generation

## Verification

- wrangler deploy succeeds
- Worker responds to requests
- Logs are observable
