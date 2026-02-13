---
paths:
  - .claude/skills/project-onboarding/**
---

# Project Onboarding Rules

## Core Principles

- Onboarding creates persistent knowledge, not just session context
- Document project structure, build system, test commands explicitly
- Create named memory entries for project-specific patterns
- Agents should understand "how to work here" not just "what exists"
- Onboarding is iterative - update as project evolves

## Onboarding Checklist

### Phase 1: Structure Discovery

- [ ] Identify project type (monorepo, polyrepo, microservices)
- [ ] Map directory structure (src, tests, docs, config)
- [ ] Locate build configuration (package.json, pom.xml, Cargo.toml)
- [ ] Find test framework and test directory
- [ ] Identify CI/CD configuration (.github, .gitlab-ci.yml)

### Phase 2: Command Discovery

- [ ] Build command (pnpm build, cargo build, mvn package)
- [ ] Test command (pnpm test, pytest, go test)
- [ ] Lint command (pnpm lint, flake8, cargo clippy)
- [ ] Format command (prettier, black, rustfmt)
- [ ] Dev server command (if applicable)
- [ ] Deploy command (if applicable)

### Phase 3: Workflow Understanding

- [ ] Branching strategy (gitflow, trunk-based)
- [ ] Code review process
- [ ] Testing requirements
- [ ] Documentation standards
- [ ] Deployment process

### Phase 4: Persistent Memory Creation

- [ ] Create `.claude/context/memory/named/project-structure.md`
- [ ] Create `.claude/context/memory/named/build-commands.md`
- [ ] Create `.claude/context/memory/named/testing-workflow.md`
- [ ] Update `.claude/context/memory/learnings.md` with project patterns

## Standards

- Use `pnpm search:structure` for project overview
- Document commands with expected output
- Include common gotchas and workarounds
- Provide examples of typical workflows
- Update onboarding docs when project changes

## Onboarding Output Format

```markdown
# Project Onboarding: [Project Name]

## Quick Start

- Build: `[command]`
- Test: `[command]`
- Lint: `[command]`
- Dev: `[command]`

## Project Structure

[Directory tree with annotations]

## Key Technologies

- Framework: [e.g., React, FastAPI]
- Language: [e.g., TypeScript, Python]
- Package Manager: [e.g., pnpm, poetry]
- Test Framework: [e.g., Vitest, pytest]

## Development Workflow

1. [Step-by-step workflow]
2. [Include branch naming, commit format]

## Common Patterns

- [Pattern 1 with example]
- [Pattern 2 with example]

## Gotchas

- [Common mistake and how to avoid it]
```

## Anti-Patterns

- Assuming standard conventions without verification
- Skipping command testing (always run to verify)
- Not documenting platform-specific differences
- Forgetting to update onboarding when project evolves
- Creating onboarding once and never revisiting

## Integration Points

- **Named Memory API**: Store project-specific knowledge
- **Context-Driven Development**: Treat onboarding as managed artifact
- **Project-Onboarding Skill**: Systematic onboarding process
- **Memory Protocol**: Update learnings with project patterns
