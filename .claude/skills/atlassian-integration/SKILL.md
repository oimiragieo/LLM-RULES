---
name: atlassian-integration
description: Atlassian ecosystem integration covering Jira project management, Confluence documentation, Bitbucket source control, and cross-product automation workflows
version: 1.0.0
category: productivity
tools:
  - Bash
  - WebFetch
  - Read
  - Write
---

# Atlassian Integration Skill

## Overview

This skill provides comprehensive integration with the Atlassian ecosystem including Jira, Confluence, and Bitbucket. Use it for project management automation, documentation workflows, and source control operations.

## Authentication Setup

### API Token Authentication

```bash
# Set environment variables
export ATLASSIAN_DOMAIN="your-domain.atlassian.net"
export ATLASSIAN_EMAIL="your-email@example.com"
export ATLASSIAN_API_TOKEN="your-api-token"

# Test authentication
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/myself" | jq '.displayName'
```

### Generate API Token

1. Go to <https://id.atlassian.com/manage-profile/security/api-tokens>
2. Click "Create API token"
3. Label it descriptively (e.g., "agent-studio-automation")
4. Copy and store securely in `.env`

## Jira Operations

### Issue Management

```bash
# Get issue details
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/issue/PROJECT-123" | jq '.'

# Create issue
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/issue" \
  -d '{
    "fields": {
      "project": {"key": "PROJECT"},
      "summary": "Issue summary",
      "description": {
        "type": "doc",
        "version": 1,
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Description"}]}]
      },
      "issuetype": {"name": "Task"},
      "priority": {"name": "Medium"},
      "assignee": {"accountId": "account-id"}
    }
  }'

# Update issue
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X PUT \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/issue/PROJECT-123" \
  -d '{"fields": {"summary": "Updated summary", "priority": {"name": "High"}}}'

# Search issues with JQL
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/search?jql=project=PROJECT+AND+status='In+Progress'&maxResults=50" | jq '.issues[].key'

# Add comment
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/issue/PROJECT-123/comment" \
  -d '{
    "body": {
      "type": "doc",
      "version": 1,
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Comment text"}]}]
    }
  }'
```

### Issue Transitions

```bash
# Get available transitions
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/issue/PROJECT-123/transitions" | jq '.transitions[] | {id, name}'

# Transition issue (e.g., move to Done)
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/issue/PROJECT-123/transitions" \
  -d '{"transition": {"id": "31"}}'
```

### Sprint Management

```bash
# Get board sprints (requires Jira Software)
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/rest/agile/1.0/board/BOARD_ID/sprint?state=active" | jq '.'

# Move issues to sprint
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/rest/agile/1.0/sprint/SPRINT_ID/issue" \
  -d '{"issues": ["PROJECT-123", "PROJECT-124"]}'
```

### Epic and Story Hierarchy

```bash
# Get epics for project
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/search?jql=project=PROJECT+AND+issuetype=Epic" | jq '.issues[] | {key: .key, summary: .fields.summary}'

# Link issues (parent/child, blocks, etc.)
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/rest/api/3/issueLink" \
  -d '{
    "type": {"name": "Blocks"},
    "inwardIssue": {"key": "PROJECT-123"},
    "outwardIssue": {"key": "PROJECT-124"}
  }'
```

## Confluence Operations

### Page Management

```bash
# Get space pages
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/wiki/rest/api/content?spaceKey=SPACE&type=page&limit=25" | jq '.results[] | {id, title}'

# Create page
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/wiki/rest/api/content" \
  -d '{
    "type": "page",
    "title": "Page Title",
    "space": {"key": "SPACE"},
    "body": {
      "storage": {
        "value": "<p>Page content in HTML</p>",
        "representation": "storage"
      }
    }
  }'

# Update page (requires current version number)
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X PUT \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/wiki/rest/api/content/PAGE_ID" \
  -d '{
    "type": "page",
    "title": "Updated Title",
    "version": {"number": 2},
    "body": {
      "storage": {
        "value": "<p>Updated content</p>",
        "representation": "storage"
      }
    }
  }'

# Search pages
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/wiki/rest/api/content/search?cql=space=SPACE+AND+title~'search+term'" | jq '.'
```

### Confluence Macros and Templates

```bash
# Create page from template
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/wiki/rest/api/content" \
  -d '{
    "type": "page",
    "title": "Meeting Notes 2024-01-15",
    "space": {"key": "SPACE"},
    "ancestors": [{"id": "PARENT_PAGE_ID"}],
    "body": {
      "storage": {
        "value": "<ac:structured-macro ac:name=\"info\"><ac:rich-text-body><p>Meeting notes content</p></ac:rich-text-body></ac:structured-macro>",
        "representation": "storage"
      }
    }
  }'
```

## Bitbucket Operations

### Repository Management

```bash
# List repositories
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://api.bitbucket.org/2.0/repositories/WORKSPACE" | jq '.values[] | {name: .name, clone: .links.clone}'

# Create pull request
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST \
  -H "Content-Type: application/json" \
  "https://api.bitbucket.org/2.0/repositories/WORKSPACE/REPO/pullrequests" \
  -d '{
    "title": "Feature: Add new capability",
    "description": "PR description",
    "source": {"branch": {"name": "feature-branch"}},
    "destination": {"branch": {"name": "main"}},
    "reviewers": [{"account_id": "reviewer-account-id"}]
  }'

# Get PR status
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://api.bitbucket.org/2.0/repositories/WORKSPACE/REPO/pullrequests/PR_ID" | jq '{state, title, author}'
```

## MCP Server Configuration

### Setup atlassian MCP Server

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

Add to `.claude/settings.json` under `mcpServers` for agent-studio integration.

### Available MCP Tools (after setup)

- `jira_get_issue` — Retrieve issue details by key
- `jira_create_issue` — Create new Jira issue
- `jira_update_issue` — Update issue fields
- `jira_search_issues` — JQL-based search
- `jira_transition_issue` — Move issue through workflow
- `confluence_get_page` — Retrieve Confluence page
- `confluence_create_page` — Create new page
- `confluence_update_page` — Update existing page
- `confluence_search` — CQL-based content search

## Cross-Product Workflows

### Dev-to-Jira Automation

```bash
# Extract Jira issue key from git branch and update status
BRANCH=$(git branch --show-current)
ISSUE_KEY=$(echo "$BRANCH" | grep -oP '[A-Z]+-[0-9]+')

if [ -n "$ISSUE_KEY" ]; then
  # Move to In Progress when branch is created
  TRANSITION_ID=$(curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
    "https://$ATLASSIAN_DOMAIN/rest/api/3/issue/$ISSUE_KEY/transitions" | \
    jq -r '.transitions[] | select(.name == "In Progress") | .id')

  curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
    -X POST -H "Content-Type: application/json" \
    "https://$ATLASSIAN_DOMAIN/rest/api/3/issue/$ISSUE_KEY/transitions" \
    -d "{\"transition\": {\"id\": \"$TRANSITION_ID\"}}"

  echo "Moved $ISSUE_KEY to In Progress"
fi
```

### Confluence Doc Generation from Jira Sprint

```bash
# Generate sprint report page in Confluence
SPRINT_ID="123"
SPACE_KEY="TEAM"

# Get sprint issues
ISSUES=$(curl -s -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  "https://$ATLASSIAN_DOMAIN/rest/agile/1.0/sprint/$SPRINT_ID/issue" | \
  jq -r '.issues[] | "- [\(.key)] \(.fields.summary) — \(.fields.status.name)"' | \
  sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')

# Create Confluence page with sprint summary
curl -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
  -X POST -H "Content-Type: application/json" \
  "https://$ATLASSIAN_DOMAIN/wiki/rest/api/content" \
  -d "{
    \"type\": \"page\",
    \"title\": \"Sprint $SPRINT_ID Report\",
    \"space\": {\"key\": \"$SPACE_KEY\"},
    \"body\": {
      \"storage\": {
        \"value\": \"<h2>Sprint Issues</h2><p>$ISSUES</p>\",
        \"representation\": \"storage\"
      }
    }
  }"
```

## Error Handling

```bash
# Robust API call with error handling
atlassian_api() {
  local method="$1"
  local endpoint="$2"
  local data="$3"

  local response
  response=$(curl -s -w "\n%{http_code}" \
    -u "$ATLASSIAN_EMAIL:$ATLASSIAN_API_TOKEN" \
    -X "$method" \
    -H "Content-Type: application/json" \
    ${data:+-d "$data"} \
    "https://$ATLASSIAN_DOMAIN$endpoint")

  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | head -n -1)

  if [[ "$http_code" -ge 400 ]]; then
    echo "ERROR: HTTP $http_code — $(echo "$body" | jq -r '.errorMessages[]? // .message // "Unknown error"')" >&2
    return 1
  fi

  echo "$body"
}

# Usage
atlassian_api GET "/rest/api/3/issue/PROJECT-123"
atlassian_api POST "/rest/api/3/issue" '{"fields": {...}}'
```

## Rate Limiting

- Jira Cloud: 10 requests/second per user
- Confluence: 10 requests/second per user
- Implement exponential backoff for 429 responses

```bash
# Retry with backoff
retry_api() {
  local max_attempts=3
  local attempt=1
  local wait=1

  while [ $attempt -le $max_attempts ]; do
    if atlassian_api "$@"; then
      return 0
    fi
    echo "Attempt $attempt failed. Retrying in ${wait}s..." >&2
    sleep $wait
    wait=$((wait * 2))
    attempt=$((attempt + 1))
  done

  echo "All attempts failed" >&2
  return 1
}
```

## Best Practices

1. **Use JQL efficiently** — Filter server-side, not client-side. Add project/assignee/sprint constraints.
2. **Batch operations** — Use bulk update endpoints when modifying multiple issues.
3. **Store issue keys** — Always reference issues by key (PROJECT-123), not internal ID.
4. **ADF for descriptions** — Jira v3 API uses Atlassian Document Format (ADF), not plain text or wiki markup.
5. **Webhook subscriptions** — For real-time updates, register webhooks instead of polling.
6. **Service accounts** — Use dedicated service account API tokens for automation, not personal tokens.
7. **Field customization** — Custom fields use IDs like `customfield_10001` — query `/rest/api/3/field` to discover them.

## Related Skills

- `devops` — CI/CD pipeline integration
- `github-ops` — GitHub alternative for source control
- `azure-devops` — Microsoft DevOps platform alternative
