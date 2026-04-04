---
description: Restart the Telegram channel daemon without killing the Claude session
disable-model-invocation: true
---

Run the following command and report the output to the user:

```bash
node scripts/channels/telegram-ctl.cjs restart
```

If the restart succeeds, confirm with the status output. If it fails, show the error and suggest checking `.env` for `TELEGRAM_BOT_TOKEN`.
