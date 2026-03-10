# /reddit-researcher

Search and read public Reddit content using the unauthenticated JSON API.

## Usage

```
/reddit-researcher --action search --query "machine learning" --limit 10
/reddit-researcher --action subreddit --subreddit programming --limit 25
/reddit-researcher --action post --subreddit programming --postId abc123
```

## Actions

| Action      | Description                                  | Required Parameters       |
| ----------- | -------------------------------------------- | ------------------------- |
| `search`    | Search Reddit globally or within a subreddit | `--query`                 |
| `subreddit` | Fetch hot posts from a subreddit             | `--subreddit`             |
| `post`      | Fetch a specific post with its metadata      | `--subreddit`, `--postId` |

## Parameters

| Parameter     | Type    | Description                   | Constraints                               |
| ------------- | ------- | ----------------------------- | ----------------------------------------- |
| `--action`    | enum    | Action to perform             | Required. One of: search, subreddit, post |
| `--subreddit` | string  | Subreddit name (no r/ prefix) | Pattern: `^[A-Za-z0-9_]{1,50}$`           |
| `--query`     | string  | Search query text             | Max 200 characters                        |
| `--postId`    | string  | Reddit post ID                | Pattern: `^[a-z0-9]{4,10}$`               |
| `--limit`     | integer | Max results                   | 1-25 (default: 10)                        |

## Invocation via Skill tool

```javascript
Skill({ skill: 'reddit-researcher' });
// Then use WebFetch directly with validated URLs:
// https://www.reddit.com/r/{subreddit}/search.json?q={query}&restrict_sr=1&limit=10
```

## Security

All URLs are validated against SSRF allowlist before fetching:

- `reddit.com`
- `www.reddit.com`
- `old.reddit.com`

## Notes

- No API key or authentication required
- Rate limit: 10 req/min unauthenticated (search: ~3-5 req/min)
- WebFetch has 15-min cache — repeated calls to same URL are free
- Always include `User-Agent: agent-studio-reddit-researcher/1.0` header
