# Atlassian Integration Research Requirements (2026)

## Verified Tech Stack

- **Jira API**: REST API v3 with ADF document format
- **Confluence API**: REST API for page/content management
- **Bitbucket API**: REST API v2 for repository operations
- **Authentication**: API tokens with Basic auth

## Authentication Setup

### Generate API Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Label descriptively (e.g., "agent-studio-automation")
4. Store in `.env` as ATLASSIAN_API_TOKEN

### Environment Variables

```
ATLASSIAN_DOMAIN=your-domain.atlassian.net
ATLASSIAN_EMAIL=your-email@example.com
ATLASSIAN_API_TOKEN=your-api-token
```

## API Patterns

### Jira Issue Creation (ADF Format)

```json
{
  "fields": {
    "project": { "key": "PROJECT" },
    "summary": "Issue summary",
    "description": {
      "type": "doc",
      "version": 1,
      "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Description" }] }]
    },
    "issuetype": { "name": "Task" }
  }
}
```

### JQL Query Examples

```
project=PROJECT AND status='In Progress'
assignee=currentUser() AND updated>-7d
issuetype=Epic AND project=PROJECT
```

## MCP Server Configuration

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": ["-y", "@atlassian/mcp-atlassian"],
      "env": {
        "ATLASSIAN_DOMAIN": "your-domain.atlassian.net",
        "ATLASSIAN_EMAIL": "your-email@example.com",
        "ATLASSIAN_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Source References

- [Jira REST API v3](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Confluence REST API](https://developer.atlassian.com/cloud/confluence/rest/)
- [Bitbucket API v2](https://developer.atlassian.com/cloud/bitbucket/rest/)
