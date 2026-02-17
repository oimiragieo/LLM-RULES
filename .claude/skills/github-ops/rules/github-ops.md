# Operating Rules: github-ops

1.  **Reconnaissance-First**: Always list directory contents via `gh api` before attempting to read specific files.
2.  **Filter Aggressively**: Use the `--jq` flag to select only relevant metadata (name, type, size) to keep the context clean.
3.  **Placeholders**: Use `{owner}`, `{repo}`, and `{branch}` placeholders in API endpoints; the CLI will automatically resolve them if in a git directory.
4.  **No Linux Paths**: Never use `/dev/stdin` or Linux-style absolute paths in `gh` commands when on Windows.
5.  **Output Redirection**: For large API responses, redirect output to a temporary file instead of outputting directly to the prompt.
6.  **Pagination**: Always use `--paginate` for endpoints known to return large collections (e.g., repository contents with 50+ items).
