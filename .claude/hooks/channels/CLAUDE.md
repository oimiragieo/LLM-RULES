# hooks/channels/

Hooks for launching and managing the Telegram channel daemon.

## Files

### `telegram-start.cjs`
Daemon launcher hook. Loads `.env` for config, checks if daemon is already running (PID file + HTTP health check), then launches the channel daemon as a hidden background process via PowerShell `Start-Process -WindowStyle Hidden`. Writes a bat launcher that sets env vars (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_HEADLESS_SESSION`, `ANTHROPIC_API_KEY`) and runs `node scripts/channels/daemon/index.cjs`. Called by the `/enable-telegram` skill.

## _archive/

### `_archive/channel-auto-start.cjs`
**Archived.** The original 326-line launcher that used VBScript + BAT + WMI PID tracking to spawn a separate Claude session with `--dangerously-load-development-channels` and auto-accept the confirmation dialog. Replaced by the daemon architecture which doesn't need a separate Claude session.
