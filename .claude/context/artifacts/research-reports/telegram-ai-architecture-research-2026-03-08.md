<!-- Agent: researcher | Task: #40 | Session: 2026-03-08 -->

# Research Report: Telegram AI Agent Architecture

**Date**: 2026-03-08
**Researcher**: researcher agent
**Task**: #40
**Sources Consulted**: 8

---

## Executive Summary

Telegram Bot API provides a mature, well-documented interface for AI agent integration. Production patterns use webhook-based message ingestion, session state stored per `chat_id`, async typing indicators with 5s keepalive loops, and a two-step file download process (getFile → construct download URL). Username mentions use `@username` text format with optional HTML/Markdown parse_mode; owner authentication is typically done via `chat_id` or `user_id` env var (not username), since usernames are optional and mutable in Telegram.

---

## Research Methodology

### Search Queries Executed

| # | Query | Source | Results Found |
|---|-------|--------|---------------|
| 1 | telegram bot AI agent interface best practices 2024 2025 LLM chat architecture session state | WebSearch | 10 |
| 2 | telegram bot file download process AI agent getFile API file_id handling | WebSearch | 10 |
| 3 | telegram bot rate limiting queue management async response typing indicator sendChatAction | WebSearch | 10 |
| 4 | telegram bot mention username TELEGRAM_OWNER_USERNAME env var bot API owner configuration | WebSearch | 10 |
| 5 | grammY file handling documentation (deep-dive) | WebFetch | grammy.dev/guide/files |

### Sources Consulted

| # | Title | Type | URL |
|---|-------|------|-----|
| 1 | grammY File Handling Guide | Official Docs | https://grammy.dev/guide/files |
| 2 | grammY Flood/Rate Limits Guide | Official Docs | https://grammy.dev/advanced/flood |
| 3 | python-telegram-bot AIORateLimiter | Official Docs | https://docs.python-telegram-bot.org/en/v22.0/telegram.ext.aioratelimiter.html |
| 4 | Telegram Bot SDK getFile Reference | API Docs | https://telegram-bot-sdk.readme.io/reference/getfile |
| 5 | Telegram Core Files API | Official Docs | https://core.telegram.org/api/files |
| 6 | Cloudflare Workers Telegram Bot (production example) | Article | https://medium.com/@michael.rhema/building-a-production-ready-telegram-bot-with-ai-agent-integration-on-cloudflare-workers-0b40543398fb |
| 7 | n8n AI Telegram Bot Workflow | Community | https://n8n.io/workflows/4457-ai-telegram-bot-agent-smart-assistant-and-content-summarizer/ |
| 8 | sendChatAction API Reference | API Docs | https://telegram-bot-sdk.readme.io/reference/sendchataction |

---

## Detailed Findings

### Topic 1: Telegram Chat → LLM → Reply Loop

**Key Insights:**

- **Webhook over polling** is the production standard. Cloudflare Workers + webhook achieves ~72ms total message processing latency; long-polling is only acceptable for local dev.
- **Message processing loop**: receive Update → extract `message.text` (or `message.caption` for media) → load session context → call LLM with full context → send reply. The bot token goes in the Authorization header or URL path.
- **Framework choices**: grammY (TypeScript/JS, best async design), python-telegram-bot v22+ (Python, async-native), Telegraf (JS, older but widely used). All support middleware-based message pipelines.
- **Async response pattern**: Send `sendChatAction("typing")` immediately on message receipt, then kick off async LLM call. The typing indicator must be refreshed every ~3 seconds (it expires at 5s). Stop the keepalive once the LLM reply is sent.
- **Error handling**: wrap the LLM call in try/catch; send a user-friendly error message on failure; log structured errors for debugging.

**Evidence:**
Production deployment on Cloudflare Workers uses webhook endpoint → KV namespace for session → OpenAI API call → sendMessage reply. Total latency ~72ms excluding LLM inference time.

**Relevance:**
The chat→LLM→reply loop is the core of any Telegram AI agent. The webhook + async pattern is mandatory for production scale.

---

### Topic 2: Session State Management

**Key Insights:**

- **Key**: Use `chat_id` as the primary session key (not `user_id`) because group chats share one `chat_id` across all members.
- **What to store per session**:
  - Conversation history (list of `{role, content}` objects for LLM context window)
  - User preferences (language, verbosity level)
  - Last active timestamp (for TTL/expiry)
  - File processing state (pending/in-progress/done)
- **Storage options** (in order of preference for production):
  1. Redis/Upstash — fast, TTL support, atomic ops
  2. Cloudflare KV — ideal for Workers deployments
  3. SQLite/PostgreSQL — for self-hosted, persistent history
  4. In-memory dict — dev only, lost on restart
- **Context window management**: Trim conversation history to last N messages (e.g., last 20) before sending to LLM to avoid exceeding token limits.
- **Group chat sessions**: Privacy mode must be disabled for bots to receive all messages in groups. In groups, filter by `message.reply_to_message` or `@bot_mention` to avoid responding to every message.

**Evidence:**
grammY's session plugin and python-telegram-bot's `ConversationHandler` both use `chat_id` as the session key by default.

---

### Topic 3: File Handling — receive file_id → download → process

**Key Insights:**

- **Two-step download process**:
  1. Call `getFile(file_id)` → returns a `File` object with `file_path` (temporary server-side path, valid ~1 hour)
  2. Construct download URL: `https://api.telegram.org/file/bot<token>/<file_path>`
  3. HTTP GET the URL to retrieve file bytes

- **File size limits** (Bot API):
  - Download: 20 MB maximum
  - Upload (sendDocument etc.): 50 MB standard
  - Self-hosted Bot API server: up to 4 GB with Telegram Premium

- **file_id vs file_unique_id**:
  - `file_id`: bot-specific, can change across restarts; use for immediate operations
  - `file_unique_id`: stable across bots and time; use as persistent storage key

- **For AI agent file ingestion pattern**:
  1. Receive message with document/photo/audio
  2. Store `file_unique_id` as the processing key in session
  3. Call `getFile(file_id)` to get download URL (valid 1 hour)
  4. Stream download to avoid holding 20MB in memory
  5. Extract text (OCR for images, pypdf/pdfplumber for PDFs, whisper for audio)
  6. Chunk extracted text (e.g., 512-token chunks with 50-token overlap)
  7. Store chunks in vector DB keyed by `file_unique_id`
  8. Confirm to user: "File processed. Ask me anything about it."

- **Download URL expiry**: The link is guaranteed valid for at least 1 hour. Re-call `getFile` to refresh if needed.

**Evidence:**
grammY docs: "Bots only receive file identifiers. If they want to obtain file contents, they must request them explicitly." File download via `await file.download()` streams directly without full in-memory buffering.

---

### Topic 4: Rate Limiting and Queue Management

**Key Insights:**

- **Telegram Bot API rate limits**:
  - Per-chat: max 1 message/second (API allows short bursts above this)
  - Bulk broadcasts: max 30 messages/second total
  - Violation response: HTTP 429 with `retry_after` field (seconds to wait)

- **Recommended queue patterns**:
  - Use separate queues for individual chats vs. bulk notifications
  - Implement exponential backoff on 429 errors: `wait(retry_after * 1000)`
  - For LLM-backed bots, throttle by chat_id to prevent queue pile-up while LLM is processing
  - Libraries: BullMQ (Node.js), Celery (Python) for queue management; gramio has built-in rate limit handling

- **sendChatAction ("typing") keepalive pattern**:
  ```
  on message receipt:
    sendChatAction("typing")
    start interval: every 3s → sendChatAction("typing")
    await LLM response
    clearInterval()
    sendMessage(reply)
  ```
  - Use `upload_document` / `upload_photo` chat actions when processing files
  - Always clear the interval on error to prevent infinite typing indicator

- **Concurrent request handling**: Process one message per chat sequentially to avoid race conditions on session state. Use a per-chat mutex/lock pattern.

**Evidence:**
gramio docs: "Avoid sending more than one message per second [to a chat]. The API may allow short bursts... eventually you'll begin receiving 429 errors."
n8n community: Typing action must be sent in a loop during LLM processing to maintain the indicator.

---

### Topic 5: Username Mentions and Owner Authentication

**Key Insights:**

- **Mentioning users in Telegram messages**:
  - Format 1 (text mention, works always): Send HTML/Markdown with `<a href="tg://user?id={user_id}">Display Name</a>`
  - Format 2 (@username mention): Simply include `@username` in message text — Telegram clients auto-link it. Only works if the user has a username set (it's optional in Telegram).
  - The Bot API user object has an optional `username` field (prefixed with `@` in convenience properties)

- **TELEGRAM_OWNER_USERNAME env var pattern**:
  - Not a standard Bot API concept — it's an application-level pattern
  - Common implementations store `TELEGRAM_OWNER_CHAT_ID` (numeric ID) as the env var, NOT username, because:
    - Usernames are optional (users can have no username)
    - Usernames can change (user_id is immutable)
    - Comparing `user_id` is O(1) and reliable; `username` comparison requires string matching and may fail if user has no username
  - To implement owner-only commands: check `message.from.id == parseInt(TELEGRAM_OWNER_CHAT_ID)`
  - If username env var is used for human readability, always also check by `user_id` at runtime

- **Notification pattern for owner**: Store owner's `chat_id` in env, then call `sendMessage(TELEGRAM_OWNER_CHAT_ID, "alert text")` to DM the owner directly.

**Evidence:**
python-telegram-bot docs: User object has `username: Optional[str]`. GitHub issue #476 confirms username is optional and may not be set for all users.
node-telegram-bot-api issue #1226: Mentioning by username is done by including `@username` in text or using HTML inline mention with user_id.

---

## Academic References

No academic papers found directly applicable to Telegram bot architecture. The domain is primarily documented through official API docs and practitioner articles.

---

## Practical Recommendations

| Priority | Recommendation | Rationale |
|----------|---------------|-----------|
| P0 | Use `chat_id` as session key, not `user_id` | Group chats require `chat_id`; users may have no `user_id` exposed |
| P0 | Use `TELEGRAM_OWNER_CHAT_ID` (numeric) not username | Usernames are optional and mutable; `user_id` is immutable |
| P0 | Two-step file download: `getFile` then stream download URL | Bot API design; link valid ~1 hour; stream to avoid 20MB RAM spike |
| P0 | sendChatAction keepalive loop every 3s during LLM processing | Typing indicator expires at 5s; must refresh to maintain UX |
| P1 | Store `file_unique_id` as persistent file key (not `file_id`) | `file_id` may change; `file_unique_id` is stable across sessions |
| P1 | Chunk extracted file content (512-token chunks, 50-token overlap) for vector storage | Standard RAG chunking for retrieval quality |
| P1 | Per-chat sequential message processing (mutex/lock) | Prevents session state race conditions |
| P1 | Respect 1 msg/sec per-chat rate limit; implement 429 exponential backoff | Avoid API bans; retry_after field gives exact wait time |
| P2 | Use webhook over polling for production | ~72ms processing latency vs polling delay; required for scale |
| P2 | Trim conversation history to last 20 messages before LLM call | Manage context window budget; avoid token limit errors |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| file_id expiry during processing | Medium — download fails | Medium — link valid ~1 hour | Cache `file_path` URL and refresh via `getFile` if expired |
| Username-based owner auth fails | High — owner commands blocked | High — users can have no username | Always use `user_id` / `chat_id` for auth; username is display-only |
| Typing indicator not cleared on error | Low UX — infinite typing indicator | Medium | Wrap LLM call in try/finally; always clear keepalive interval |
| Session state race condition in groups | Medium — duplicate LLM calls | Medium in active groups | Per-chat mutex/lock; process messages sequentially per chat |
| 429 rate limit during bulk ops | High — messages dropped | High without throttling | Separate queue per chat; exponential backoff; 30 msg/s global cap |
| 20MB file size limit | Medium — large files rejected | Low-Medium | Check file size before getFile; inform user of limit upfront |

---

## Implementation Roadmap

1. **Core message loop**: webhook endpoint → extract chat_id + text → load session → LLM call with typing keepalive → send reply
2. **Session storage**: Redis keyed by chat_id; store last 20 messages + user preferences
3. **File handling**: on document/photo message → getFile → stream download → text extraction → chunk → vector store keyed by file_unique_id
4. **Owner auth**: `TELEGRAM_OWNER_CHAT_ID` env var (numeric); check `message.from.id == ownerId`
5. **Rate limiting**: per-chat queue with 1 msg/s limit; global 30 msg/s cap for broadcasts; 429 exponential backoff
6. **Typing indicator**: send on receipt, refresh every 3s, clear in finally block after reply sent
