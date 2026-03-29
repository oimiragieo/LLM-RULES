# Reddit Researcher Research Requirements (2026)

## Verified Tech Stack

- **API**: Reddit Public JSON API (unauthenticated)
- **Endpoints**: `.json` suffix on all Reddit URLs
- **Rate Limits**: 10 requests/minute (unauthenticated), 3-5 req/min for search
- **User-Agent**: Required - use `agent-studio-reddit-researcher/1.0`

## Allowed Hostnames (SSRF Prevention)

- `reddit.com`
- `www.reddit.com`
- `old.reddit.com`

## Implementation Patterns

### Fetch Subreddit Posts

```javascript
const url = 'https://www.reddit.com/r/programming.json?limit=25';
const response = await fetch(url, {
  headers: { 'User-Agent': 'agent-studio-reddit-researcher/1.0' },
});
const data = await response.json();
```

### Fetch Post Comments

```javascript
const url = 'https://www.reddit.com/r/programming/comments/abc123/post_title.json';
const response = await fetch(url, {
  headers: { 'User-Agent': 'agent-studio-reddit-researcher/1.0' },
});
const [post, comments] = await response.json();
```

## Rate Limiting Strategy

- Add 6-12 second delays between requests
- For bulk operations, batch requests with timers
- Cache responses to avoid repeated fetches

## Source References

- [Reddit JSON API Documentation](https://www.reddit.com/dev/api)
- [Old Reddit JSON Format](https://old.reddit.com/wiki/json)
