# /telegram-polling

Use this skill to review or design a Telegram polling relay.

Checklist:

1. Verify `TELEGRAM_BOT_TOKEN` and allowlist configuration.
2. Confirm `heartbeat` and `CronCreate` coverage for the poller.
3. Review `telegram-offset.json` and session storage paths.
4. Confirm final-only `sendMessage` behavior and `429` retry handling.
