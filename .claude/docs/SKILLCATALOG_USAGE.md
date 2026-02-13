# SkillCatalog Usage Guide

## Purpose

`SkillCatalog` enables runtime skill discovery so agents can find relevant skills without preloading the full catalog.

## API Surface

Module: `.claude/lib/tools/skill-catalog.cjs`

Exports:

- `SkillCatalog(options)`
- `SkillCatalogQuery`

## Query Options

- `domain`: filter by skill domain
- `category`: filter by category
- `agentType`: prioritize skills recommended for a specific agent type
- `tags`: array filter (AND semantics)
- `limit`: integer 1-50 (default 10)

## Example

```javascript
const { SkillCatalog } = require('.claude/lib/tools/skill-catalog.cjs');

const result = SkillCatalog({
  domain: 'testing',
  tags: ['tdd', 'verification'],
  limit: 5,
});
```

## Response Contract

Success response:

- `success: true`
- `skills: []`
- `count: number`
- `query: object`

No-match response:

- `success: false`
- `skills: []`
- `count: 0`
- `suggestions.alternatives[]`
- `suggestions.availableDomains[]`
- `suggestions.availableCategories[]`

## Caching Behavior

- In-memory cache with TTL (default 5 minutes)
- Bounded cache size (default 100 entries)
- Cached no-match responses included

## Operational Guidance

- Prefer pre-injected role skills first for common cases.
- Use `SkillCatalog` when task scope changes or requires less common capabilities.
- Keep queries specific (domain + tags) to reduce token overhead.
