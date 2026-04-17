# Telegram Polling Research Requirements

- Check official Telegram Bot API guidance for `getUpdates` and `sendMessage`.
- Confirm long-poll timeout and `429` retry expectations before changing the loop.
- Review local heartbeat supervision patterns before introducing new schedulers.
- Preserve `SE-02` safe parsing rules for any persisted Telegram state.
