# Research Requirements: github-ops

## Research Details

- **Date**: 2026-02-17
- **Query Intent**: Identify best practices for repository reconnaissance and structured API usage via GitHub CLI (gh).
- **Sources**:
  - GitHub REST API Documentation (Best Practices)
  - GitHub CLI (gh) Manual
  - GitHub Community Discussions

## Exa Findings

- **High-Confidence Keywords**: gh api, jq filtering, code search, repository structure, pagination.
- **Actionable Design Constraints**:
  1. **Structured Reconnaissance**: Use `gh api repos/{owner}/{repo}/contents` with `--jq` to list files before fetching content.
  2. **Token Efficiency**: Filter JSON responses to return only necessary fields (e.g., name, type, path).
  3. **Automated Pagination**: Use the `--paginate` flag for endpoints that return large lists (e.g., issues, PRs).
- **Non-Goals**:
  - Do not implement complex local caching (assume session-level persistence).
  - Do not provide exhaustive wrappers for all 100+ API endpoints; focus on reconnaissance.

## Actionable Design Constraints

1. **Tooling**: Always prioritize `gh api` for reconnaissance over blind `Read` or `WebFetch` of raw files.
2. **Workflow**: Implement a `Map -> Identify -> Fetch` sequence.
3. **Guardrails**: Block Linux-specific path constructs (e.g., /dev/stdin) in Windows environments.
