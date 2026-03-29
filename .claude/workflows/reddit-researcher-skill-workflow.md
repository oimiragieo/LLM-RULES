# reddit-researcher Skill Workflow

1. Validate Reddit URL against hostname allowlist.
2. Append `.json` suffix for structured data.
3. Include User-Agent header in all requests.
4. Parse and extract relevant content.
5. Respect rate limits (10 req/min).
