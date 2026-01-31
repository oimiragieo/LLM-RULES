# SkillCatalog Tool - Agent Usage Guide

## What is SkillCatalog?

SkillCatalog is a runtime skill discovery tool. Instead of agents receiving a fixed list of skills at spawn time, agents can query available skills dynamically based on their current needs.

## When to Use SkillCatalog

### Use Pre-Injected AVAILABLE_SKILLS (Phase 1) When:
- Agent has a clear role (developer, researcher, etc)
- Skills are domain-specific and predictable
- Agent doesn't need flexibility
- Spawning quickly is priority

### Use SkillCatalog() (Phase 2) When:
- Agent needs to discover skills for a specific task
- Task domain is unknown at spawn time
- Agent should pick the best skill from options
- New skills should be instantly available

## How to Use SkillCatalog

### Basic Query - Find Skills by Domain
```javascript
const result = SkillCatalog({ domain: 'testing' });

if (result.success) {
  for (const skill of result.skills) {
    console.log(`${skill.name}: ${skill.description}`);
    // Invoke: Skill({ skill: skill.name });
  }
} else {
  console.log(result.suggestions.message);
}
```

### Advanced Query - Find Best Skill for Agent
```javascript
const result = SkillCatalog({
  domain: 'testing',
  agentType: 'developer',
  limit: 3
});

const recommended = result.skills.find(s => s.recommended);
Skill({ skill: recommended.name });
```

### Query by Tags
```javascript
// Find skills tagged with 'async' AND 'performance'
const result = SkillCatalog({
  tags: ['async', 'performance'],
  limit: 5
});
```

### Handle No Matches with Suggestions
```javascript
const result = SkillCatalog({ domain: 'nonexistent' });

if (!result.success) {
  console.log(result.suggestions.message);
  // Try an alternative query
  const alt = SkillCatalog(result.suggestions.alternatives[0]);
  Skill({ skill: alt.skills[0].name });
}
```

## Query Options

| Option | Type | Description | Example |
|--------|------|-------------|---------|
| domain | string | Filter by skill domain | 'testing', 'security', 'devops' |
| category | string | Filter by category | 'code-quality', 'architecture' |
| agentType | string | Filter by recommended agent type | 'developer', 'qa', 'researcher' |
| tags | string[] | Filter by tags (all must match) | ['tdd', 'async'] |
| limit | number | Max results (1-50) | 5 (default: 10) |

## Response Format

```javascript
{
  success: true/false,
  skills: [
    {
      name: 'tdd',
      domain: 'testing',
      category: 'test-driven-development',
      description: 'Test-driven development workflow',
      requiredTools: ['Read', 'Write', 'Edit', 'Bash'],
      tags: ['testing', 'tdd', 'red-green-refactor'],
      recommended: true  // True if recommended for your agent type
    }
  ],
  count: 5,
  query: { domain: 'testing' }
}
```

## Available Domains

Common domains for skill queries:
- testing, security, devops, code, research, data
- frontend, backend, mobile, database, ai-ml
- architecture, performance, documentation

Get complete list:
```javascript
const query = require('./.claude/lib/tools/skill-catalog.cjs').getInstance();
const filters = query.getAvailableFilters();
console.log(filters.domains);
```

## Best Practices

1. **Always check success**: `if (result.success)`
2. **Use domain + agentType**: Narrows results to relevant skills
3. **Handle no matches**: Provide fallback or use suggestions
4. **Combine with AVAILABLE_SKILLS**: Use pre-injected skills first, query if you need more
5. **Cache results**: Don't query for same criteria repeatedly

## Examples by Agent Type

### Developer Agent
```javascript
// Find testing skills
SkillCatalog({ domain: 'testing', agentType: 'developer' })

// Find code quality skills
SkillCatalog({ tags: ['code-quality'], limit: 3 })
```

### Researcher Agent
```javascript
// Find research skills
SkillCatalog({ domain: 'research', agentType: 'researcher' })

// Find synthesis skills
SkillCatalog({ tags: ['synthesis', 'analysis'] })
```

### Architect Agent
```javascript
// Find architecture skills
SkillCatalog({ domain: 'architecture', agentType: 'architect' })

// Find C4 model skills
SkillCatalog({ tags: ['c4'] })
```

## Troubleshooting

### "No skills found" Error
Try these alternatives:
1. Remove the most specific filter (e.g., remove domain)
2. Check available domains: `getInstance().getAvailableFilters()`
3. Use broader tag search

### Query Too Slow
- Caching is automatic (first query <500ms, subsequent <50ms)
- If still slow, reduce limit or check system load

### Skill Doesn't Appear
- Check it's in `.claude/context/artifacts/skill-catalog.md`
- Regenerate index: `npm run skills:index`
- Clear cache: `getInstance().clearCache()`

## Full API

```javascript
const { SkillCatalog, getInstance } = require('./.claude/lib/tools/skill-catalog.cjs');

// Query skills
SkillCatalog(options)

// Get filter metadata
getInstance().getAvailableFilters()

// Clear cache (for testing/debugging)
getInstance().clearCache()
```

## Phase 1 vs Phase 2 Comparison

| Aspect | Phase 1 (Static) | Phase 2 (Dynamic) |
|--------|-----------------|------------------|
| Skills available | 15-20 pre-injected | Query all 434+ |
| When decided | At spawn time | At task time |
| Flexibility | Fixed | Agent chooses |
| New skills | Require respin | Instant |
| Use case | General agents | Task-specific |

## Related Documentation

- CLAUDE.md Section 1.4 - Tool reference
- `.claude/lib/tools/skill-catalog.cjs` - Implementation
- `.claude/config/skill-index.json` - Skill index data
- `.claude/context/artifacts/skill-catalog.md` - Skill catalog

## Memory Protocol

When using SkillCatalog, follow the memory protocol:

**Before starting:**
```bash
cat .claude/context/memory/learnings.md
```

**After discovering new skill patterns:**
- Document useful skill combinations in learnings.md
- Note domain/agentType mappings that work well
- Record any edge cases or issues found

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
