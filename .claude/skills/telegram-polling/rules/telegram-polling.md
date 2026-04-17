# Telegram Polling Rules

- Use `getUpdates` polling only when webhook delivery is unavailable or undesirable.
- Persist `offset` and `session` state so the loop can resume after restarts.
- Enforce pairing or allowlist checks before any downstream agent work.
- Emit only final replies to Telegram via `sendMessage`.
- Back off on `429` responses and keep the loop under heartbeat supervision.
