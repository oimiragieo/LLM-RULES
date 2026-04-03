---
name: disable-telegram
description: Stop the Telegram channel daemon.
version: 2.0.0
category: infrastructure
trigger: when user says /disable-telegram, "stop telegram", "disable telegram", "kill telegram"
tools: [Agent]
tags: [telegram, monitoring, stop, daemon]
invoked_by: user
user_invocable: true
error_handling: graceful
verified: true
---

# Disable Telegram

Spawn a developer agent to stop the daemon:

```
subagent_type: developer
prompt: Run this command and report the output: node scripts/channels/telegram-ctl.cjs stop
```

After the agent reports, tell the user: "Telegram monitoring stopped. Run /enable-telegram to start again."
