---
name: reddit-researcher
version: 1.0.0
description: Search and read public Reddit posts, subreddits, and comments via the unauthenticated JSON API. Safe read-only access with SSRF-prevention hostname allowlist.
category: integration
trigger: when user wants to research Reddit discussions, find posts in a subreddit, search Reddit for topics, read Reddit comments, or gather community sentiment from Reddit
tools: [WebFetch, WebSearch]
dependencies: []
tags: [reddit, research, social-media, integration, read-only, public-api]
model: sonnet
invoked_by: both
user_invocable: true
error_handling: graceful
verified: false
---

<!-- Agent: nodejs-pro | Task: #7 | Session: 2026-03-09 -->

# Reddit Researcher Skill

## Purpose

Fetch and analyze public Reddit content without authentication using the Reddit public JSON API. Enables research agents to read subreddit posts, search Reddit globally or within a subreddit, and fetch individual post comments — all through the stable `.json` endpoint pattern.

**No API key. No OAuth. No registration.** Reddit's public JSON API is accessible anonymously for read-only operations.

---

## When to Use

- Researching community sentiment on a topic
- Finding relevant discussions in a specific subreddit
- Gathering examples, opinions, or use cases from Reddit
- Monitoring a subreddit for recent posts
- Fetching comments on a specific post for analysis

---

## Iron Laws

1. **ALWAYS validate Reddit URLs against the allowlist before WebFetch** — only `reddit.com`, `www.reddit.com`, and `old.reddit.com` are permitted; reject anything else to prevent SSRF attacks.
2. **ALWAYS append `.json` to Reddit URLs before fetching** — never fetch HTML pages; the `.json` suffix returns structured data that can be parsed reliably.
3. **ALWAYS include a User-Agent header** — Reddit blocks requests without a proper User-Agent; use `agent-studio-reddit-researcher/1.0`.
4. **NEVER make more than 10 WebFetch calls per minute** — unauthenticated rate limit is 10 req/min; add 1-2 second delays for multi-call workflows; search endpoints are more restrictive (~3-5 req/min).
5. **NEVER write to Reddit** — this skill is strictly read-only; no POST requests, no upvoting, no commenting, no authentication flows.

---

## API Reference

| Endpoint                                                             | Description             | Notes                             |
| -------------------------------------------------------------------- | ----------------------- | --------------------------------- |
| `https://www.reddit.com/r/{sub}.json`                                | Hot posts in subreddit  | Default sort: hot                 |
| `https://www.reddit.com/r/{sub}/hot.json`                            | Hot posts (explicit)    |                                   |
| `https://www.reddit.com/r/{sub}/new.json`                            | New posts               |                                   |
| `https://www.reddit.com/r/{sub}/top.json?t=week`                     | Top posts by time       | t=hour/day/week/month/year/all    |
| `https://www.reddit.com/r/{sub}/about.json`                          | Subreddit metadata      | subscriber count, description     |
| `https://www.reddit.com/search.json?q={query}`                       | Global search           |                                   |
| `https://www.reddit.com/r/{sub}/search.json?q={query}&restrict_sr=1` | Subreddit-scoped search |                                   |
| `https://www.reddit.com/r/{sub}/comments/{id}.json`                  | Post with comments      | Returns array[2]: post + comments |

**Query Parameters:**

- `limit` — number of results (max 100, default 25; keep at 25 or less to stay within rate limits)
- `after` / `before` — pagination cursors (`t3_postid` format)
- `t` — time filter for `/top`: `hour`, `day`, `week`, `month`, `year`, `all`
- `restrict_sr=1` — restrict search to current subreddit

**Required Headers:**

```
User-Agent: agent-studio-reddit-researcher/1.0
```

---

## SSRF Guard Pattern

Always validate URLs using `new URL().hostname` before passing to WebFetch. Do not use regex or string-contains matching — those fail on encoded URLs and normalization tricks.

```javascript
const ALLOWED_REDDIT_HOSTS = new Set(['reddit.com', 'www.reddit.com', 'old.reddit.com']);

function validateRedditUrl(href) {
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https allowed');
  }
  if (!ALLOWED_REDDIT_HOSTS.has(parsed.hostname)) {
    throw new Error(`Hostname ${parsed.hostname} not in allowlist`);
  }
  return parsed.href;
}
```

**Additional blocks (OWASP-recommended):**

- Block `file://`, `gopher://`, `dict://` schemes
- Block `127.0.0.1`, `localhost`, `0.0.0.0`
- Block `169.254.169.254` (AWS/cloud metadata endpoint)

---

## Rate Limit Guidance

| Endpoint Type             | Limit        | Notes                               |
| ------------------------- | ------------ | ----------------------------------- |
| General listing endpoints | 10 req/min   | Rolling window                      |
| Search endpoints          | ~3-5 req/min | More restrictive                    |
| WebFetch built-in cache   | 15-min TTL   | Repeated calls to same URL are free |

**Safe multi-call pattern:** Add 1-2 second delays between calls. Use `limit=25` to get enough results per call without needing rapid pagination.

---

## Response Structure

**Post listing (`data.children[].data`):**

```json
{
  "id": "abc123",
  "title": "Post title here",
  "selftext": "Post body text",
  "url": "https://www.reddit.com/r/sub/comments/abc123/...",
  "author": "username",
  "score": 42,
  "num_comments": 10,
  "created_utc": 1234567890,
  "subreddit": "subredditname"
}
```

**Comments response:** Array of two elements — `[0]` is the post, `[1]` is the comment tree.

---

## Usage Examples

### Search a subreddit for a topic

```
Invoke: WebFetch
URL: https://www.reddit.com/r/MachineLearning/search.json?q=transformer+architecture&restrict_sr=1&limit=10
Headers: User-Agent: agent-studio-reddit-researcher/1.0
```

### Get hot posts from a subreddit

```
Invoke: WebFetch
URL: https://www.reddit.com/r/programming/hot.json?limit=25
Headers: User-Agent: agent-studio-reddit-researcher/1.0
```

### Fetch a specific post with comments

```
Invoke: WebFetch
URL: https://www.reddit.com/r/programming/comments/abc123.json
Headers: User-Agent: agent-studio-reddit-researcher/1.0
```

### Global Reddit search

```
Invoke: WebFetch
URL: https://www.reddit.com/search.json?q=claude+code+agent&limit=25
Headers: User-Agent: agent-studio-reddit-researcher/1.0
```

---

## Anti-Patterns

| Anti-Pattern                               | Why It Fails                                           | Correct Approach                                                |
| ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| Fetching reddit.com without `.json` suffix | Returns HTML, not structured data                      | Always append `.json` to the URL path                           |
| Using regex to validate URLs               | Fails on encoded/normalized URLs; SSRF bypass possible | Use `new URL(href).hostname` and check against allowlist Set    |
| No User-Agent header                       | Reddit blocks anonymous requests; returns 429 or HTML  | Always include `User-Agent: agent-studio-reddit-researcher/1.0` |
| Rapid successive requests (>10/min)        | Rate limit triggers 429 responses                      | Add 1-2s delays; use `limit=100` to reduce call count           |
| Attempting write operations                | Reddit's public JSON API is read-only without OAuth    | Use only GET endpoints; never attempt POST/PUT/DELETE           |

---

## Enforcement Hooks

- **Pre-execute** (`hooks/pre-execute.cjs`): Validates input schema (AJV) and checks SSRF allowlist on any url field. Exits with code `2` on violation (fail-closed).
- **Post-execute** (`hooks/post-execute.cjs`): Emits observability event via `send-event.cjs`. Fails open (exit `0`) on error to avoid blocking skill execution.

---

## Memory Protocol (MANDATORY)

**Before starting:**

```bash
cat .claude/context/memory/learnings.md
```

**After completing:**

- New Reddit API pattern -> `.claude/context/memory/learnings.md`
- Issue found (rate limit, API change) -> `.claude/context/memory/issues.md`
- Decision made -> `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it is not in memory, it did not happen.
