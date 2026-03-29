# atlassian-integration Implementation Template

## Goal

- Integrate with Jira for work item management
- Integrate with Confluence for documentation
- Integrate with Bitbucket for source control

## TDD

1. Red - Write tests for API authentication and CRUD operations
2. Green - Implement Jira, Confluence, Bitbucket clients
3. Refactor - Add rate limiting, error handling, retry logic

## Verification

- lint
- format
- targeted tests
- API integration tests (with test project)

## Implementation Checklist

1. Set up authentication with API tokens
2. Implement Jira issue CRUD operations
3. Implement JQL query support
4. Implement Confluence page management
5. Implement Bitbucket PR operations
6. Add cross-product workflow helpers
