# atlassian-integration Rules

## Purpose

Comprehensive integration with the Atlassian ecosystem (Jira, Confluence, Bitbucket) for project management automation, documentation workflows, and source control operations.

## Best Practices

- Use API token authentication, not password auth
- Store credentials in environment variables (ATLASSIAN_DOMAIN, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN)
- Use JQL for efficient Jira queries - filter server-side
- Use ADF (Atlassian Document Format) for Jira v3 API descriptions
- Implement exponential backoff for rate limiting (429 responses)
- Use service accounts for automation, not personal tokens

## Rate Limits

- Jira Cloud: 10 requests/second per user
- Confluence: 10 requests/second per user
- Always handle 429 responses with backoff

## Integration Points

- MCP server configuration for agent integration
- Cross-product workflows (dev-to-Jira automation)
- Sprint report generation in Confluence

## Related Skills

- `devops` — CI/CD pipeline integration
- `github-ops` — GitHub alternative for source control
- `azure-devops` — Microsoft DevOps platform alternative
