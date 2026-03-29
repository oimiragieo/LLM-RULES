# exa-monitor Implementation Template

## Goal

- Monitor web topics via Exa search
- Deduplicate and generate digest

## TDD

1. Load topics from env/config
2. Search via Exa MCP
3. Filter against seen URLs
4. Append to digest

## Verification

- New results appended
- No duplicates in digest
