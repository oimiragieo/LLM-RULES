# telegram-polling Skill Workflow

1. Verify Telegram configuration, pairing, and allowlist state.
2. Confirm heartbeat registration through `CronCreate`.
3. Validate offset/session persistence and `429` retry handling.
4. Route inbound messages, then emit final-only replies through `sendMessage`.
