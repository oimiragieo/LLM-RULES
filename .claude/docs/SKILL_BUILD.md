# Skill Build System Documentation

**Version:** 1.0.0
**Last Updated:** 2026-01-30
**Status:** Active

## Overview

The Skill Build System is a TypeScript-based compilation pipeline that transforms individual skill rule files into consolidated `AGENTS.md` documents. It provides validation, test extraction, and migration capabilities for managing structured skill knowledge.

## Architecture

### Components

```
.claude/lib/skill-build/
├── src/
│   ├── build.ts           # Main compilation engine
│   ├── parser.ts          # Markdown frontmatter parser
│   ├── config.ts          # Skill configuration registry
│   ├── validate.ts        # Rule structure validator
│   ├── extract-tests.ts   # Test case extraction
│   ├── migrate.ts         # Migration utilities
│   └── types.ts           # TypeScript type definitions
├── dist/                  # Compiled output (gitignored)
└── tsconfig.json          # TypeScript configuration
```

### Workflow

```
Individual Rule Files (.md)
         ↓
   Parser (frontmatter + sections)
         ↓
   Validator (structure checks)
         ↓
   Builder (generate AGENTS.md)
         ↓
   Test Extractor (test-cases.json)
```

## File Structure

### Rule File Template

```markdown
---
title: Rule Title
impact: HIGH
tags: tag1, tag2
---

## Rule Title

Concise description of the rule.

## Explanation

Detailed explanation of why this rule exists and when to apply it.

**Bad:**
```typescript
// Incorrect example
const bad = "example";
```

**Good:**
```typescript
// Correct example
const good = "example";
```

## Impact: HIGH

Performance/security/maintainability implications.

## References

- [Reference 1](https://example.com)
```

### Required Fields

**Frontmatter:**
- `title` (string): Rule title
- `impact` (CRITICAL | HIGH | MEDIUM | LOW): Severity level

**Sections:**
- `## Explanation`: Why the rule exists
- `**Bad:**` or `**Incorrect:**`: Anti-pattern example
- `**Good:**` or `**Correct:**`: Recommended pattern

## Configuration

### Skill Registration

Skills are registered in `.claude/lib/skill-build/src/config.ts`:

```typescript
export const SKILLS = {
  'react-best-practices': {
    name: 'react-best-practices',
    title: 'React Best Practices',
    description: 'Performance and best practices for React applications',
    skillDir: path.join(PROJECT_ROOT, '.claude/skills/react-best-practices-vercel'),
    rulesDir: path.join(PROJECT_ROOT, '.claude/skills/react-best-practices-vercel/rules'),
    metadataFile: path.join(PROJECT_ROOT, '.claude/skills/react-best-practices-vercel/metadata.json'),
    outputFile: path.join(PROJECT_ROOT, '.claude/skills/react-best-practices-vercel/AGENTS.md'),
    sectionMap: {
      1: ['async-', 'waterfall-'],
      2: ['bundle-'],
      3: ['server-side-'],
      // ... more sections
    }
  }
};
```

### Section Mapping

Section maps determine rule categorization based on filename prefixes:

```typescript
sectionMap: {
  1: ['async-', 'waterfall-'],  // Section 1: Async patterns
  2: ['bundle-'],               // Section 2: Bundle optimization
  3: ['server-side-']           // Section 3: Server-side rendering
}
```

## npm Scripts

```bash
# Build all skills into AGENTS.md
npm run skill:build

# Validate rule structure
npm run skill:validate

# Extract test cases from examples
npm run skill:extract-tests

# Migrate monolithic AGENTS.md to individual rules
npm run skill:migrate
```

## Validation

### Pre-commit Hook

The `rule-validator.cjs` hook validates rules on `Write`/`Edit` operations:

**Location:** `.claude/hooks/skills/rule-validator.cjs`

**Checks:**
- Frontmatter presence and format
- Required fields (title, impact)
- Valid impact levels
- Title heading (`##`)
- Explanation section
- Bad/incorrect example
- Good/correct example

**Enforcement Mode:** `block` (prevents invalid writes)

### CI/CD Workflow

**Location:** `.github/workflows/skill-build-validate.yml`

**Triggers:**
- Pull requests modifying `.claude/skills/**`
- Pushes to `main` branch

**Steps:**
1. TypeScript compilation check
2. Rule structure validation
3. Test case extraction
4. Skills build

## Test Extraction

The test extraction system generates `test-cases.json` from rule examples:

```json
{
  "testCases": [
    {
      "rule": "async-state-updates",
      "type": "bad",
      "code": "const [state, setState] = useState(0); ..."
    },
    {
      "rule": "async-state-updates",
      "type": "good",
      "code": "setState(prev => prev + 1); ..."
    }
  ]
}
```

## Migration Workflow

For migrating monolithic `AGENTS.md` to individual rule files:

```bash
npm run skill:migrate
```

**Process:**
1. Parse existing `AGENTS.md`
2. Extract individual rules
3. Generate frontmatter from content
4. Write individual `.md` files to `rules/` directory
5. Create metadata.json

## Development Workflow

### Adding a New Skill

1. **Create skill directory:**
   ```bash
   mkdir -p .claude/skills/my-skill/rules
   ```

2. **Register in config.ts:**
   ```typescript
   'my-skill': {
     name: 'my-skill',
     title: 'My Skill',
     skillDir: path.join(PROJECT_ROOT, '.claude/skills/my-skill'),
     rulesDir: path.join(PROJECT_ROOT, '.claude/skills/my-skill/rules'),
     outputFile: path.join(PROJECT_ROOT, '.claude/skills/my-skill/AGENTS.md'),
     sectionMap: { 1: ['rule-prefix-'] }
   }
   ```

3. **Create rule files:**
   ```bash
   touch .claude/skills/my-skill/rules/rule-prefix-my-rule.md
   ```

4. **Validate and build:**
   ```bash
   npm run skill:validate
   npm run skill:build
   ```

### Modifying an Existing Rule

1. Edit rule file in `rules/` directory
2. Pre-commit hook validates on save
3. Run `npm run skill:build` to regenerate `AGENTS.md`
4. Commit changes (both rule file and AGENTS.md)

## Troubleshooting

### Common Errors

**Error: "Missing frontmatter"**
- Ensure `---` delimiters are on separate lines
- Verify YAML syntax (key: value)

**Error: "Invalid impact level"**
- Use only: CRITICAL, HIGH, MEDIUM, LOW
- Check for typos and case sensitivity

**Error: "Missing bad/incorrect example"**
- Add `**Bad:**` or `**Incorrect:**` label
- Include code block with triple backticks

**Error: "TypeScript compilation failed"**
- Run `npm install` to ensure dependencies are installed
- Check `tsconfig.json` for errors
- Verify `.ts` file syntax

### Debugging

**Enable verbose logging:**
```bash
DEBUG=skill-build:* npm run skill:build
```

**Check TypeScript compilation:**
```bash
npx tsc --project .claude/lib/skill-build/tsconfig.json --noEmit
```

**Validate individual rule:**
```bash
node -e "const { validateRuleFile } = require('./.claude/hooks/skills/rule-validator.cjs'); console.log(validateRuleFile('.claude/skills/my-skill/rules/my-rule.md'));"
```

## Best Practices

1. **Rule Naming:** Use descriptive prefixes matching section maps
2. **Impact Levels:** Assign consistently across similar rules
3. **Examples:** Provide realistic, executable code snippets
4. **Explanations:** Focus on "why" not "what"
5. **References:** Link to authoritative sources (docs, RFCs, benchmarks)

## Future Enhancements

- [ ] Automated impact level inference from examples
- [ ] Cross-rule dependency tracking
- [ ] Rule effectiveness metrics (usage in CUJs)
- [ ] Visual rule browser UI
- [ ] Integration with skill-creator workflow

## Related Documentation

- **Developer Workflow:** `.claude/docs/DEVELOPER_WORKFLOW.md`
- **File Placement Rules:** `.claude/docs/FILE_PLACEMENT_RULES.md`
- **Skill Creator:** `.claude/skills/skill-creator/SKILL.md`
- **Agent Skills Integration Plan:** `.claude/context/artifacts/plans/agent-skills-integration-plan.md`

## Support

For issues or questions, consult:

- Memory learnings: `.claude/context/memory/learnings.md`
- Integration plan: `.claude/context/artifacts/plans/agent-skills-integration-plan.md`
- Framework documentation: `.claude/CLAUDE.md`
