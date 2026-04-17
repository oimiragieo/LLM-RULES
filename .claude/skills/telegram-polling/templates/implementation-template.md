# Telegram Polling Implementation Template

## Inputs

- Bot token source:
- Allowlist or pairing source:
- Offset file path:
- Session file path:

## Loop

1. Start heartbeat-managed scheduler.
2. Read offset with `safeParseJSON`.
3. Poll `getUpdates`.
4. Route message.
5. Send final response with `sendMessage`.
6. Persist offset and session state.

## Failure Handling

- `429` retry strategy:
- restart policy:
- audit trail:
