# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Platform
- Primary: Windows 10 (10.0.26200)
- Node.js available via pnpm
- 128GB RAM, 16 logical processors
- WSL available but init.sh has known path issues
- On this workstation, running `.factory/init.sh` through WSL/bash resolves `pnpm` to a Linux Node runtime that is too old for the installed pnpm (`SyntaxError` at optional chaining in `pnpm.cjs`); prefer native Windows `pnpm` commands until M5 fixes init/bootstrap compatibility.

## Key Environment Variables
- `HIERARCHICAL_ROUTING` — `on`/`off` to enable/disable hierarchical routing (default: off)
- `CHANNEL_AUTO_START` — `true` to auto-start Telegram channel session
- `A2A_AUTO_START` — `true` to auto-start A2A server (port 3100)
- `TELEGRAM_BOT_TOKEN` — Required for Telegram integration
- `REFLECTION_SEMANTIC_READ` — `off` to disable semantic prior learnings in reflection

## External Services
- Ollama on localhost:11434 (do not modify)
