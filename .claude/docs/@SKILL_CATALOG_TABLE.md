# Workflow Enhancement Skills

**Source:** CLAUDE.md Section 8.5
**Version:** v2.2.1
**Last Updated:** 2026-01-31

---

## PURPOSE

Complete catalog of 30+ workflow enhancement skills available via `Skill()` tool for improving agent workflows, testing, research, and development processes.

---

## CONTENT

| Skill                                | When to Use                                                |
| ------------------------------------ | ---------------------------------------------------------- |
| `project-onboarding`                 | unfamiliar codebase                                        |
| `thinking-tools`                     | self-reflection at critical phases                         |
| `operational-modes`                  | regulate tool usage                                        |
| `summarize-changes`                  | after non-trivial coding                                   |
| `session-handoff`                    | before ending long sessions                                |
| `interactive-requirements-gathering` | structured user input                                      |
| `smart-revert`                       | revert logical work units (git notes-based, feature-level) |
| `codebase-integration`               | integrating external codebases                             |
| `artifact-lifecycle`                 | manage artifact updates/deprecation                        |
| `workflow-creator`                   | create multi-agent workflows                               |
| `template-creator`                   | create templates                                           |
| `schema-creator`                     | create JSON schemas                                        |
| `hook-creator`                       | create safety/validation hooks                             |
| `spec-init`                          | unified spec creation (progressive disclosure)             |
| `spec-gathering`                     | start new features                                         |
| `spec-writing`                       | formal specs                                               |
| `spec-critique`                      | validate specs                                             |
| `complexity-assessment`              | analyze complexity                                         |
| `insight-extraction`                 | capture learnings                                          |
| `qa-workflow`                        | systematic test/fix loops                                  |
| `ripgrep`                            | enhanced search for .mjs/.cjs/.mts/.cts                    |
| `chrome-browser`                     | browser automation/testing                                 |
| `arxiv-mcp`                          | arXiv search/retrieve                                      |
| `checklist-generator`                | quality checklists (IEEE + contextual)                     |
| `progressive-disclosure`             | gather requirements (3-5 clarifications)                   |
| `template-renderer`                  | render templates with token replacement                    |
| `task-breakdown`                     | break plans into Epic→Story→Task lists                     |
| `tdd`                                | test-driven development workflow                           |
| `debugging`                          | systematic debugging approach                              |
| `git-expert`                         | token-efficient git operations                             |
| `security-architect`                 | OWASP Top 10, threat modeling                              |
| `context-compressor`                 | reduce token usage while preserving context                |
| `verification-before-completion`     | evidence-based completion gates                            |
| `code-analyzer`                      | static code analysis and metrics                           |
| `code-quality-expert`                | clean code, style guides, refactoring                      |
| `code-style-validator`               | programmatic style validation (AST-based)                  |
| `commit-validator`                   | Conventional Commits validation                            |

### Skill Discovery

**Skill Catalog Location:** `.claude/context/artifacts/catalogs/skill-catalog.md`

**Discovery Process:**

1. Read catalog
2. Search by category or keyword
3. Invoke with: `Skill({ skill: "<skill-name>" })`

### Invocation Pattern

```javascript
// CORRECT: Use Skill() tool
Skill({ skill: 'tdd' });
Skill({ skill: 'debugging' });

// WRONG: Reading skill files does NOT invoke them
Read('.claude/skills/tdd/SKILL.md');
```

---

## RELATED REFERENCES

- **@CREATOR_SKILLS_TABLE.md** - Creator skills (agent-creator, skill-creator, etc.)
- **@ENTERPRISE_WORKFLOWS.md** - Enterprise workflow paths
- **CLAUDE.md Section 7** - Skill Invocation Protocol

---

## BACK TO MAIN

See **CLAUDE.md** Section 8.5 for inline summary.
