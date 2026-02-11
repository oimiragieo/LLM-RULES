---
paths:
  - .claude/skills/readme/**
---

# Readme Rules

## Core Principles

- README is the first impression - make it count
- Lead with value (what problem solved, why use this)
- Progressive disclosure: Quick start first, details later
- Show working examples, not just descriptions
- Keep installation simple (complex setup gets separate docs)

## Standards

### README Structure

Use this standard structure:

```markdown
# Project Name

One-liner explaining what this project does.

## Features

- ✅ Feature 1 with emoji for visual interest
- ✅ Feature 2 with brief description
- ✅ Feature 3 - unique advantage

## Installation

### Requirements

- Dependency 1
- Dependency 2

### Steps

\`\`\`bash
pnpm install project-name
\`\`\`

## Quick Start

\`\`\`javascript
import { feature } from 'project-name';
const result = feature({ option: 'value' });
\`\`\`

## Documentation

[Link to detailed docs]

## Contributing

[How to contribute]

## License

[License information]
```

### Content Guidelines

- **Be specific**: Concrete examples, not vague superlatives
- **Show, don't tell**: Code examples and screenshots
- **Organize logically**: Group related information
- **Use formatting**: Headers, lists, code blocks for scannability
- **Keep installation simple**: One command if possible
- **Document dependencies**: List what's required upfront
- **Write for skimmers**: People scan, not read - use headers

### Quick Start Best Practices

- Keep to 5-10 lines of code maximum
- Make it copy-paste ready
- Show actual output or behavior
- Use realistic examples (not foo/bar)
- Progressive from simple to complex

## Anti-Patterns

| Pattern              | Problem                 | Fix                                       |
| -------------------- | ----------------------- | ----------------------------------------- |
| Wall of text         | Impossible to scan      | Use headers and lists                     |
| Missing setup        | Readers can't install   | Step-by-step instructions                 |
| No examples          | Unclear how to use      | Add working code examples                 |
| Outdated info        | Misleads users          | Update with releases                      |
| Too detailed         | Overwhelming            | Link to full docs instead                 |
| No table of contents | Hard to navigate        | Add section links at top                  |
| Broken links         | Poor user experience    | Test all external links                   |
| Marketing fluff      | Lacks substance         | Focus on what it does, not hype           |
| Vague descriptions   | "This library is great" | Specific: "Reduces API response time 40%" |

## Integration Points

**Related Skills**:

- `doc-generator` - Automated documentation from code
- `writing-skills` - Writing quality guidelines
- `technical-writer` - Professional documentation agent

**Related Agents**:

- `technical-writer` - Uses this skill for documentation
- `developer` - Writes README for new projects

**Related Workflows**:

- Documentation workflow - README generation phase
- Project onboarding - README is first touchpoint

## Quality Checklist

Before completing README, verify:

- [ ] Clear project purpose in first paragraph
- [ ] Installation instructions complete and tested
- [ ] Examples are runnable (copy-paste ready)
- [ ] Table of contents matches sections
- [ ] All links work (test external links)
- [ ] Formatting consistent
- [ ] No typos or grammar errors
- [ ] Screenshots included (if UI project)
- [ ] License specified
- [ ] Contributing guidelines present

## Memory Protocol (MANDATORY)

**Before starting:**
Read `.claude/context/memory/learnings.md`

**After completing:**

- New pattern → `.claude/context/memory/learnings.md`
- Issue found → `.claude/context/memory/issues.md`
- Decision made → `.claude/context/memory/decisions.md`

> ASSUME INTERRUPTION: If it's not in memory, it didn't happen.
